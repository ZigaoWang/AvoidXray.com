'use client'

import { useState, useEffect, useId, useRef } from 'react'
import Image from 'next/image'
import type { NewItemPayload } from '@/lib/newItemForm'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { FieldHint } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import CatalogFields from '@/components/CatalogFields'
import { emptyDraft, resolvedFormat, type CatalogDraft } from '@/lib/catalogForm'
import type { FilmStockOption } from '@/lib/filmSearch'
import { IMAGE_FILE_ACCEPT } from '@/lib/validation'
import { focusRing } from '@/components/ui/focus'

/** One entry the catalog already holds that resembles what is being typed. */
type Suggestion = {
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  photoCount: number
  similarity: number
}

type Props = {
  type: 'camera' | 'film'
  initialName?: string
  onSubmit: (data: NewItemPayload) => void
  onCancel: () => void
  loading?: boolean
  error?: string | null
  filmStocks?: FilmStockOption[]
}

export default function NewItemModal({
  type, initialName = '', onSubmit, onCancel, loading = false, error, filmStocks = [],
}: Props) {
  const [draft, setDraft] = useState<CatalogDraft>(() => ({ ...emptyDraft(), name: initialName }))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  /**
   * Entries already in the catalog that look like the one being typed.
   *
   * The matcher and both endpoints have existed all along and nothing ever
   * called them, so "Nikon FM-2" happily joined "Nikon FM2": two hubs for one
   * body, with photographs, notes and revisions split between them and an
   * administrator left to merge by hand.
   */
  const [similar, setSimilar] = useState<Suggestion[]>([])

  const typeLabel = type === 'camera' ? 'camera' : 'film stock'
  const titleId = useId()
  const fieldId = useId()
  const nameRef = useRef<HTMLInputElement>(null)

  // Every caller renders this modal only while it is open, so there is no
  // `open` prop to pass through. Escape is ignored while the create is in
  // flight, matching the Cancel button, which is disabled for the same reason.
  const panelRef = useDialogBehavior({
    open: true,
    onClose: () => { if (!loading) onCancel() },
    initialFocus: nameRef,
  })

  // Clean up object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const update = (patch: Partial<CatalogDraft>) => setDraft(d => ({ ...d, ...patch }))

  /**
   * Asked on blur rather than on every keystroke: the endpoint scans the whole
   * table and allows thirty calls in five minutes, which a debounce on a name
   * being typed slowly would spend on one form.
   *
   * Silent on failure. This is advice, and a check that could not run is not
   * worth an error over the form somebody is filling in.
   */
  const findSimilar = async () => {
    const name = draft.name.trim()
    if (name.length < 2) {
      setSimilar([])
      return
    }
    try {
      const res = await fetch(
        type === 'camera' ? '/api/cameras/check-duplicates' : '/api/filmstocks/check-duplicates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, brand: draft.maker.trim() || null }),
        }
      )
      if (!res.ok) return
      const data = await res.json()
      setSimilar(Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 3) : [])
    } catch {
      // Advisory only.
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  /**
   * The fields the film form marks required really are required: process is
   * NOT NULL in the database, and the create endpoint rejects a request
   * without a manufacturer it can resolve. Gating the button here means the
   * requirement is visible before submitting rather than coming back as an
   * error afterwards. Everything else is a nudge, not a gate.
   */
  const missingRequired = type === 'film' && (!draft.process || !draft.maker.trim())
  const canSubmit = !!draft.name.trim() && !missingRequired && !loading

  const handleSubmit = () => {
    if (!canSubmit) return
    const format = resolvedFormat(draft)

    onSubmit({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      image: imageFile || undefined,
      aliases: draft.aliases.trim() || undefined,
      ...(type === 'camera'
        ? {
            brand: draft.maker.trim() || undefined,
            cameraType: draft.bodyType || undefined,
            format: draft.bodyType === 'DISPOSABLE' ? '35mm' : (format || undefined),
            year: draft.year || undefined,
            frameFormat: draft.frameFormat || undefined,
            defaultFilmStockId: draft.defaultFilmStockId || undefined,
          }
        : {
            manufacturer: draft.maker.trim() || undefined,
            format: format || undefined,
            iso: draft.iso || undefined,
            process: draft.process || undefined,
            colorBalance: draft.colorBalance || undefined,
            exposures: draft.exposures || undefined,
          }),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl my-4 md:my-8 focus:outline-none"
      >
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 id={titleId} className="text-xl md:text-2xl font-bold text-white">
                Add a {typeLabel}
              </h2>
              <p className="text-neutral-500 text-sm mt-1">
                It goes into the catalog for everyone, so fill in what you know.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              aria-label="Close"
              className={`-mr-3 ${iconButtonClass}`}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 border border-brand/40 bg-brand/10 p-3 text-sm text-white">
              {error}
            </div>
          )}

          <div className="space-y-4 md:space-y-6">
            <CatalogFields
              type={type}
              draft={draft}
              onChange={update}
              disabled={loading}
              filmStocks={filmStocks}
              idPrefix={fieldId}
              nameRef={nameRef}
              onIdentityBlur={findSimilar}
            />

            {/* Advisory, not a gate. Somebody adding a body the catalog already
                holds almost always does not know it is there, so showing it is
                the whole fix; the links open in a new tab so a half-filled form
                is not lost to checking. */}
            {similar.length > 0 && (
              <div className="border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-sm text-neutral-300">
                  Already in the catalog?
                </p>
                <ul className="mt-3 space-y-2">
                  {similar.map(item => (
                    <li key={item.id}>
                      <a
                        href={type === 'camera' ? `/cameras/${item.id}` : `/films/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-3 p-2 -m-2 transition-colors hover:bg-neutral-900 ${focusRing}`}
                      >
                        <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden bg-neutral-900">
                          {item.imageUrl && (
                            <Image src={item.imageUrl} alt="" fill sizes="40px" className="object-contain" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-white">
                            {item.brand && !item.name.startsWith(item.brand)
                              ? `${item.brand} ${item.name}`
                              : item.name}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {item.photoCount} {item.photoCount === 1 ? 'photo' : 'photos'}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-neutral-600">
                  If none of these is it, carry on below.
                </p>
              </div>
            )}

            <div>
              <FieldLabel htmlFor={`${fieldId}-image`}>Photo of the {typeLabel}</FieldLabel>
              <input
                id={`${fieldId}-image`}
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                onChange={handleFileSelect}
                disabled={loading}
                className="block w-full text-sm text-neutral-400
                  file:mr-3 file:py-2 file:px-3
                  file:border-0 file:text-sm file:font-medium
                  file:bg-neutral-800 file:text-white
                  hover:file:bg-neutral-700
                  disabled:opacity-50"
              />
              <FieldHint>The product itself, not a photo taken with it. A plain background works best.</FieldHint>
            </div>

            {previewUrl && (
              <div>
                <FieldCaption>Preview</FieldCaption>
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={previewUrl} alt="" fill className="object-contain" sizes="200px" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
                {loading ? 'Adding…' : `Add ${typeLabel}`}
              </Button>
              <Button onClick={onCancel} disabled={loading} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
