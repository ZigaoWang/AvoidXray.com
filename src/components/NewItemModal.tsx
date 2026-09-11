'use client'

import { useState, useEffect, useId, useRef } from 'react'
import Image from 'next/image'
import type { NewItemPayload } from '@/lib/newItemForm'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { FieldError, FieldHint } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CatalogFields from '@/components/CatalogFields'
import { catalogFields, emptyDraft, type CatalogDraft } from '@/lib/catalogForm'
import { IMAGE_FILE_ACCEPT } from '@/lib/validation'
import { isHeic } from '@/lib/previewImage'
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
}

export default function NewItemModal({
  type, initialName = '', onSubmit, onCancel, loading = false, error,
}: Props) {
  const [draft, setDraft] = useState<CatalogDraft>(() => ({ ...emptyDraft(), name: initialName }))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  /** A value the form could not read, named against the control that holds it. */
  const [fieldError, setFieldError] = useState<string | null>(null)
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
  const fieldId = useId()
  const nameRef = useRef<HTMLInputElement>(null)

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
    // HEIC has no reliable MIME type from a file picker, so it is checked by
    // name as well, the same rule the upload page uses. The create endpoint
    // converts it. Refusing it here on the type alone dropped the file with
    // nothing on screen to say why.
    if (!file.type.startsWith('image/') && !isHeic(file)) {
      setFileError('That is not an image file.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFileError(null)
    setImageFile(file)
    // Outside Safari nothing paints a HEIC object URL, so that one is named
    // rather than shown; a broken frame reads as a failed upload.
    setPreviewUrl(isHeic(file) ? null : URL.createObjectURL(file))
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

    // The same map the suggest-edit dialog diffs and the same one the create
    // route checks against the allowlist, so a control added to the form
    // cannot arrive at an endpoint that has never heard of it.
    const { fields, errors } = catalogFields(type, draft)
    if (errors.length > 0) {
      setFieldError(errors[0])
      return
    }
    setFieldError(null)

    onSubmit({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      image: imageFile || undefined,
      fields,
    })
  }

  return (
    // Every caller renders this modal only while it is open, so `open` is
    // constant. Escape, the backdrop and the close button are all held shut
    // while the create is in flight, matching the Cancel button beside it.
    <Modal
      open
      onClose={onCancel}
      busy={loading}
      size="lg"
      title={`Add a ${typeLabel}`}
      description="It goes into the catalog for everyone, so fill in what you know."
      initialFocus={nameRef}
    >
      <div className="p-4 md:p-6">
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
            {fileError
              ? <FieldError>{fileError}</FieldError>
              : <FieldHint>The product itself, not a photo taken with it. A plain background works best.</FieldHint>}
          </div>

          {imageFile && (
            <div>
              <FieldCaption>{previewUrl ? 'Preview' : 'Selected'}</FieldCaption>
              {previewUrl ? (
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={previewUrl} alt="" fill className="object-contain" sizes="200px" />
                </div>
              ) : (
                <p className="text-sm text-neutral-400 break-all">{imageFile.name}</p>
              )}
            </div>
          )}

          {fieldError && <FieldError>{fieldError}</FieldError>}

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
    </Modal>
  )
}
