'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import SegmentedButtons from '@/components/ui/SegmentedButtons'
import Alert from '@/components/ui/Alert'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { PhotoIcon } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import { collectDrop } from '@/lib/library/client/dropped'
import { ImportSession, type ImportFile, type ImportRoll, type Snapshot } from '@/lib/library/client/importSession'
import { shotDates } from '@/lib/library/rollHeader'
import { useAddCatalogItem, withCatalogItem } from './AddCatalogItem'
import RollDetailsForm, { EMPTY_DETAILS, type Catalog, type RollDetails } from './RollDetailsForm'

type PublishChoice = 'private' | 'all' | 'chosen'
type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

const LAST_CHOICE_KEY = 'library-import-publish-choice'
const EMPTY_SNAPSHOT: Snapshot = { importId: null, rolls: [], looseKeys: [], files: {}, refused: [], online: true }

interface Unfinished { id: string; filename: string; folder: string | null; state: 'UPLOADING' | 'FAILED'; error: string | null }
interface Storage { usedBytes: number; limitBytes: number | null }

/**
 * Bringing a lab delivery into the library: drop it, check the rolls, fill in
 * the details while it uploads, then say what to publish.
 */
export default function ImportPage() {
  const sessionRef = useRef<ImportSession | null>(null)
  const [session, setSession] = useState<ImportSession | null>(null)
  useEffect(() => {
    const created = new ImportSession()
    sessionRef.current = created
    setSession(created)
    return () => created.dispose()
  }, [])
  const snap = useSyncExternalStore(
    useCallback(listener => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.snapshot() ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  )
  const { toast } = useToast()

  const [catalog, setCatalog] = useState<Catalog>({ films: [], cameras: [], labs: [] })
  const [storage, setStorage] = useState<Storage | null>(null)
  const [unfinished, setUnfinished] = useState<Unfinished[]>([])
  const [suggested, setSuggested] = useState<Partial<RollDetails> | null>(null)
  const [details, setDetails] = useState<Record<string, RollDetails>>({})
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const addItem = useAddCatalogItem()
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState<ImportFile | null>(null)
  const [keptLookalikes, setKeptLookalikes] = useState<Set<string>>(new Set())
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // What the page needs before a drop: the catalog, storage, leftovers, suggestions.
  useEffect(() => {
    const load = async <T,>(url: string): Promise<T | null> => {
      const res = await fetch(url).catch(() => null)
      return res?.ok ? res.json() : null
    }
    void Promise.all([
      load<Catalog['films']>('/api/filmstocks'),
      load<Catalog['cameras']>('/api/cameras'),
      load<Catalog['labs']>('/api/labs'),
    ]).then(([films, cameras, labs]) => setCatalog({ films: films ?? [], cameras: cameras ?? [], labs: labs ?? [] }))
    void load<{ storage: Storage; unfinished: Unfinished[] }>('/api/library/imports').then(body => {
      if (!body) return
      setStorage(body.storage)
      setUnfinished(body.unfinished)
    })
    void load<{ filmStockId: string | null; cameraId: string | null; labId: string | null }>('/api/library/suggestions').then(body => {
      if (body && (body.filmStockId || body.cameraId || body.labId)) {
        setSuggested({ filmStockId: body.filmStockId ?? '', cameraId: body.cameraId ?? '', labId: body.labId ?? '' })
      }
    })
  }, [])

  // Leaving while files are still on their way loses them.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (sessionRef.current?.busy) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // Each roll's details exist from the moment the roll does.
  useEffect(() => {
    setDetails(prev => {
      const missing = snap.rolls.filter(r => !prev[r.key])
      if (!missing.length) return prev
      const next = { ...prev }
      for (const roll of missing) next[roll.key] = { ...EMPTY_DETAILS }
      return next
    })
  }, [snap.rolls])

  const saveRoll = useCallback((rollKey: string, value: RollDetails) => {
    clearTimeout(saveTimers.current.get(rollKey))
    saveTimers.current.set(rollKey, setTimeout(async () => {
      const current = sessionRef.current
      if (!current) return
      setSaveStates(s => ({ ...s, [rollKey]: 'saving' }))
      try {
        const id = await current.rollId(rollKey)
        if (!id) return
        const res = await fetch(`/api/library/rolls/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(detailsPayload(value)),
        })
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not save the details'))
        setSaveStates(s => ({ ...s, [rollKey]: 'saved' }))
      } catch (error) {
        setSaveStates(s => ({ ...s, [rollKey]: { error: error instanceof Error ? error.message : 'Could not save the details' } }))
      }
    }, 700))
  }, [])

  const changeDetails = useCallback((rollKey: string, patch: Partial<RollDetails>) => {
    setDetails(prev => {
      const value = { ...(prev[rollKey] ?? EMPTY_DETAILS), ...patch }
      saveRoll(rollKey, value)
      return { ...prev, [rollKey]: value }
    })
  }, [saveRoll])

  // A folder dropped again rejoins the roll it made before; its saved details
  // come with it, so the form never saves blanks over them.
  useEffect(() => {
    if (!session) return
    session.onRollAdopted = async (rollKey, rollId) => {
      const res = await fetch(`/api/library/rolls/${rollId}`).catch(() => null)
      if (!res?.ok) return
      const { roll } = await res.json()
      const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
      clearTimeout(saveTimers.current.get(rollKey))
      setDetails(prev => ({
        ...prev,
        [rollKey]: {
          filmStockId: text(roll.filmStockId), cameraId: text(roll.cameraId), labId: text(roll.labId),
          scannerModel: text(roll.scannerModel), shotFrom: text(roll.shotFrom), shotTo: text(roll.shotTo),
          developedAt: text(roll.developedAt), location: text(roll.location), ei: text(roll.ei), notes: text(roll.notes),
        },
      }))
      if (roll.title) session.renameRoll(rollKey, roll.title)
    }
  }, [session])

  // The scanner the files name is filled in for their roll, unless one is set.
  useEffect(() => {
    if (!session) return
    session.onScanner = (rollKey, model) => {
      setDetails(prev => {
        const current = prev[rollKey] ?? EMPTY_DETAILS
        if (current.scannerModel) return prev
        const value = { ...current, scannerModel: model }
        saveRoll(rollKey, value)
        return { ...prev, [rollKey]: value }
      })
    }
  }, [session, saveRoll])

  const applyToAll = (fromKey: string) => {
    const source = details[fromKey]
    if (!source) return
    for (const roll of snap.rolls) {
      if (roll.key === fromKey) continue
      const { scannerModel: _scanner, ...shared } = source
      void _scanner
      changeDetails(roll.key, shared)
    }
    toast('The same details are on every roll in this import', 'success')
  }

  const handleFiles = async (collected: Parameters<ImportSession['add']>[0]) => {
    await session?.add(collected)
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!session) return
    await handleFiles(await collectDrop(event.dataTransfer))
  }

  const files = Object.values(snap.files)
  const counts = {
    total: files.length,
    done: files.filter(f => f.phase === 'done').length,
    skipped: files.filter(f => f.phase === 'duplicate').length,
    failed: files.filter(f => f.phase === 'failed' || f.phase === 'refused').length,
    moving: files.filter(f => ['hashing', 'registering', 'uploading', 'completing'].includes(f.phase)).length,
    processing: files.filter(f => f.phase === 'processing').length,
  }
  const uploadable = files.filter(f => f.itemId && f.phase !== 'duplicate' && f.phase !== 'refused')

  // Storage as the server counts it, which includes files still on their way,
  // read again whenever a file is registered or finished.
  const registered = files.filter(f => f.itemId).length
  useEffect(() => {
    if (!registered && !counts.done) return
    const timer = setTimeout(() => {
      void fetch('/api/library/imports').then(r => (r.ok ? r.json() : null)).then(body => { if (body) setStorage(body.storage) }).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [registered, counts.done])

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const removePhoto = async (file: ImportFile) => {
    if (!file.photoId) return
    const res = await fetch(`/api/photos/${file.photoId}`, { method: 'DELETE' })
    if (!res.ok) { toast(await apiErrorMessage(res, 'Could not remove the photo'), 'error'); return }
    await session?.remove(file.key)
    toast('Removed', 'success')
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <ClientHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl mx-auto w-full py-10 px-4 sm:px-6">
        <PageHeader
          title="Import"
          description="Drop a delivery from your lab: folders, a zip or loose scans. Each folder becomes a roll, and everything stays private until you choose to publish."
        />

        {storage && <StorageMeter storage={storage} />}

        {unfinished.length > 0 && (
          <div className="mb-6 border border-neutral-800 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">
                  {unfinished.length === 1 ? '1 file from an earlier import did not finish' : `${unfinished.length} files from an earlier import did not finish`}
                </p>
                <p className="text-sm text-neutral-500">Drop them again and only these will upload. The rest of the delivery is skipped as already in your library.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setUnfinished([])}>Dismiss</Button>
            </div>
            <ul className="mt-3 max-h-32 overflow-y-auto text-xs text-neutral-400">
              {unfinished.map(u => (
                <li key={u.id} className="truncate">{u.folder ? `${u.folder}/` : ''}{u.filename}{u.error ? `: ${u.error}` : ''}</li>
              ))}
            </ul>
          </div>
        )}

        <DropZone dragging={dragging} setDragging={setDragging} onDrop={onDrop} onPicked={list => session?.addPicked(list)} />

        {!snap.online && (
          <Alert className="mt-4">You are offline. Uploads carry on by themselves when the connection is back.</Alert>
        )}

        {counts.total > 0 && (
          <p className="mt-6 text-sm text-neutral-400" aria-live="polite">
            {counts.total} {counts.total === 1 ? 'file' : 'files'}
            {counts.moving > 0 && <> · {counts.moving} uploading</>}
            {counts.processing > 0 && <> · {counts.processing} being made into photos</>}
            {counts.done > 0 && <> · {counts.done} in your library</>}
            {counts.skipped > 0 && <> · {counts.skipped} already there</>}
            {counts.failed > 0 && <> · <span className="text-brand">{counts.failed} need attention</span></>}
          </p>
        )}

        {snap.refused.length > 0 && (
          <details className="mt-4 border border-neutral-800 p-4 text-sm">
            <summary className="cursor-pointer text-neutral-300">
              {snap.refused.length === 1 ? '1 file was not imported' : `${snap.refused.length} files were not imported`}
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-neutral-500">
              {snap.refused.map((r, i) => <li key={i}><span className="text-neutral-300">{r.name}</span>: {r.reason}</li>)}
            </ul>
          </details>
        )}

        <div className="mt-6 space-y-6">
          {snap.rolls.map((roll, index) => (
            <RollCard
              key={roll.key}
              roll={roll}
              number={index + 1}
              rolls={snap.rolls}
              files={snap.files}
              selected={selected}
              toggle={toggle}
              details={details[roll.key] ?? EMPTY_DETAILS}
              saveState={saveStates[roll.key] ?? 'idle'}
              catalog={catalog}
              suggested={suggested}
              openByDefault={snap.rolls.length <= 3}
              onDetails={patch => changeDetails(roll.key, patch)}
              onApplyToAll={snap.rolls.length > 1 ? () => applyToAll(roll.key) : undefined}
              onAddNew={(type, typed) => addItem.start(type, typed, item => {
                setCatalog(c => withCatalogItem(c, type, item))
                changeDetails(roll.key, type === 'film' ? { filmStockId: item.id } : type === 'camera' ? { cameraId: item.id } : { labId: item.id })
              })}
              onRename={name => { session?.renameRoll(roll.key, name); void renameOnServer(session, roll.key, name) }}
              onMerge={intoKey => session?.mergeRolls(roll.key, intoKey)}
              session={session}
              keptLookalikes={keptLookalikes}
              onKeepLookalike={key => setKeptLookalikes(s => new Set(s).add(key))}
              onRemovePhoto={setConfirmRemovePhoto}
              clearSelection={() => setSelected(new Set())}
            />
          ))}
          {snap.looseKeys.length > 0 && (
            <section className="border border-neutral-800 p-4">
              <h2 className="mb-1 font-bold text-white">Loose photos</h2>
              <p className="mb-3 text-sm text-neutral-500">Not in any roll. Each keeps its own details, which you can edit in your library.</p>
              <FileGrid keys={snap.looseKeys} files={snap.files} selected={selected} toggle={toggle} session={session}
                keptLookalikes={keptLookalikes} onKeepLookalike={key => setKeptLookalikes(s => new Set(s).add(key))} onRemovePhoto={setConfirmRemovePhoto} />
            </section>
          )}
        </div>

        {uploadable.length > 0 && snap.importId && (
          <PublishStep importId={snap.importId} files={uploadable} />
        )}
      </main>
      <Footer />

      {addItem.dialog}
      <ConfirmDialog
        open={confirmRemovePhoto !== null}
        title="Remove this photo?"
        confirmLabel="Remove"
        onConfirm={async () => { if (confirmRemovePhoto) await removePhoto(confirmRemovePhoto); setConfirmRemovePhoto(null) }}
        onClose={() => setConfirmRemovePhoto(null)}
      >
        It is deleted from your library, original included. The photo it looks like stays.
      </ConfirmDialog>
    </div>
  )
}

async function renameOnServer(session: ImportSession | null, rollKey: string, title: string) {
  const id = await session?.rollId(rollKey)
  if (!id) return
  await fetch(`/api/library/rolls/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() || null }),
  }).catch(() => {})
}

/** The details as the roll route takes them: empty is null, EI a number. */
function detailsPayload(d: RollDetails) {
  const orNull = (v: string) => (v.trim() ? v.trim() : null)
  return {
    filmStockId: orNull(d.filmStockId), cameraId: orNull(d.cameraId), labId: orNull(d.labId),
    scannerModel: orNull(d.scannerModel), shotFrom: orNull(d.shotFrom), shotTo: orNull(d.shotTo),
    developedAt: orNull(d.developedAt), location: orNull(d.location), notes: orNull(d.notes),
    ei: d.ei ? Number(d.ei) : null,
  }
}

/** Storage used against the account's limit, or a plain total for accounts with none. */
function StorageMeter({ storage }: { storage: Storage }) {
  if (storage.limitBytes === null) {
    return <p className="mb-4 text-sm text-neutral-500">{formatBytes(storage.usedBytes)} stored · No storage limit</p>
  }
  const share = Math.min(1, storage.usedBytes / storage.limitBytes)
  const left = Math.max(0, storage.limitBytes - storage.usedBytes)
  const tight = share >= 0.9
  return (
    <div className="mb-4 max-w-md">
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-neutral-300">{formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} used</span>
        <span className={tight ? 'text-brand' : 'text-neutral-500'}>{formatBytes(left)} left</span>
      </div>
      <div
        className="mt-1.5 h-1.5 bg-neutral-800"
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={storage.limitBytes}
        aria-valuenow={storage.usedBytes}
      >
        <div className={`h-full ${tight ? 'bg-brand' : 'bg-neutral-400'}`} style={{ width: `${share * 100}%` }} />
      </div>
      {tight && <p className="mt-1.5 text-xs text-neutral-400">Files that would go over the limit are not imported.</p>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const noSubscription = () => () => {}

function DropZone({ dragging, setDragging, onDrop, onPicked }: {
  dragging: boolean
  setDragging: (v: boolean) => void
  onDrop: (e: React.DragEvent) => void
  onPicked: (files: FileList) => void
}) {
  // Phones cannot pick a folder or drop files; both are only offered where they work.
  const folders = useSyncExternalStore(
    noSubscription,
    () => 'webkitdirectory' in document.createElement('input') && window.matchMedia('(pointer: fine)').matches,
    () => false,
  )
  return (
    <div
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setDragging(false) }}
      className={`border-2 border-dashed p-8 text-center transition-all focus-within:border-brand focus-within:ring-1 focus-within:ring-brand
        ${dragging ? 'border-brand bg-brand/5' : 'border-neutral-700 hover:border-neutral-600'}`}
    >
      <div className="mx-auto mb-3 flex justify-center opacity-50"><PhotoIcon size={10} /></div>
      <p className="text-neutral-300">{folders ? 'Drop folders, a zip or scans here' : 'Add scans or a zip'}</p>
      <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, TIFF or HEIC, up to 1 GB each</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <label className="inline-flex h-12 cursor-pointer items-center bg-brand px-6 text-sm font-medium text-white hover:bg-brand-dark">
          <input type="file" multiple accept="image/*,.heic,.heif,.tif,.tiff,.zip" className="sr-only"
            onChange={e => { if (e.target.files) onPicked(e.target.files); e.target.value = '' }} />
          Choose files
        </label>
        {folders && (
          <label className="inline-flex h-12 cursor-pointer items-center border border-neutral-700 px-6 text-sm font-medium text-white hover:border-neutral-500">
            <input type="file" multiple className="sr-only"
              ref={el => { if (el) el.setAttribute('webkitdirectory', '') }}
              onChange={e => { if (e.target.files) onPicked(e.target.files); e.target.value = '' }} />
            Choose a folder
          </label>
        )}
      </div>
    </div>
  )
}

function RollCard(props: {
  roll: ImportRoll
  number: number
  rolls: ImportRoll[]
  files: Record<string, ImportFile>
  selected: Set<string>
  toggle: (key: string) => void
  details: RollDetails
  saveState: SaveState
  catalog: Catalog
  suggested: Partial<RollDetails> | null
  openByDefault: boolean
  onDetails: (patch: Partial<RollDetails>) => void
  onApplyToAll?: () => void
  onAddNew: (type: 'camera' | 'film' | 'lab', typed: string) => void
  onRename: (name: string) => void
  onMerge: (intoKey: string) => void
  session: ImportSession | null
  keptLookalikes: Set<string>
  onKeepLookalike: (key: string) => void
  onRemovePhoto: (file: ImportFile) => void
  clearSelection: () => void
}) {
  const { roll, files, selected, details, session } = props
  const [open, setOpen] = useState(props.openByDefault)
  // The roll's own name unless it is being edited, so a rename from elsewhere shows.
  const [draft, setDraft] = useState<string | null>(null)
  const inRoll = roll.fileKeys.map(k => files[k]).filter(Boolean)
  const done = inRoll.filter(f => f.phase === 'done').length
  const chosenHere = roll.fileKeys.filter(k => selected.has(k))
  const empty = !details.filmStockId && !details.cameraId && !details.labId
  const others = props.rolls.filter(r => r.key !== roll.key)
  const summary = [
    shotDates(details.shotFrom, details.shotTo),
    props.catalog.films.find(f => f.id === details.filmStockId)?.name,
    props.catalog.cameras.find(c => c.id === details.cameraId)?.name,
    props.catalog.labs.find(l => l.id === details.labId)?.name,
  ].filter(Boolean).join(' · ')

  return (
    <section className="border border-neutral-800">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 p-4">
        <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={`roll-${roll.key}`}>Roll title</label>
        <input
          id={`roll-${roll.key}`}
          placeholder="Add a title"
          value={draft ?? roll.name}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && draft.trim() !== roll.name) props.onRename(draft.trim())
            setDraft(null)
          }}
          className="w-full bg-transparent text-lg font-bold text-white outline-none placeholder:font-normal placeholder:text-neutral-500 focus:underline"
        />
        <p className="truncate text-sm text-neutral-400">{summary || 'No details yet'}</p>
        </div>
        <span className="text-sm text-neutral-500">
          {inRoll.length} {inRoll.length === 1 ? 'photo' : 'photos'}{done > 0 && done < inRoll.length ? ` · ${done} done` : ''}
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Hide details' : 'Details'}
        </Button>
        {others.length > 0 && (
          <select
            aria-label="Merge this roll into another"
            value=""
            onChange={e => { if (e.target.value) props.onMerge(e.target.value) }}
            className="h-8 border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-300"
          >
            <option value="">Merge into…</option>
            {others.map(o => <option key={o.key} value={o.key}>{o.name || `Untitled roll ${props.rolls.indexOf(o) + 1}`}</option>)}
          </select>
        )}
      </div>

      {open && (
        <div className="border-b border-neutral-800 p-4">
          {empty && props.suggested && (
            <p className="mb-4 text-sm text-neutral-400">
              Same as your last roll?{' '}
              <button type="button" className="text-white underline underline-offset-2" onClick={() => props.onDetails(props.suggested!)}>
                {[
                  props.catalog.films.find(f => f.id === props.suggested?.filmStockId)?.name,
                  props.catalog.cameras.find(c => c.id === props.suggested?.cameraId)?.name,
                  props.catalog.labs.find(l => l.id === props.suggested?.labId)?.name,
                ].filter(Boolean).join(' · ') || 'Use those details'}
              </button>
            </p>
          )}
          <RollDetailsForm details={details} catalog={props.catalog} onChange={props.onDetails} onAddNew={props.onAddNew} saveState={props.saveState} />
          {props.onApplyToAll && (
            <Button variant="ghost" size="sm" className="mt-2 -ml-4" onClick={props.onApplyToAll}>
              Use these details for every roll in this import
            </Button>
          )}
        </div>
      )}

      <div className="p-4">
        {chosenHere.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-400">{chosenHere.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => { session?.splitRoll(chosenHere, roll.name ? `${roll.name} (part)` : ''); props.clearSelection() }}>
              Move to a new roll
            </Button>
            <Button size="sm" variant="outline" onClick={() => { session?.moveFiles(chosenHere, null); props.clearSelection() }}>
              Make loose
            </Button>
          </div>
        )}
        <FileGrid keys={roll.fileKeys} files={files} selected={selected} toggle={props.toggle} session={session}
          keptLookalikes={props.keptLookalikes} onKeepLookalike={props.onKeepLookalike} onRemovePhoto={props.onRemovePhoto} />
      </div>
    </section>
  )
}

function FileGrid({ keys, files, selected, toggle, session, keptLookalikes, onKeepLookalike, onRemovePhoto }: {
  keys: string[]
  files: Record<string, ImportFile>
  selected: Set<string>
  toggle: (key: string) => void
  session: ImportSession | null
  keptLookalikes: Set<string>
  onKeepLookalike: (key: string) => void
  onRemovePhoto: (file: ImportFile) => void
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
      {keys.map(key => {
        const file = files[key]
        if (!file) return null
        return (
          <li key={key}>
            <FileTile file={file} selected={selected.has(key)} onToggle={() => toggle(key)}
              onRetry={() => session?.retry(key)} onRemove={() => void session?.remove(key)}
              lookalikeOpen={!!file.lookalike && !keptLookalikes.has(key)}
              onKeep={() => onKeepLookalike(key)} onRemovePhoto={() => onRemovePhoto(file)} />
          </li>
        )
      })}
    </ul>
  )
}

const PHASE_LABEL: Record<ImportFile['phase'], string> = {
  hashing: 'Reading', registering: 'Checking', uploading: 'Uploading', completing: 'Uploading',
  processing: 'Making the photo', done: 'In your library', duplicate: 'Already in your library',
  refused: 'Not imported', failed: 'Failed',
}

function FileTile({ file, selected, onToggle, onRetry, onRemove, lookalikeOpen, onKeep, onRemovePhoto }: {
  file: ImportFile
  selected: boolean
  onToggle: () => void
  onRetry: () => void
  onRemove: () => void
  lookalikeOpen: boolean
  onKeep: () => void
  onRemovePhoto: () => void
}) {
  const [comparing, setComparing] = useState(false)
  const image = file.thumb ?? file.preview
  const progress = file.size ? file.uploadedBytes / file.size : 0
  const moving = ['hashing', 'registering', 'uploading', 'completing'].includes(file.phase)
  const muted = file.phase === 'duplicate' || file.phase === 'refused'
  return (
    <div className={`relative ${muted ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${file.name}, ${PHASE_LABEL[file.phase]}${selected ? ', selected' : ''}`}
        className={`relative block aspect-square w-full overflow-hidden bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand
          ${selected ? 'ring-2 ring-white' : ''}`}
      >
        {image
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or the owner's private thumbnail, not something the optimizer may cache
          ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          : <span className="flex h-full items-center justify-center p-1 text-[10px] text-neutral-500 break-all">{file.name}</span>}
        {moving && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-neutral-800">
            <span className="block h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </button>
      {lookalikeOpen && file.lookalike ? (
        <button type="button" onClick={() => setComparing(true)} className="mt-1 block w-full truncate text-left text-[11px] text-yellow-400 underline underline-offset-2">
          Looks like one you have
        </button>
      ) : (
        <p className={`mt-1 truncate text-[11px] ${file.phase === 'failed' ? 'text-brand' : 'text-neutral-500'}`} title={file.reason ?? file.name}>
          {file.waiting ? 'Waiting for the connection' : file.phase === 'failed' || file.phase === 'refused' || file.phase === 'duplicate' ? file.reason ?? PHASE_LABEL[file.phase] : PHASE_LABEL[file.phase]}
          {file.held && ' · held for review'}
        </p>
      )}
      {file.phase === 'failed' && (
        <div className="mt-1 flex gap-2 text-[11px]">
          <button type="button" className="text-white underline" onClick={onRetry}>Retry</button>
          <button type="button" className="text-neutral-400 underline" onClick={onRemove}>Leave out</button>
        </div>
      )}
      {comparing && file.lookalike && (
        <Modal open onClose={() => setComparing(false)} title="Looks like a photo you already have" size="lg"
          description="The new scan is on the left. Nothing is removed unless you choose to.">
          <div className="grid grid-cols-2 gap-3 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- the owner's private thumbnails */}
            <img src={image ?? ''} alt="The new scan" className="aspect-square w-full bg-neutral-900 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element -- the owner's private thumbnails */}
            <img src={file.lookalike.thumb} alt="The photo already in your library" className="aspect-square w-full bg-neutral-900 object-contain" />
          </div>
          <div className="flex justify-end gap-3 px-4 pb-4">
            <Button variant="ghost" onClick={() => { setComparing(false); onKeep() }}>Keep both</Button>
            <Button variant="destructive" onClick={() => { setComparing(false); onRemovePhoto() }}>Remove the new one</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PublishStep({ importId, files }: {
  importId: string
  files: ImportFile[]
}) {
  const { toast } = useToast()
  const [choice, setChoice] = useState<PublishChoice>('private')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<PublishChoice | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_CHOICE_KEY)
      if (last === 'private' || last === 'all' || last === 'chosen') setChoice(last)
    } catch {
      // Storage blocked: start from keeping private.
    }
  }, [])

  const chosen = files.filter(f => picked.has(f.key) && f.itemId)
  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/library/imports/${importId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice, itemIds: choice === 'chosen' ? chosen.map(f => f.itemId) : undefined }),
      })
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not save that'))
      try { localStorage.setItem(LAST_CHOICE_KEY, choice) } catch { /* not remembered, still saved */ }
      setSaved(choice)
      toast(choice === 'private' ? 'Kept private' : 'Published as each photo is ready', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save that', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-10 border border-neutral-800 p-4 sm:p-6">
      <h2 className="font-bold text-white">Publish</h2>
      <p className="mt-1 mb-4 text-sm text-neutral-500">
        Published photos appear on your profile and in the community. Until you choose, everything stays private.
      </p>
      <SegmentedButtons
        label="What to publish"
        options={[
          { value: 'private', label: 'Keep private' },
          { value: 'all', label: 'Publish all' },
          { value: 'chosen', label: 'Choose which' },
        ] as const}
        active={choice}
        onChange={setChoice}
      />
      {choice === 'chosen' && (
        <>
          <p className="mt-3 mb-2 text-sm text-neutral-400">{chosen.length} chosen</p>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
            {files.map(file => {
              const on = picked.has(file.key)
              const image = file.thumb ?? file.preview
              return (
                <li key={file.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${file.name}${on ? ', will be published' : ''}`}
                    onClick={() => setPicked(prev => { const next = new Set(prev); if (on) next.delete(file.key); else next.add(file.key); return next })}
                    className={`relative block aspect-square w-full overflow-hidden bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? 'ring-2 ring-white' : 'opacity-60'}`}
                  >
                    {image
                      // eslint-disable-next-line @next/next/no-img-element -- a local preview or the owner's private thumbnail
                      ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <span className="flex h-full items-center justify-center p-1 text-[10px] text-neutral-500 break-all">{file.name}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy || (choice === 'chosen' && chosen.length === 0)}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-sm text-neutral-500">{saved === 'private' ? 'Kept private.' : saved === 'all' ? 'Every photo will be published.' : `${chosen.length} will be published.`}</span>}
      </div>
    </section>
  )
}
