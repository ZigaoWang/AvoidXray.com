import { importExtensionOf, MAX_IMPORT_FILE_BYTES, NOT_AN_IMPORT_TYPE } from '../importTypes'

/**
 * Turning a drop, a folder pick or a file pick into the files of an import,
 * each with the folder it came from. Browser only.
 */

export interface DroppedFile {
  file: File
  /** The folder the file was in, relative to what was dropped; null for a loose file. */
  folder: string | null
}

export interface RefusedFile {
  name: string
  reason: string
}

/** What a drop held: files to import, zips still to open, and files refused. */
export interface Collected {
  files: DroppedFile[]
  zips: DroppedFile[]
  refused: RefusedFile[]
}

/** Files a camera, a lab or an OS leaves beside scans, never meant to be imported. */
export function isSystemFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.startsWith('.') || path.includes('__MACOSX/') || /^(thumbs\.db|desktop\.ini)$/i.test(name)
}

export function isZip(name: string): boolean {
  return /\.zip$/i.test(name)
}

/** Sorts a file into imported, opened as a zip, or refused with a reason. */
export function classify(entry: DroppedFile, into: Collected) {
  const path = entry.folder ? `${entry.folder}/${entry.file.name}` : entry.file.name
  if (isSystemFile(path)) return
  if (isZip(entry.file.name)) { into.zips.push(entry); return }
  if (!importExtensionOf(entry.file.name)) { into.refused.push({ name: path, reason: NOT_AN_IMPORT_TYPE }); return }
  if (entry.file.size === 0) { into.refused.push({ name: path, reason: 'The file is empty' }); return }
  if (entry.file.size > MAX_IMPORT_FILE_BYTES) { into.refused.push({ name: path, reason: 'Larger than 1 GB' }); return }
  into.files.push(entry)
}

/** The folder part of a path, or null when there is none. */
export function folderOf(path: string): string | null {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : null
}

/**
 * Everything in a drop, folders read all the way down. A dropped folder's own
 * name is part of each file's folder, so dropping one roll's folder proposes
 * one roll named after it.
 */
export async function collectDrop(dataTransfer: DataTransfer): Promise<Collected> {
  const collected: Collected = { files: [], zips: [], refused: [] }
  const entries = Array.from(dataTransfer.items)
    .map(item => (item.kind === 'file' ? item.webkitGetAsEntry?.() ?? null : null))
  // Without entries (an old browser), the plain file list is all there is.
  if (entries.every(e => e === null)) {
    for (const file of Array.from(dataTransfer.files)) classify({ file, folder: null }, collected)
    return collected
  }
  for (const entry of entries) if (entry) await walk(entry, null, collected)
  return collected
}

async function walk(entry: FileSystemEntry, parent: string | null, into: Collected) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    classify({ file, folder: parent }, into)
    return
  }
  if (!entry.isDirectory || isSystemFile(`${entry.name}/`)) return
  const folder = parent ? `${parent}/${entry.name}` : entry.name
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries hands back a directory in batches; an empty batch is the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    for (const child of batch) await walk(child, folder, into)
  }
}

/** Files from an <input>, which carry their folder in webkitRelativePath when a folder was picked. */
export function collectPicked(files: FileList | File[]): Collected {
  const collected: Collected = { files: [], zips: [], refused: [] }
  for (const file of Array.from(files)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    classify({ file, folder: folderOf(relative) }, collected)
  }
  return collected
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** "2.jpg" before "10.jpg", as a person reads frame numbers. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

export interface ProposedRoll<T> {
  /** The folder the files came from, or null for the loose files of a drop. */
  folder: string | null
  /** The folder's last part, or empty for files dropped outside a folder: a roll with no title. */
  name: string
  files: T[]
}

/**
 * One proposed roll per folder that holds images, and one more for files
 * dropped outside any folder, frames in natural order of their names. Folders
 * are listed in natural order of their paths, the folderless roll last. That
 * roll has no title; it is a roll like the others, not loose photos.
 */
export function proposeRolls<T extends DroppedFile>(files: T[]): ProposedRoll<T>[] {
  const byFolder = new Map<string | null, T[]>()
  for (const file of files) {
    const list = byFolder.get(file.folder)
    if (list) list.push(file)
    else byFolder.set(file.folder, [file])
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : naturalCompare(a, b)))
    .map(([folder, list]) => ({
      folder,
      name: folder ? folder.slice(folder.lastIndexOf('/') + 1) : '',
      files: [...list].sort((x, y) => naturalCompare(x.file.name, y.file.name)),
    }))
}
