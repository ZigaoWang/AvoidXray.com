import { ApiError, fetchJson } from '@/lib/fetchJson'
import { createPreviewUrl } from '@/lib/previewImage'
import { collectPicked, folderOf, isSystemFile, proposeRolls, classify, type Collected, type DroppedFile, type RefusedFile } from './dropped'

/**
 * One import on the page: its files, its rolls, and the work of getting each
 * file from the drop to a photo. Browser only.
 *
 * A file goes hashed, registered, uploaded in parts straight to the bucket,
 * completed, then made into a photo by the server's import worker. Each step
 * retries on its own with backoff, and waits out a lost connection rather than
 * failing. Nothing is uploaded twice: the server answers a file already in
 * the library as a duplicate, and a file already partly uploaded with the parts
 * it holds.
 *
 * React reads it through subscribe/snapshot (useSyncExternalStore); every
 * change produces a new snapshot object.
 */

export type FilePhase =
  | 'hashing' | 'registering' | 'uploading' | 'completing' | 'processing'
  | 'done' | 'duplicate' | 'refused' | 'failed'

export interface ImportFile {
  key: string
  name: string
  folder: string | null
  size: number
  rollKey: string | null
  phase: FilePhase
  /** Bytes the bucket has, for the progress bar. */
  uploadedBytes: number
  preview: string | null
  sha256?: string
  imageSha256?: string | null
  scannerModel?: string | null
  itemId?: string
  photoId?: string
  /** For a file already in the library, the roll its photo is in. */
  duplicateRollId?: string | null
  thumb?: string | null
  /** Why it was skipped, refused or failed, in words for the owner. */
  reason?: string
  lookalike?: { photoId: string; thumb: string } | null
  /** A possible look-alike waiting for the vision worker to confirm or clear it. */
  lookalikePending?: boolean
  held?: boolean
  /** Waiting for the connection to come back. */
  waiting?: boolean
}

export interface ImportRoll {
  key: string
  /** The server's roll id, once created. */
  id: string | null
  name: string
  fileKeys: string[]
}

export interface Snapshot {
  importId: string | null
  rolls: ImportRoll[]
  /** Files in no roll, in order. */
  looseKeys: string[]
  files: Record<string, ImportFile>
  refused: RefusedFile[]
  online: boolean
}

const FILES_IN_FLIGHT = 3
const PARTS_PER_FILE = 2
const REGISTER_BATCH = 25
const POLL_MS = 3000
/** How long the page keeps asking about look-alikes after the last photo is made. */
const LOOKALIKE_WAIT_MS = 10 * 60 * 1000
const BACKOFF_CAP_MS = 30_000

/** Thrown for an answer no retry will change. */
class Final extends Error {}

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  try {
    return await fetchJson<T>(url, init)
  } catch (error) {
    // Client errors will not change on a retry, except the rate limit.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408) {
      throw new Final(error.message)
    }
    throw error
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let keySeq = 0
const newKey = (prefix: string) => `${prefix}${Date.now().toString(36)}${(keySeq++).toString(36)}`

export class ImportSession {
  private state: Snapshot = { importId: null, rolls: [], looseKeys: [], files: {}, refused: [], online: true }
  private listeners = new Set<() => void>()
  private blobs = new Map<string, Blob>()
  private hashWorker: Worker | null = null
  private hashWaiters = new Map<string, (result: { sha256?: string; imageSha256?: string | null; scannerModel?: string | null; error?: string }) => void>()
  private importPromise: Promise<string> | null = null
  private rollPromises = new Map<string, Promise<string | null>>()
  private registerQueue: string[] = []
  private uploadQueue: string[] = []
  private activeUploads = 0
  private registering = false
  private polling = false
  /** When a file last started or finished being made, for how long to keep polling. */
  private lastProgress = Date.now()
  private disposed = false
  private orderSync = new Map<string | null, ReturnType<typeof setTimeout>>()
  /** Called with each scanner model read from a file, for its roll. */
  onScanner: ((rollKey: string, model: string) => void) | null = null
  /** Called when a roll turns out to be one made on an earlier import, with that roll's id. */
  onRollAdopted: ((rollKey: string, rollId: string) => void) | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.state.online = navigator.onLine
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  // --- store ---------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  snapshot = () => this.state

