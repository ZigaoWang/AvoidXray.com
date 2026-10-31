'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Button, { buttonClass } from '@/components/ui/Button'
import DropZone from '@/components/DropZone'
import PageHeader, { sectionHeadingClass } from '@/components/ui/PageHeader'
import AddToAlbumDialog from '@/components/AddToAlbumDialog'
import EditDetailsDialog from '@/components/EditDetailsDialog'
import FilmConfirmation from '@/components/FilmConfirmation'
import SelectableTile, { TILE_GRID } from '@/components/SelectableTile'
import SelectionBar, { SELECTION_BAR_ROOM } from '@/components/SelectionBar'
import Badge from '@/components/ui/Badge'
import OverflowMenu from '@/components/ui/OverflowMenu'
import { textLinkClass } from '@/components/ui/TextLink'
import SegmentedButtons from '@/components/ui/SegmentedButtons'
import Alert from '@/components/ui/Alert'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { PhotoIcon } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import { fetchJson } from '@/lib/fetchJson'
import { formatBytes } from '@/lib/formatBytes'
import { collectDrop } from '@/lib/library/client/dropped'
import { ImportSession, type ImportFile, type ImportRoll, type Snapshot } from '@/lib/library/client/importSession'
import { shotDates } from '@/lib/library/rollHeader'
import { useAddCatalogItem } from '@/components/AddCatalogItem'
import { fieldsForNewItem, useCatalog, type Catalog } from '@/components/useCatalog'
import { actingAsHeaders, setActingAs, withActingAs } from '@/lib/library/client/actingAs'
import RollDetailsForm, { EMPTY_DETAILS, type RollDetails } from './RollDetailsForm'
import PageShell from '@/components/PageShell'

type PublishChoice = 'private' | 'all' | 'chosen'
type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

const LAST_CHOICE_KEY = 'library-import-publish-choice'
/** The pickers' lists before the catalog has loaded. */
const NO_CATALOG: Catalog = { films: [], cameras: [], labs: [] }
const EMPTY_SNAPSHOT: Snapshot = { importId: null, rolls: [], looseKeys: [], files: {}, refused: [], online: true }

interface Unfinished { id: string; filename: string; folder: string | null; state: 'UPLOADING' | 'FAILED'; error: string | null }
interface Storage { usedBytes: number; limitBytes: number | null }

/**
 * Bringing a lab delivery into the library: drop it, check the rolls, fill in
 * the details while it uploads, then say what to publish.
 */
