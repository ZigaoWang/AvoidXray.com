'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { fetchJson } from '@/lib/fetchJson'
import { makeZip, type ZipEntry } from '@/lib/zip'

export type ExportOriginalsRequest =
  | { scope: 'library' }
  | { scope: 'roll'; rollId: string }
  | { scope: 'album'; albumId: string }
  | { scope: 'selection'; photoIds: string[] }

type Answer =
  | { mode: 'browser'; zipName: string; othersLeftOut: number; files: { path: string; url: string; bytes: number | null }[]; metadata: { csv: string; json: string } }
  | { mode: 'server'; othersLeftOut: number; export: { photos: number } }

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
const othersNote = (n: number) => (n ? ` ${plural(n, 'photo')} by other people in this album ${n === 1 ? 'is' : 'are'} not included.` : '')

/** Saves a blob under a name, the way a download link would. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Download originals: a roll, an album, a selection or the whole library, as
 * the files exactly as uploaded with photos.csv and photos.json.
 *
 * The server decides how (src/lib/library/exports.ts). A small export comes
 * back as signed addresses, and this tab fetches the originals and zips them,
 * with a dialog counting them and a way to stop. A larger one is queued and
 * built on the server; this says so, and the bell says when it is ready.
 *
 * Returns `start` and the dialog to render.
 */
export function useExportOriginals() {
  const { toast } = useToast()
  const router = useRouter()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const stopped = useRef(false)

  const start = useCallback(async (request: ExportOriginalsRequest) => {
    let answer: Answer
    try {
      answer = await fetchJson<Answer>('/api/library/exports', { method: 'POST', body: request, fallback: 'Could not start the export' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start the export', 'error',
        { label: 'View exports', onClick: () => router.push('/library/exports') })
      return
    }

    if (answer.mode === 'server') {
      toast(`Building ${plural(answer.export.photos, 'original')} on the server. The bell will say when the download is ready.${othersNote(answer.othersLeftOut)}`,
        'success', { label: 'View exports', onClick: () => router.push('/library/exports') })
      return
    }

    const { files, metadata, zipName, othersLeftOut } = answer
    stopped.current = false
    setProgress({ done: 0, total: files.length })
    try {
      const entries: ZipEntry[] = []
      for (const [i, file] of files.entries()) {
        if (stopped.current) return
        const res = await fetch(file.url)
        if (!res.ok) throw new Error(`Could not download ${file.path.split('/').pop()}`)
        entries.push({ name: file.path, bytes: await res.blob() })
        setProgress({ done: i + 1, total: files.length })
      }
      if (stopped.current) return
      const encoder = new TextEncoder()
      entries.push({ name: 'photos.csv', bytes: encoder.encode(metadata.csv) }, { name: 'photos.json', bytes: encoder.encode(metadata.json) })
      save(await makeZip(entries), zipName)
      toast(`Exported ${plural(files.length, 'original')}.${othersNote(othersLeftOut)}`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The export stopped part way', 'error')
    } finally {
      setProgress(null)
    }
  }, [toast, router])

  const stop = () => {
    stopped.current = true
    setProgress(null)
  }

  const dialog = (
    <Modal open={progress !== null} onClose={stop} title="Downloading originals"
      description={progress ? `${progress.done.toLocaleString()} of ${plural(progress.total, 'photo')}` : undefined}>
      <div className="p-4">
        <div className="h-1 bg-neutral-800" role="progressbar" aria-valuemin={0} aria-valuemax={progress?.total ?? 0} aria-valuenow={progress?.done ?? 0}>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${progress ? (100 * progress.done) / progress.total : 0}%` }} />
        </div>
        <p className="mt-3 text-sm text-neutral-400">The files are zipped in this tab, exactly as uploaded. Keep it open until the download starts.</p>
      </div>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={stop}>Stop</Button>
      </ModalFooter>
    </Modal>
  )

  return { start, dialog, busy: progress !== null }
}