  private set(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private patchFile(key: string, patch: Partial<ImportFile>) {
    const current = this.state.files[key]
    if (!current) return
    this.set({ files: { ...this.state.files, [key]: { ...current, ...patch } } })
  }

  dispose() {
    this.disposed = true
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    this.hashWorker?.terminate()
    for (const file of Object.values(this.state.files)) if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview)
  }

  /** Whether leaving the page now would lose work. */
  get busy(): boolean {
    return Object.values(this.state.files).some(f => ['hashing', 'registering', 'uploading', 'completing'].includes(f.phase))
  }

  private handleOnline = () => this.set({ online: true })
  private handleOffline = () => this.set({ online: false })

  private async untilOnline() {
    while (!this.state.online && !this.disposed) await sleep(1000)
  }

  /** Runs a step until it works, waiting out a lost connection, backing off on errors. */
  private async retrying<T>(key: string | null, step: () => Promise<T>, attempts = 8): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      await this.untilOnline()
      try {
        const result = await step()
        if (key) this.patchFile(key, { waiting: false })
        return result
      } catch (error) {
        if (error instanceof Final || attempt >= attempts) throw error
        if (key) this.patchFile(key, { waiting: !navigator.onLine })
        await sleep(Math.min(BACKOFF_CAP_MS, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() / 2))
      }
    }
  }

  // --- adding files ----------------------------------------------------------

  /** Adds what was dropped or picked. Zips are opened in a worker first. */
  async add(collected: Collected) {
    this.set({ refused: [...this.state.refused, ...collected.refused] })
    this.addFiles(collected.files)
    for (const zip of collected.zips) await this.addZip(zip)
  }

  addPicked(files: FileList | File[]) {
    return this.add(collectPicked(files))
  }

  private addZip(zip: DroppedFile): Promise<void> {
    const base = zip.file.name.replace(/\.zip$/i, '')
    const root = zip.folder ? `${zip.folder}/${base}` : base
    return new Promise(resolve => {
      const worker = new Worker(new URL('./unzip.worker.ts', import.meta.url), { type: 'module' })
      const found: Collected = { files: [], zips: [], refused: [] }
      worker.onmessage = (event: MessageEvent<{ type: string; path?: string; blob?: Blob; message?: string }>) => {
        const message = event.data
        if (message.type === 'file' && message.path && message.blob && !isSystemFile(message.path)) {
          const name = message.path.slice(message.path.lastIndexOf('/') + 1)
          const inner = folderOf(message.path)
          classify({ file: new File([message.blob], name), folder: inner ? `${root}/${inner}` : root }, found)
          // Images of a zip arrive as they are unpacked; hand them on in batches.
          if (found.files.length >= 12) this.addFiles(found.files.splice(0))
          return
        }
        if (message.type === 'error') {
          found.refused.push({ name: zip.file.name, reason: `The zip could not be opened: ${message.message}` })
        }
        if (message.type === 'done' || message.type === 'error') {
          this.addFiles(found.files)
          // A zip inside a zip is not opened.
          for (const nested of found.zips) found.refused.push({ name: `${root}/${nested.file.name}`, reason: 'A zip inside a zip is not opened' })
          this.set({ refused: [...this.state.refused, ...found.refused] })
          worker.terminate()
          resolve()
        }
      }
      worker.postMessage({ zip: zip.file })
    })
  }

  /**
   * Adds files and places them: each folder joins the roll already made for
   * it in this import, or becomes a new one; loose files share one roll.
   */
  private addFiles(files: DroppedFile[]) {
    if (!files.length) return
    const rolls = [...this.state.rolls]
    const added: Record<string, ImportFile> = {}
    for (const proposed of proposeRolls(files)) {
      const folderKey = proposed.folder ?? ''
      let roll = rolls.find(r => (this.rollFolder.get(r.key) ?? null) === folderKey)
      if (!roll) {
        roll = { key: newKey('r'), id: null, name: proposed.name, fileKeys: [] }
        this.rollFolder.set(roll.key, folderKey)
        rolls.push(roll)
      }
      const keys: string[] = []
      for (const dropped of proposed.files) {
        const key = newKey('f')
        this.blobs.set(key, dropped.file)
        added[key] = {
          key, name: dropped.file.name, folder: dropped.folder, size: dropped.file.size, rollKey: roll.key,
          phase: 'hashing', uploadedBytes: 0, preview: null,
        }
        keys.push(key)
      }
      roll.fileKeys = [...roll.fileKeys, ...keys].sort((a, b) => compareNames(added[a] ?? this.state.files[a], added[b] ?? this.state.files[b]))
      const index = rolls.findIndex(r => r.key === roll!.key)
      rolls[index] = { ...roll }
    }
    this.set({ rolls, files: { ...this.state.files, ...added } })
    for (const key of Object.keys(added)) {
      void this.preview(key)
      void this.hash(key)
    }
  }

  /** Which folder each roll was made for, so a second drop of the same folder joins it. */
  private rollFolder = new Map<string, string>()

  private async preview(key: string) {
    const blob = this.blobs.get(key)
    const file = this.state.files[key]
    if (!blob || !file || /\.tiff?$/i.test(file.name)) return
    try {
      const url = await createPreviewUrl(blob as File)
      if (this.disposed) URL.revokeObjectURL(url)
      else this.patchFile(key, { preview: url })
    } catch {
      // No preview; the tile shows the file's name until the thumbnail is made.
    }
  }

  // --- hashing -------------------------------------------------------------

  private hash(key: string): Promise<void> {
    if (!this.hashWorker) {
      this.hashWorker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
      this.hashWorker.onmessage = (event: MessageEvent<{ id: string; sha256?: string; imageSha256?: string | null; scannerModel?: string | null; error?: string }>) => {
        this.hashWaiters.get(event.data.id)?.(event.data)
        this.hashWaiters.delete(event.data.id)
      }
    }
    return new Promise(resolve => {
      this.hashWaiters.set(key, result => {
        if (result.error || !result.sha256) {
          this.patchFile(key, { phase: 'failed', reason: 'The file could not be read' })
        } else {
          this.patchFile(key, { sha256: result.sha256, imageSha256: result.imageSha256 ?? null, scannerModel: result.scannerModel, phase: 'registering' })
          const rollKey = this.state.files[key]?.rollKey
          if (result.scannerModel && rollKey) this.onScanner?.(rollKey, result.scannerModel)
          this.registerQueue.push(key)
          void this.drainRegister()
        }
        resolve()
      })
      this.hashWorker!.postMessage({ id: key, file: this.blobs.get(key) })
    })
  }

  // --- the import and its rolls --------------------------------------------

  private ensureImport(): Promise<string> {
    this.importPromise ??= this.retrying(null, () => api<{ id: string }>('/api/library/imports', { method: 'POST' }))
      .then(({ id }) => { this.set({ importId: id }); return id })
      .catch(error => { this.importPromise = null; throw error })
    return this.importPromise
  }

  /** The server id for a roll, creating it the first time it is needed. */
  private ensureRoll(rollKey: string | null): Promise<string | null> {
    if (!rollKey) return Promise.resolve(null)
    const roll = this.state.rolls.find(r => r.key === rollKey)
    if (!roll) return Promise.resolve(null)
    if (roll.id) return Promise.resolve(roll.id)
    let promise = this.rollPromises.get(rollKey)
    if (!promise) {
      promise = this.retrying(null, () => api<{ roll: { id: string } }>('/api/library/rolls', {
        method: 'POST', body: { title: roll.name || null },
      })).then(({ roll: created }) => {
        this.set({ rolls: this.state.rolls.map(r => (r.key === rollKey ? { ...r, id: created.id } : r)) })
        return created.id
      }).catch(error => { this.rollPromises.delete(rollKey); throw error })
      this.rollPromises.set(rollKey, promise)
    }
    return promise
  }

  /** The server id of a roll once it exists, for editing its details. */
  rollId(rollKey: string): Promise<string | null> {
    return this.ensureRoll(rollKey)
  }

  private positionOf(key: string): number | null {
    const file = this.state.files[key]
    const roll = this.state.rolls.find(r => r.key === file?.rollKey)
    return roll ? roll.fileKeys.indexOf(key) + 1 : null
  }

  // --- registering ---------------------------------------------------------

  private async drainRegister() {
    if (this.registering) return
    this.registering = true
    try {
      while (this.registerQueue.length && !this.disposed) {
        const batch = this.registerQueue.splice(0, REGISTER_BATCH).filter(k => this.state.files[k]?.phase === 'registering')
        if (!batch.length) continue
        try {
          await this.register(batch)
        } catch (error) {
          for (const key of batch) this.patchFile(key, { phase: 'failed', reason: error instanceof Error ? error.message : 'Could not reach the server' })
        }
      }
    } finally {
      this.registering = false
    }
  }

  private async register(keys: string[]) {
    const importId = await this.ensureImport()
    const files: Record<string, unknown>[] = []
    for (const key of keys) {
      const file = this.state.files[key]
      const rollId = await this.ensureRoll(file.rollKey)
      files.push({
        clientId: key, filename: file.name, folder: file.folder, bytes: file.size,
        sha256: file.sha256, imageSha256: file.imageSha256 ?? null,
        rollId, rollPosition: rollId ? this.positionOf(key) : null,
      })
    }
    const { results } = await this.retrying(null, () => api<{ results: Registration[] }>(
      `/api/library/imports/${importId}/items`, { method: 'POST', body: { files } },
    ))
    for (const result of results) {
      const key = result.clientId
      switch (result.outcome) {
        case 'upload': {
          const file = this.state.files[key]
          const uploadedBytes = Math.min(file.size, result.uploadedParts.length * result.partSize)
          this.patchFile(key, { phase: 'uploading', itemId: result.itemId, uploadedBytes })
          this.plans.set(key, { partSize: result.partSize, partCount: result.partCount, uploaded: new Set(result.uploadedParts) })
          this.uploadQueue.push(key)
          break
        }
        case 'processing':
          this.patchFile(key, { phase: 'processing', itemId: result.itemId, uploadedBytes: this.state.files[key].size })
          break
        case 'duplicate':
          this.patchFile(key, { phase: 'duplicate', photoId: result.photoId, duplicateRollId: result.rollId, reason: result.reason })
          break
        case 'refused':
          this.patchFile(key, { phase: 'refused', reason: result.reason })
          break
      }
    }
    await this.settleRolls(keys)
    void this.drainUploads()
    void this.poll()
  }

  /**
   * After registering, each roll is checked against the library.
   *
   * A folder dropped again, after a tab closed partway or to add frames that
   * were missing, holds files whose photos are already in a roll from the
   * earlier import. That roll is the roll: this one takes its id, its new
   * frames move into it in order, and the empty roll made for this drop is
   * deleted. A roll whose every file was skipped or refused holds nothing,
   * and its server row is deleted rather than left empty; the card stays, so
   * the owner sees why.
   */
  private async settleRolls(keys: string[]) {
    const touched = new Set(keys.map(k => this.state.files[k]?.rollKey).filter((k): k is string => !!k))
    for (const rollKey of touched) {
      const roll = this.state.rolls.find(r => r.key === rollKey)
      if (!roll?.id) continue
      const files = roll.fileKeys.map(k => this.state.files[k]).filter(Boolean)
      const earlier = new Set(files.flatMap(f => (f.phase === 'duplicate' && f.duplicateRollId && f.duplicateRollId !== roll.id ? [f.duplicateRollId] : [])))
      if (earlier.size === 1) {
        await this.adoptRoll(rollKey, [...earlier][0])
      } else if (!this.adopted.has(rollKey) && files.every(f => f.phase === 'duplicate' || f.phase === 'refused')) {
        // Only a roll this drop made: an adopted one holds the earlier photos.
        const id = roll.id
        this.rollPromises.delete(rollKey)
        this.set({ rolls: this.state.rolls.map(r => (r.key === rollKey ? { ...r, id: null } : r)) })
        void fetch(`/api/library/rolls/${id}`, { method: 'DELETE' }).catch(() => {})
      }
    }
  }

  /** Rolls that turned out to be rolls from an earlier import. */
  private adopted = new Set<string>()

  private async adoptRoll(rollKey: string, earlierId: string) {
    this.adopted.add(rollKey)
    const previous = this.state.rolls.find(r => r.key === rollKey)?.id ?? null
    this.rollPromises.set(rollKey, Promise.resolve(earlierId))
    this.set({ rolls: this.state.rolls.map(r => (r.key === rollKey ? { ...r, id: earlierId } : r)) })
    this.onRollAdopted?.(rollKey, earlierId)
    await this.flushOrder(rollKey).catch(() => {})
    if (previous && previous !== earlierId) await fetch(`/api/library/rolls/${previous}`, { method: 'DELETE' }).catch(() => {})
  }

  // --- uploading -----------------------------------------------------------

  private plans = new Map<string, { partSize: number; partCount: number; uploaded: Set<number> }>()

  private drainUploads() {
    while (this.activeUploads < FILES_IN_FLIGHT && this.uploadQueue.length && !this.disposed) {
      const key = this.uploadQueue.shift()!
      if (this.state.files[key]?.phase !== 'uploading') continue
      this.activeUploads++
      void this.upload(key)
        .catch(error => this.patchFile(key, { phase: 'failed', reason: error instanceof Error ? error.message : 'The upload failed' }))
        .finally(() => { this.activeUploads--; this.drainUploads() })
    }
  }

  private async upload(key: string) {
    const file = this.state.files[key]
    const blob = this.blobs.get(key)
    const plan = this.plans.get(key)
    if (!file?.itemId || !blob || !plan) throw new Error('The file is no longer available; drop it again')
    const itemId = file.itemId

    const inFlight = new Map<number, number>()
    const report = () => {
      let bytes = 0
      for (const n of plan.uploaded) bytes += partBytes(n, plan.partSize, file.size)
      for (const loaded of inFlight.values()) bytes += loaded
      this.patchFile(key, { uploadedBytes: Math.min(file.size, bytes) })
    }

    const sendParts = async (numbers: number[]) => {
      const queue = [...numbers]
      let urls: Record<number, string> = {}
      const urlFor = async (n: number) => {
        if (!urls[n]) {
          const batch = queue.slice(0, 19)
          const { urls: signed } = await this.retrying(key, () => api<{ urls: Record<number, string> }>(
            `/api/library/import-items/${itemId}/parts`, { method: 'POST', body: { parts: [n, ...batch.filter(b => b !== n)] } },
          ))
          urls = { ...urls, ...signed }
        }
        return urls[n]
      }
      const lane = async () => {
        while (queue.length && !this.disposed) {
          const n = queue.shift()!
          await this.retrying(key, async () => {
            const url = await urlFor(n)
            const start = (n - 1) * plan.partSize
            try {
              await putPart(url, blob.slice(start, Math.min(file.size, start + plan.partSize)), loaded => { inFlight.set(n, loaded); report() })
            } catch (error) {
              // A signed URL that expired is signed again on the next try.
              if (error instanceof PartRejected) delete urls[n]
              throw error
            } finally {
              inFlight.delete(n)
            }
          }, 10)
          plan.uploaded.add(n)
          report()
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARTS_PER_FILE, queue.length) }, lane))
    }

    const missing = () => Array.from({ length: plan.partCount }, (_, i) => i + 1).filter(n => !plan.uploaded.has(n))
    await sendParts(missing())

    this.patchFile(key, { phase: 'completing' })
    for (let round = 0; round < 3; round++) {
      const res = await this.retrying(key, async () => {
        const r = await fetch(`/api/library/import-items/${itemId}/complete`, { method: 'POST' })
        const body = await r.json().catch(() => ({}))
        if (r.status === 409 && Array.isArray(body.missingParts)) return { missing: body.missingParts as number[] }
        if (!r.ok) {
          if (r.status >= 400 && r.status < 500 && r.status !== 429) throw new Final(body.error ?? 'The upload could not be finished')
          throw new Error(body.error ?? 'The upload could not be finished')
        }
        return { missing: [] as number[] }
      })
      if (!res.missing.length) {
        this.patchFile(key, { phase: 'processing', uploadedBytes: file.size })
        void this.poll()
        return
      }
      // The bucket is missing parts the page thought were sent: send them again.
      for (const n of res.missing) plan.uploaded.delete(n)
      this.patchFile(key, { phase: 'uploading' })
      await sendParts(res.missing)
      this.patchFile(key, { phase: 'completing' })
    }
    throw new Error('The upload could not be finished; try again')
  }

  /** Sends a failed file again from where it stopped. */
  retry(key: string) {
    const file = this.state.files[key]
    if (!file || file.phase !== 'failed') return
    if (!file.sha256) {
      this.patchFile(key, { phase: 'hashing', reason: undefined })
      void this.hash(key)
    } else if (!file.itemId || !this.plans.has(key)) {
      this.patchFile(key, { phase: 'registering', reason: undefined })
      this.registerQueue.push(key)
      void this.drainRegister()
    } else {
      this.patchFile(key, { phase: 'uploading', reason: undefined })
      this.uploadQueue.push(key)
      this.drainUploads()
    }
  }

  // --- processing ----------------------------------------------------------

  /** Polls the server while any photo is being made. */
  private async poll() {
    if (this.polling) return
    this.polling = true
    try {
      while (!this.disposed && this.state.importId) {
        // Kept up while a look-alike waits on the vision worker, for a while.
        const waiting = Object.values(this.state.files).filter(f =>
          f.phase === 'processing' || (f.phase === 'done' && (f.held === undefined || f.lookalikePending)))
        if (!waiting.length || Date.now() - this.lastProgress > LOOKALIKE_WAIT_MS) break
        await sleep(POLL_MS)
        try {
          await this.refresh()
        } catch {
          // Polled again next time round.
        }
      }
    } finally {
      this.polling = false
    }
  }

  /** Reads every item's state from the server. */
  async refresh() {
    if (!this.state.importId) return
    const { items } = await api<{ items: ServerItem[] }>(`/api/library/imports/${this.state.importId}`)
    const byItem = new Map(items.map(i => [i.id, i]))
    const files = { ...this.state.files }
    let changed = false
    for (const file of Object.values(files)) {
      const item = file.itemId ? byItem.get(file.itemId) : undefined
      if (!item) continue
      const next: Partial<ImportFile> = {
        thumb: item.thumb, lookalike: item.lookalike, lookalikePending: item.lookalikePending,
        held: item.held, photoId: item.photoId ?? undefined,
      }
      if (item.state === 'DONE') next.phase = 'done'
      else if (item.state === 'FAILED') { next.phase = 'failed'; next.reason = item.error ?? 'The photo could not be made' }
      if (Object.entries(next).some(([k, v]) => JSON.stringify(file[k as keyof ImportFile]) !== JSON.stringify(v))) {
        files[file.key] = { ...file, ...next }
        changed = true
      }
    }
    if (changed) {
      if (Object.values(files).some(f => f.phase === 'processing')) this.lastProgress = Date.now()
      this.set({ files })
    }
  }

  // --- rolls -----------------------------------------------------------------

  renameRoll(rollKey: string, name: string) {
    this.set({ rolls: this.state.rolls.map(r => (r.key === rollKey ? { ...r, name } : r)) })
  }

  /** Moves files into a roll, after its existing frames, or out of every roll. */
  moveFiles(keys: string[], toRollKey: string | null) {
    const moving = new Set(keys)
    const from = new Set(keys.map(k => this.state.files[k]?.rollKey ?? null))
    let rolls = this.state.rolls.map(r => ({ ...r, fileKeys: r.fileKeys.filter(k => !moving.has(k)) }))
    let looseKeys = this.state.looseKeys.filter(k => !moving.has(k))
    if (toRollKey) rolls = rolls.map(r => (r.key === toRollKey ? { ...r, fileKeys: [...r.fileKeys, ...keys] } : r))
    else looseKeys = [...looseKeys, ...keys]
    const files = { ...this.state.files }
    for (const key of keys) if (files[key]) files[key] = { ...files[key], rollKey: toRollKey }
    const emptied = rolls.filter(r => r.fileKeys.length === 0 && from.has(r.key))
    rolls = rolls.filter(r => r.fileKeys.length > 0 || !from.has(r.key))
    this.set({ rolls, looseKeys, files })
    for (const roll of emptied) void this.deleteRoll(roll)
    this.syncOrder(toRollKey)
  }

  /** Puts every file of one roll at the end of another, and drops the first. */
  mergeRolls(fromKey: string, intoKey: string) {
    const from = this.state.rolls.find(r => r.key === fromKey)
    if (from) this.moveFiles(from.fileKeys, intoKey)
  }

  /** Moves the given files into a new roll of their own. */
  splitRoll(keys: string[], name: string) {
    const roll: ImportRoll = { key: newKey('r'), id: null, name, fileKeys: [] }
    this.set({ rolls: [...this.state.rolls, roll] })
    this.moveFiles(keys, roll.key)
  }

  private async deleteRoll(roll: ImportRoll) {
    const id = roll.id ?? (await this.rollPromises.get(roll.key)?.catch(() => null))
    if (!id) return
    // After the files have moved on the server, or the roll still has photos.
    await sleep(1500)
    await fetch(`/api/library/rolls/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  /** Sends a roll's order a moment after the last change, so a run of moves is one request. */
  private syncOrder(rollKey: string | null) {
    clearTimeout(this.orderSync.get(rollKey))
    this.orderSync.set(rollKey, setTimeout(() => { void this.flushOrder(rollKey).catch(() => {}) }, 800))
  }

  /**
   * Tells the server the roll and order of every frame in a roll: the files
   * registered in this import, and photos already in that roll from an
   * earlier one.
   */
  private async flushOrder(rollKey: string | null) {
    const keys = rollKey ? this.state.rolls.find(r => r.key === rollKey)?.fileKeys ?? [] : this.state.looseKeys
    const rollId = await this.ensureRoll(rollKey)
    const frames = keys.flatMap((k): Array<{ itemId: string } | { photoId: string }> => {
      const f = this.state.files[k]
      if (f?.itemId) return [{ itemId: f.itemId }]
      if (f?.phase === 'duplicate' && f.photoId && rollId && f.duplicateRollId === rollId) return [{ photoId: f.photoId }]
      return []
    })
    if (!frames.length) return
    await this.retrying(null, () => api('/api/library/import-items/move', {
      method: 'POST', body: { frames, rollId, firstPosition: 1 },
    }))
  }

  // --- leaving files out ---------------------------------------------------

  /** Takes a file out of the import; one already uploading has its upload thrown away. */
  async remove(key: string) {
    const file = this.state.files[key]
    if (!file || ['processing', 'done', 'completing'].includes(file.phase)) return
    if (file.itemId) await fetch(`/api/library/import-items/${file.itemId}`, { method: 'DELETE' }).catch(() => {})
    this.registerQueue = this.registerQueue.filter(k => k !== key)
    this.uploadQueue = this.uploadQueue.filter(k => k !== key)
    const files = { ...this.state.files }
    delete files[key]
    this.blobs.delete(key)
    if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview)
    this.set({
      files,
      rolls: this.state.rolls.map(r => ({ ...r, fileKeys: r.fileKeys.filter(k => k !== key) })).filter(r => r.fileKeys.length),
      looseKeys: this.state.looseKeys.filter(k => k !== key),
    })
  }
}

type Registration =
  | { clientId: string; outcome: 'upload'; itemId: string; partSize: number; partCount: number; uploadedParts: number[] }
  | { clientId: string; outcome: 'processing'; itemId: string }
  | { clientId: string; outcome: 'duplicate'; photoId: string; rollId: string | null; reason: string }
  | { clientId: string; outcome: 'refused'; reason: string }

interface ServerItem {
  id: string
  state: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'DONE' | 'FAILED'
  error: string | null
  photoId: string | null
  thumb: string | null
  held: boolean
  lookalike: { photoId: string; thumb: string } | null
  lookalikePending: boolean
}

function compareNames(a: ImportFile | undefined, b: ImportFile | undefined): number {
  return (a?.name ?? '').localeCompare(b?.name ?? '', undefined, { numeric: true, sensitivity: 'base' })
}

function partBytes(n: number, partSize: number, total: number): number {
  return Math.max(0, Math.min(partSize, total - (n - 1) * partSize))
}

/** The bucket refused the request itself, as for an expired signature. */
class PartRejected extends Error {}

/** PUTs one part, reporting bytes sent. XHR rather than fetch for upload progress. */
function putPart(url: string, body: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = event => onProgress(event.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else if (xhr.status === 403) reject(new PartRejected('The upload link expired'))
      else reject(new Error(`The upload was refused (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('The connection dropped'))
    xhr.ontimeout = () => reject(new Error('The upload timed out'))
    xhr.timeout = 5 * 60 * 1000
    xhr.send(body)
  })
}