export default function ImportPage({ header, prefill = {}, actingFor }: {
  /** The server-rendered header, so the signed-in nav and tab bar are there from the first paint. */
  header: React.ReactNode
  /** Film and camera for every new roll, from a catalog page's upload link. */
  prefill?: { filmStockId?: string; cameraId?: string }
  /** The account an admin is uploading for; everything goes into its library. */
  actingFor?: { id: string; username: string }
}) {
  const sessionRef = useRef<ImportSession | null>(null)
  const [session, setSession] = useState<ImportSession | null>(null)
  const rollDefaults = useMemo(() => ({ ...EMPTY_DETAILS, ...prefill }), [prefill])
  useEffect(() => {
    // Before anything is requested: the session and every load below send it.
    setActingAs(actingFor?.id ?? null)
    const created = new ImportSession()
    created.rollDefaults = prefill
    sessionRef.current = created
    setSession(created)
    return () => {
      created.dispose()
      setActingAs(null)
    }
    // One session per visit; the prefill and the account come from the address
    // it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const snap = useSyncExternalStore(
    useCallback(listener => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.snapshot() ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  )
  const { toast } = useToast()

  const [loadedCatalog, addToCatalog] = useCatalog()
  const catalog: Catalog = loadedCatalog ?? NO_CATALOG
  const [storage, setStorage] = useState<Storage | null>(null)
  const [unfinished, setUnfinished] = useState<Unfinished[]>([])
  const [suggested, setSuggested] = useState<Partial<RollDetails> | null>(null)
  const [details, setDetails] = useState<Record<string, RollDetails>>({})
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const addItem = useAddCatalogItem()
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState<ImportFile | null>(null)
  const [keptLookalikes, setKeptLookalikes] = useState<Set<string>>(new Set())
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // What the page needs before a drop: storage, leftovers, suggestions.
  useEffect(() => {
    const load = async <T,>(url: string): Promise<T | null> => {
      const res = await fetch(url, withActingAs()).catch(() => null)
      return res?.ok ? res.json() : null
    }
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
      for (const roll of missing) next[roll.key] = { ...rollDefaults }
      return next
    })
  }, [snap.rolls, rollDefaults])

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
          headers: { 'Content-Type': 'application/json', ...actingAsHeaders() },
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
      const value = { ...(prev[rollKey] ?? rollDefaults), ...patch }
      saveRoll(rollKey, value)
      return { ...prev, [rollKey]: value }
    })
  }, [saveRoll, rollDefaults])

  // A folder dropped again rejoins the roll it made before; its saved details
  // come with it, so the form never saves blanks over them.
  useEffect(() => {
    if (!session) return
    session.onRollAdopted = async (rollKey, rollId) => {
      const res = await fetch(`/api/library/rolls/${rollId}`, withActingAs()).catch(() => null)
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
        const current = prev[rollKey] ?? rollDefaults
        if (current.scannerModel) return prev
        const value = { ...current, scannerModel: model }
        saveRoll(rollKey, value)
        return { ...prev, [rollKey]: value }
      })
    }
  }, [session, saveRoll, rollDefaults])

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
      void fetch('/api/library/imports', withActingAs()).then(r => (r.ok ? r.json() : null)).then(body => { if (body) setStorage(body.storage) }).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [registered, counts.done])

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const [editing, setEditing] = useState(false)
  /** The selected files that are photos already, which details can be written on. */
  const readyIds = [...selected].map(key => snap.files[key]?.photoId).filter((id): id is string => !!id)

  const removePhoto = async (file: ImportFile) => {
    if (!file.photoId) return
    const res = await fetch(`/api/photos/${file.photoId}`, { method: 'DELETE' })
    if (!res.ok) { toast(await apiErrorMessage(res, 'Could not remove the photo'), 'error'); return }
    await session?.remove(file.key)
    toast('Removed', 'success')
  }

  return (
    <PageShell header={header}>
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-16 ${selected.size > 0 ? SELECTION_BAR_ROOM : ''}`}>
        <PageHeader
          title="Upload"
          description="Scans, folders or a zip from your lab. Each folder becomes a roll, and everything stays private until you choose to publish."
        />
        {actingFor && (
          <Alert className="mb-6">
            Uploading for @{actingFor.username}. The rolls and photos go into their library and count against their storage.
          </Alert>
        )}

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

        <ImportDropZone onDrop={onDrop} onPicked={list => session?.addPicked(list)} />

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
              details={details[roll.key] ?? rollDefaults}
              saveState={saveStates[roll.key] ?? 'idle'}
              catalog={catalog}
              suggested={suggested}
              openByDefault={snap.rolls.length <= 3}
              onDetails={patch => changeDetails(roll.key, patch)}
              onApplyToAll={snap.rolls.length > 1 ? () => applyToAll(roll.key) : undefined}
              onAddNew={(type, typed) => addItem.start(type, typed, item => {
                addToCatalog(type, item)
                changeDetails(roll.key, fieldsForNewItem(type, item, details[roll.key] ?? rollDefaults))
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
          <PublishStep importId={snap.importId} files={uploadable} albums={!actingFor} />
        )}
      </main>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="outline" size="sm" onClick={() => { session?.splitRoll([...selected], ''); setSelected(new Set()) }}>Move {selected.size} to a new roll</Button>
        <Button variant="outline" size="sm" onClick={() => { session?.moveFiles([...selected], null); setSelected(new Set()) }}>Make {selected.size} loose</Button>
        {readyIds.length > 0 && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit details</Button>}
      </SelectionBar>
      {/* Captions and dates for the photos already made; the roll holds film, camera and lab. */}
      <EditDetailsDialog open={editing} count={readyIds.length} fields={['caption', 'date']}
        onApply={async changes => {
          try {
            await fetchJson('/api/library/photos/details', { method: 'POST', body: { ids: readyIds, changes }, fallback: 'Could not save', headers: actingAsHeaders() })
            setEditing(false)
            toast(`Saved ${readyIds.length} ${readyIds.length === 1 ? 'photo' : 'photos'}`, 'success')
          } catch (error) {
            toast(error instanceof Error ? error.message : 'Could not save', 'error')
          }
        }}
        onClose={() => setEditing(false)} />
      {addItem.dialog}
      <ConfirmDialog
        open={confirmRemovePhoto !== null}
        title="Remove this photo?"
        confirmLabel="Move to Trash"
        onConfirm={async () => { if (confirmRemovePhoto) await removePhoto(confirmRemovePhoto); setConfirmRemovePhoto(null) }}
        onClose={() => setConfirmRemovePhoto(null)}
      >
        It goes to the Trash in your library, where you can restore it for 30 days. The photo it looks like stays.
      </ConfirmDialog>
    </PageShell>
  )
}

async function renameOnServer(session: ImportSession | null, rollKey: string, title: string) {
  const id = await session?.rollId(rollKey)
  if (!id) return
  await fetch(`/api/library/rolls/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...actingAsHeaders() }, body: JSON.stringify({ title: title.trim() || null }),
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

