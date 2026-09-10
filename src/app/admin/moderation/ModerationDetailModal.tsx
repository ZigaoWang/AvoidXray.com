'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { fieldClass, fieldClassMultiline } from '@/components/ui/Field'
import Button, { iconButtonClass } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/dialog'
import Badge from '@/components/ui/Badge'

type Submission = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  resourceType: 'camera' | 'filmstock'
  originalImage: string | null
  originalData: Record<string, unknown>
  proposedImage: string | null
  proposedData: Record<string, unknown>
  submittedBy: string
  submitterName: string
  submittedAt: string
}

type Props = {
  submission: Submission
  onClose: () => void
  onApprove: (editedData?: Record<string, unknown>) => void
  onReject: () => void
  processing: boolean
}

// Add cache-busting to image URL to prevent stale images
function getCacheBustedUrl(url: string | null): string | null {
  if (!url) return null
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

export default function ModerationDetailModal({
  submission,
  onClose,
  onApprove,
  onReject,
  processing
}: Props) {
  // The queue mounts this only for the submission being reviewed, so it is open
  // for as long as it exists. Escape is ignored while a decision is in flight,
  // the same way the close and cancel buttons are disabled: the modal is the
  // only thing reporting that the approve or reject is still running.
  const panelRef = useDialogBehavior({
    open: true,
    onClose: () => { if (!processing) onClose() },
  })

  // The edit form starts from the proposed data and diverges as the reviewer
  // types, so it is state rather than a derived value. Resetting it in an
  // effect rendered the previous submission's values for one frame when the
  // modal was reused; adjusting during render swaps them in the same pass.
  const [editedData, setEditedData] = useState<Record<string, unknown>>(
    () => submission.proposedData || {}
  )
  const [loadedFrom, setLoadedFrom] = useState(submission.proposedData)

  if (submission.proposedData !== loadedFrom) {
    setLoadedFrom(submission.proposedData)
    setEditedData(submission.proposedData || {})
  }

  // Calculate what actually changed
  const { hasImageChange, dataChanges, allChanges } = useMemo(() => {
    const changes: string[] = []

    // Check if image actually changed (proposedImage exists AND is different from original)
    const imageChanged = !!(submission.proposedImage && submission.proposedImage !== submission.originalImage)
    if (imageChanged) {
      changes.push('image')
    }

    const dataFields: string[] = []
    Object.keys(submission.proposedData || {}).forEach(key => {
      const oldValue = submission.originalData?.[key]
      const newValue = submission.proposedData?.[key]
      // Only count as changed if new value exists and is different
      if (newValue !== undefined && newValue !== null && newValue !== '' && oldValue !== newValue) {
        changes.push(key)
        dataFields.push(key)
      }
    })

    return {
      hasImageChange: imageChanged,
      dataChanges: dataFields,
      allChanges: changes
    }
  }, [submission])

  // Cache-busted URLs for images
  const originalImageUrl = useMemo(() => getCacheBustedUrl(submission.originalImage), [submission.originalImage])
  const proposedImageUrl = useMemo(() => getCacheBustedUrl(submission.proposedImage), [submission.proposedImage])

  const handleFieldChange = (field: string, value: string) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleApprove = () => {
    // Only send fields that were actually in proposedData
    const finalData: Record<string, unknown> = {}
    Object.keys(submission.proposedData || {}).forEach(key => {
      finalData[key] = editedData[key] !== undefined ? editedData[key] : submission.proposedData[key]
    })
    onApprove(finalData)
  }

  // Get all unique field keys from both original and proposed data
  const allFields = useMemo(() => {
    return Array.from(new Set([
      ...Object.keys(submission.originalData || {}),
      ...Object.keys(submission.proposedData || {})
    ]))
  }, [submission.originalData, submission.proposedData])

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderation-detail-title"
        className="bg-neutral-900 border border-neutral-800 w-full max-w-5xl my-8 mx-4 focus:outline-none"
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
          <div>
            <h2 id="moderation-detail-title" className="text-2xl font-bold text-white">{submission.name}</h2>
            {submission.brand && (
              <p className="text-neutral-500">{submission.brand}</p>
            )}
            <p className="text-sm text-neutral-600 mt-1">
              Submitted by {submission.submitterName} • {new Date(submission.submittedAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            aria-label="Close"
            className={`${iconButtonClass} -mr-3`}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Changes Summary */}
        <div className="p-6 bg-neutral-800 border-b border-neutral-700">
          <h3 className="text-sm font-bold text-white mb-2">Changes Requested:</h3>
          {allChanges.length === 0 ? (
            <p className="text-neutral-500 text-sm">No changes detected</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hasImageChange && (
                <Badge tone="info">Image Upload</Badge>
              )}
              {dataChanges.map(field => (
                <Badge key={field} tone="warning" className="capitalize">{field}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Before/After Comparison */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BEFORE */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-neutral-500 uppercase">Before (Current)</h3>

              {/* Image */}
              <div>
                <div className="text-sm text-neutral-600 mb-2">Image</div>
                {originalImageUrl ? (
                  <div className="relative aspect-square bg-neutral-800 border border-neutral-700">
                    <Image
                      src={originalImageUrl}
                      alt="Before"
                      fill
                      className="object-contain"
                      unoptimized
                    sizes="(max-width: 768px) 100vw, 50vw" />
                  </div>
                ) : (
                  <div className="aspect-square bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                    <span className="text-neutral-600">No image</span>
                  </div>
                )}
              </div>

              {/* Data Fields */}
              <div className="space-y-3">
                {allFields.map(key => {
                  const value = submission.originalData?.[key]
                  return (
                    <div key={key} className="border-b border-neutral-800 pb-2">
                      <div className="text-xs text-neutral-600 uppercase mb-1">{key}</div>
                      <div className="text-neutral-400">
                        {value !== undefined && value !== null && value !== ''
                          ? String(value)
                          : <span className="italic text-neutral-700">Empty</span>
                        }
                      </div>
                    </div>
                  )
                })}
                {allFields.length === 0 && (
                  <div className="text-neutral-700 italic">No data</div>
                )}
              </div>
            </div>

            {/* AFTER (EDITABLE) */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-neutral-500 uppercase">After</h3>

              {Object.keys(submission.proposedData || {}).length === 0 && (
                <p className="text-sm text-neutral-500">
                  This submission proposes an image. Field edits are reviewed in the
                  revisions queue.
                </p>
              )}

              {/* Image */}
              <div>
                <div className="text-sm text-neutral-600 mb-2">
                  Image {hasImageChange && <span className="text-yellow-500">• Changed</span>}
                </div>
                {hasImageChange && proposedImageUrl ? (
                  <div className="relative aspect-square bg-neutral-800 border border-yellow-500">
                    <Image
                      src={proposedImageUrl}
                      alt="After (Proposed)"
                      fill
                      className="object-contain"
                      unoptimized
                    sizes="(max-width: 768px) 100vw, 50vw" />
                  </div>
                ) : originalImageUrl ? (
                  <div className="relative aspect-square bg-neutral-800 border border-neutral-700">
                    <Image
                      src={originalImageUrl}
                      alt="Unchanged"
                      fill
                      className="object-contain"
                      unoptimized
                    sizes="(max-width: 768px) 100vw, 50vw" />
                  </div>
                ) : (
                  <div className="aspect-square bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                    <span className="text-neutral-600">No image</span>
                  </div>
                )}
              </div>

              {/* Editable Data Fields */}
              <div className="space-y-3">
                {allFields.map(key => {
                  const oldValue = submission.originalData?.[key]
                  const newValue = submission.proposedData?.[key]
                  const hasChanged = oldValue !== newValue && newValue !== undefined && newValue !== null && newValue !== ''
                  const currentValue = editedData[key] !== undefined
                    ? editedData[key]
                    : (newValue !== undefined ? newValue : oldValue)

                  // Only a field this submission proposes can be saved.
                  // Approving sends the proposed keys, so anything typed into
                  // the rest was discarded without a word, and an image-only
                  // submission proposes nothing at all, which is now every new
                  // one. Writing them back is not the fix either: originalData
                  // holds display-formatted values, and "C-41" or "Point &
                  // shoot" is not what those columns take.
                  if (!(key in (submission.proposedData || {}))) {
                    return (
                      <div key={key} className="border-b border-neutral-800 pb-3">
                        <div className="text-xs text-neutral-600 uppercase mb-1">{key}</div>
                        <div className="text-neutral-500">
                          {oldValue !== undefined && oldValue !== null && oldValue !== ''
                            ? String(oldValue)
                            : <span className="italic text-neutral-700">Empty</span>}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={key} className={`border-b pb-3 ${hasChanged ? 'border-yellow-500' : 'border-neutral-800'}`}>
                      <div className="text-xs uppercase mb-2 flex items-center gap-2">
                        <label htmlFor={`field-${key}`} className={hasChanged ? 'text-yellow-500' : 'text-neutral-600'}>{key}</label>
                        {hasChanged && <span className="text-yellow-500 text-xs">• Changed</span>}
                      </div>

                      {/* Editable Input */}
                      {key === 'description' ? (
                        <textarea
                          id={`field-${key}`}
                          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          disabled={processing}
                          className={`${fieldClassMultiline} resize-none focus:border-yellow-500 focus:ring-yellow-500`}
                          rows={3}
                          placeholder="Enter description…"
                        />
                      ) : (
                        <input
                          id={`field-${key}`}
                          type={key === 'year' || key === 'iso' ? 'number' : 'text'}
                          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          disabled={processing}
                          className={`${fieldClass} focus:border-yellow-500 focus:ring-yellow-500`}
                          placeholder={`Enter ${key}…`}
                        />
                      )}

                      {hasChanged && oldValue !== undefined && oldValue !== null && oldValue !== '' && (
                        <div className="text-xs text-neutral-600 mt-1">
                          Original: <span className="line-through">{String(oldValue)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Actions - Sticky Bottom */}
        <div className="p-6 border-t border-neutral-800 flex gap-3 sticky bottom-0 bg-neutral-900">
          <Button
            onClick={handleApprove}
            disabled={processing} className="flex-1">
            {processing ? 'Approving…' : 'Approve Changes'}
          </Button>
          <Button
            onClick={onReject}
            disabled={processing} variant="secondary" className="flex-1">
            {processing ? 'Rejecting…' : 'Reject'}
          </Button>
          <Button
            onClick={onClose}
            disabled={processing} variant="secondary">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
