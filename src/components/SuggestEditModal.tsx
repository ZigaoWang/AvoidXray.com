'use client'

import { useState, useEffect, useId, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useToast } from './ui/Toast'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { FieldHint } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import CatalogFields from '@/components/CatalogFields'
import {
  catalogFields,
  draftFromRecord,
  type CatalogDraft,
  type CatalogRecord,
} from '@/lib/catalogForm'
import { displayName } from '@/lib/seo/alt'
import { IMAGE_FILE_ACCEPT } from '@/lib/validation'


type SuggestEditModalProps = {
  type: 'camera' | 'filmstock'
  /**
   * The record itself, rather than a field at a time.
   *
   * Every value used to arrive as its own prop, be rebuilt into a draft in a
   * second list, and be compared in a third that had to spell each field the
   * way the server does. Adding a control meant editing five lists and a
   * dependency array, and missing one of them left a field that never
   * pre-filled or never submitted.
   */
  record: CatalogRecord
  /** Only when it has been approved, which is the page's own rule. */
  currentImage: string | null
  onClose: () => void
}

export default function SuggestEditModal({
  type,
  record,
  currentImage,
  onClose
}: SuggestEditModalProps) {
  const kind = type === 'camera' ? 'camera' : 'film'
  const id = record.id
  const name = record.name
  const { data: session } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const fieldId = useId()

  /**
   * The record as it stands, and the same shape the add dialog holds.
   *
   * Kept beside the working copy so a change is a comparison rather than a
   * truthiness test. Asking "is this field filled in" instead proposed every
   * already-populated field as an edit, so correcting a description sent a
   * reviewer five fields nobody had touched.
   */
  const initial = useMemo<CatalogDraft>(() => draftFromRecord(kind, record), [kind, record])

  const [draft, setDraft] = useState<CatalogDraft>(initial)

  // Released when it is replaced and when the dialog closes, as NewItemModal
  // already does. Without it every picture chosen here stayed in memory for
  // the life of the page.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // The sign-in prompt stands in for the whole form, so only one of these two
  // overlays is ever on screen. Each gets its own call, keyed to the condition
  // that renders it, so the one that is not showing does not lock the page.
  const signInPanelRef = useDialogBehavior({ open: !session, onClose })
  const panelRef = useDialogBehavior({ open: !!session, onClose })

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div
          ref={signInPanelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggest-edit-signin-title"
          className="bg-neutral-900 border border-neutral-800 p-8 max-w-md w-full focus:outline-none"
        >
          <h2 id="suggest-edit-signin-title" className="text-xl font-bold text-white mb-4">Sign in required</h2>
          <p className="text-neutral-400 mb-6">
            You need to sign in to suggest edits.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push('/login')} fullWidth>
              Sign in
            </Button>
            <Button onClick={onClose} variant="secondary" fullWidth>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    // Checked first, so somebody who picked Other and left the box empty is
    // told that rather than "make some changes".
    if (draft.format.split(',').map(f => f.trim()).includes('Other') && !draft.customFormat.trim()) {
      toast('Please specify the custom format', 'error')
      return
    }

    if (!draft.name.trim()) {
      // Emptying the name would leave the record with nothing to be called and
      // no slug to live at, so it is refused here rather than at the database.
      toast('Please give this a name', 'error')
      return
    }

    /**
     * Every field against the value the dialog opened with, both sides built
     * by the same function.
     *
     * The handler treats each field it receives as a proposed edit, so an
     * unchanged one becomes a no-op sitting in front of a reviewer. Comparing
     * the two maps rather than field by field is what lets a control that has
     * been emptied be told from one nobody touched: the key is sent with an
     * empty value, and the endpoint reads that as a proposal to clear it. A
     * contributor could previously set a wrong year and never remove it.
     */
    const proposed = catalogFields(kind, draft)
    if (proposed.errors.length > 0) {
      toast(proposed.errors[0], 'error')
      return
    }
    const before = catalogFields(kind, initial).fields
    const changed = Object.entries(proposed.fields)
      .filter(([field, value]) => value !== (before[field] ?? ''))

    const descriptionChanged = draft.description.trim() !== initial.description.trim()

    if (!imageFile && !descriptionChanged && changed.length === 0) {
      toast('Please make some changes to submit', 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      if (imageFile) {
        formData.append('image', imageFile)
      }
      formData.append('description', draft.description)
      for (const [key, value] of changed) formData.append(key, value)

      const endpoint = type === 'camera' ? `/api/cameras/${id}/image` : `/api/filmstocks/${id}/image`
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit')
      }

      toast(data.message || 'Edit submitted for review', 'success')
      onClose()

      // Refresh the page data without full reload
      router.refresh()
    } catch (error) {
      console.error('Submit error:', error)
      toast(error instanceof Error ? error.message : 'Failed to submit edit', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-edit-title"
        className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl my-4 md:my-8 focus:outline-none"
      >
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h2 id="suggest-edit-title" className="text-xl md:text-2xl font-bold text-white">Suggest Edit</h2>
              <p className="text-neutral-500 text-sm mt-1">
                {displayName({
                  name,
                  brand: typeof record.brand === 'string' ? record.brand : null,
                  manufacturer: typeof record.manufacturer === 'string' ? record.manufacturer : null,
                }) ?? name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`ml-2 -mr-3 flex-shrink-0 ${iconButtonClass}`}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 md:space-y-6">
          <CatalogFields
            type={kind}
            draft={draft}
            onChange={patch => setDraft(d => ({ ...d, ...patch }))}
            disabled={uploading}
            idPrefix={fieldId}
            showRenameNote
          />

          {/* Picker first, then what you chose, matching the add dialog. The
              two forms share every other field and reordered only here, so
              adding a camera and then correcting it met the same step twice
              in two places. */}
          <div>
            <FieldLabel htmlFor={`${fieldId}-image`}>
              {currentImage ? 'Replace the photo' : `Photo of the ${type === 'camera' ? 'camera' : 'film stock'}`}
            </FieldLabel>
            <input
              id={`${fieldId}-image`}
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              onChange={handleFileSelect}
              disabled={uploading}
              className="block w-full text-sm text-neutral-400
                file:mr-3 file:py-2 file:px-3
                file:border-0 file:text-sm file:font-medium
                file:bg-neutral-800 file:text-white
                hover:file:bg-neutral-700
                disabled:opacity-50"
            />
            <FieldHint>The product itself, not a photo taken with it. A plain background works best.</FieldHint>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {currentImage && (
              <div>
                <FieldCaption>Current image</FieldCaption>
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={currentImage} alt={name} fill className="object-contain" sizes="200px" />
                </div>
              </div>
            )}
            {previewUrl && (
              <div>
                <FieldCaption>Replacement</FieldCaption>
                <div className="relative aspect-square w-full max-w-[200px] bg-neutral-800">
                  <Image src={previewUrl} alt="" fill className="object-contain" sizes="200px" />
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-neutral-800 border border-neutral-700 p-3 md:p-4">
            <p className="text-xs md:text-sm text-neutral-400">
              <strong className="text-white">Note:</strong> Your edit will be reviewed by admins before going live.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleSubmit}
              disabled={uploading} className="flex-1">
              {uploading ? 'Submitting…' : 'Submit for Review'}
            </Button>
            <Button onClick={onClose} disabled={uploading} variant="secondary">
              Cancel
            </Button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