const noSubscription = () => () => {}

function ImportDropZone({ onDrop, onPicked }: {
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
    <DropZone onDrop={onDrop}>
      <div className="mx-auto mb-3 flex justify-center opacity-50"><PhotoIcon size={10} /></div>
      <p className="text-neutral-400">{folders ? 'Drop folders, a zip or scans here' : 'Add scans or a zip'}</p>
      <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, TIFF or HEIC, up to 1 GB each</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <label className={`${buttonClass('primary', 'lg')} cursor-pointer`}>
          <input type="file" multiple accept="image/*,.heic,.heif,.tif,.tiff,.zip" className="sr-only"
            onChange={e => { if (e.target.files) onPicked(e.target.files); e.target.value = '' }} />
          Choose files
        </label>
        {folders && (
          <label className={`${buttonClass('outline', 'lg')} cursor-pointer`}>
            <input type="file" multiple className="sr-only"
              ref={el => { if (el) el.setAttribute('webkitdirectory', '') }}
              onChange={e => { if (e.target.files) onPicked(e.target.files); e.target.value = '' }} />
            Choose a folder
          </label>
        )}
      </div>
    </DropZone>
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
          <OverflowMenu label={`Merge ${roll.name || 'this roll'} into another`} text="Merge into" align="right"
            items={others.map(o => ({ label: o.name || `Untitled roll ${props.rolls.indexOf(o) + 1}`, onSelect: () => props.onMerge(o.key) }))} />
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
    <ul className={TILE_GRID}>
      {keys.map((key, i) => {
        const file = files[key]
        if (!file) return null
        return (
          <li key={key}>
            <FileTile file={file} index={i} selected={selected.has(key)} onToggle={() => toggle(key)}
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

/** The picture a file shows while it is on its way: the local preview, then the stored thumbnail. */
function FileImage({ file }: { file: ImportFile }) {
  const image = file.thumb ?? file.preview
  return image
    // eslint-disable-next-line @next/next/no-img-element -- a local preview or the owner's private thumbnail, not something the optimizer may cache
    ? <img src={image} alt="" className="h-full w-full object-contain" loading="lazy" />
    : <span className="flex h-full items-center justify-center break-all p-1 text-[10px] text-neutral-500">{file.name}</span>
}

/**
 * One file of an upload, on the shared tile: its progress along the bottom
 * while it travels, its state as a badge once it settles, and anything that
 * needs the owner (a failure, a look-alike) in words under it.
 */
function FileTile({ file, index, selected, onToggle, onRetry, onRemove, lookalikeOpen, onKeep, onRemovePhoto }: {
  file: ImportFile
  index: number
  selected: boolean
  onToggle: () => void
  onRetry: () => void
  onRemove: () => void
  lookalikeOpen: boolean
  onKeep: () => void
  onRemovePhoto: () => void
}) {
  const [comparing, setComparing] = useState(false)
  const progress = file.size ? file.uploadedBytes / file.size : 0
  const moving = ['hashing', 'registering', 'uploading', 'completing'].includes(file.phase)
  const state = file.waiting ? 'Waiting for the connection' : PHASE_LABEL[file.phase]
  return (
    <>
      <SelectableTile
        selected={selected}
        onSelect={onToggle}
        label={`Select ${file.name || `file ${index + 1}`}. ${state}.`}
        dimmed={file.phase === 'duplicate' || file.phase === 'refused'}
        image={<FileImage file={file} />}
        overlay={moving && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1 bg-neutral-800" aria-hidden>
            <span className="block h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        badges={!moving && file.phase !== 'done' || file.held ? (
          <>
            {file.phase === 'processing' && <Badge>Making the photo</Badge>}
            {file.phase === 'duplicate' && <Badge>Already in your library</Badge>}
            {(file.phase === 'failed' || file.phase === 'refused') && <Badge tone="warningSolid">{PHASE_LABEL[file.phase]}</Badge>}
            {file.held && <Badge tone="warningSolid">Held for review</Badge>}
          </>
        ) : undefined}
        below={
          lookalikeOpen && file.lookalike ? (
            <button type="button" onClick={() => setComparing(true)} className={`${textLinkClass} mt-1 block w-full truncate text-left text-xs`}>
              Looks like one you have
            </button>
          ) : file.phase === 'failed' ? (
            <p className="mt-1 text-xs text-brand-light">
              <span className="block truncate" title={file.reason ?? undefined}>{file.reason ?? 'Could not upload it'}</span>
              <span className="flex gap-3">
                <button type="button" className={textLinkClass} onClick={onRetry}>Retry</button>
                <button type="button" className={textLinkClass} onClick={onRemove}>Leave out</button>
              </span>
            </p>
          ) : (file.phase === 'refused' || file.waiting) ? (
            <p className="mt-1 truncate text-xs text-neutral-500" title={file.reason ?? undefined}>{file.waiting ? state : file.reason ?? state}</p>
          ) : undefined
        }
      />
      {comparing && file.lookalike && (
        <Modal open onClose={() => setComparing(false)} title="Looks like a photo you already have" size="lg"
          description="The new scan is on the left. Nothing is removed unless you choose to.">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="aspect-square bg-neutral-900"><FileImage file={file} /></div>
            {/* eslint-disable-next-line @next/next/no-img-element -- the owner's private thumbnail */}
            <img src={file.lookalike.thumb} alt="The photo already in your library" className="aspect-square w-full bg-neutral-900 object-contain" />
          </div>
          <ModalFooter>
            <Button variant="secondary" onClick={() => { setComparing(false); onKeep() }}>Keep both</Button>
            <Button variant="destructive" onClick={() => { setComparing(false); onRemovePhoto() }}>Remove the new one</Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  )
}

function PublishStep({ importId, files, albums }: {
  importId: string
  files: ImportFile[]
  /** Offer the uploader's albums; not when an admin uploads for someone else. */
  albums: boolean
}) {
  const { toast } = useToast()
  const [choice, setChoice] = useState<PublishChoice>('private')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<PublishChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [filing, setFiling] = useState(false)
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_CHOICE_KEY)
      if (last === 'private' || last === 'all' || last === 'chosen') setChoice(last)
    } catch {
      // Storage blocked: start from keeping private.
    }
  }, [])

  const chosen = files.filter(f => picked.has(f.key) && f.itemId)
  const made = files.filter(f => f.photoId).map(f => f.photoId!)
  const publishing = choice !== 'private'
  const save = async () => {
    setBusy(true)
    try {
      await fetchJson(`/api/library/imports/${importId}/publish`, {
        method: 'POST',
        body: { choice, itemIds: choice === 'chosen' ? chosen.map(f => f.itemId) : undefined },
        fallback: 'Could not save that',
        headers: actingAsHeaders(),
      })
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
    <section className="mt-10 border-t border-neutral-800 pt-6">
      <h2 className={sectionHeadingClass}>Publish</h2>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
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
        onChange={value => { setChoice(value); setConfirmed(false) }}
      />
      {choice === 'chosen' && (
        <>
          <p className="mb-2 mt-3 text-sm text-neutral-400">{chosen.length} chosen</p>
          <ul className={TILE_GRID}>
            {files.map((file, i) => (
              <li key={file.key}>
                <SelectableTile
                  selected={picked.has(file.key)}
                  onSelect={() => setPicked(prev => { const next = new Set(prev); if (next.has(file.key)) next.delete(file.key); else next.add(file.key); return next })}
                  label={`Publish ${file.name || `photo ${i + 1}`}`}
                  image={<FileImage file={file} />}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {publishing && <div className="mt-4"><FilmConfirmation checked={confirmed} onChange={setConfirmed} /></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy || (publishing && !confirmed) || (choice === 'chosen' && chosen.length === 0)}>
          {busy ? 'Saving…' : choice === 'private' ? 'Keep private' : choice === 'all' ? `Publish ${files.length}` : `Publish ${chosen.length}`}
        </Button>
        {albums && made.length > 0 && <Button variant="outline" onClick={() => setFiling(true)}>Add {made.length} to an album</Button>}
        {saved && <span className="text-sm text-neutral-500">{saved === 'private' ? 'Kept private.' : saved === 'all' ? 'Every photo will be published.' : `${chosen.length} will be published.`}</span>}
      </div>
      <AddToAlbumDialog open={filing} onClose={() => setFiling(false)} photoIds={made}
        onAdded={name => { setFiling(false); toast(`Added ${made.length} to ${name}`, 'success') }} />
    </section>
  )
}
