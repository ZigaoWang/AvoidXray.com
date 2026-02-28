'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'

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
  // Initialize editable state from proposed data
  const [editedData, setEditedData] = useState<Record<string, unknown>>({})

  // Initialize editedData when submission changes
  useEffect(() => {
    setEditedData(submission.proposedData || {})
  }, [submission.proposedData])

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
    <div className="fixed inset-0 bg-black/90 z-50 flex items-start justify-center overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-5xl my-8 mx-4">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900 z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">{submission.name}</h2>
            {submission.brand && (
              <p className="text-neutral-500">{submission.brand}</p>
            )}
            <p className="text-sm text-neutral-600 mt-1">
              Submitted by {submission.submitterName} • {new Date(submission.submittedAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-neutral-500 hover:text-white disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                <span className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs">
                  Image Upload
                </span>
              )}
              {dataChanges.map(field => (
                <span key={field} className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs capitalize">
                  {field}
                </span>
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
                    />
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
              <h3 className="text-lg font-bold text-green-500 uppercase">After (Editable)</h3>

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
                    />
                  </div>
                ) : originalImageUrl ? (
                  <div className="relative aspect-square bg-neutral-800 border border-neutral-700">
                    <Image
                      src={originalImageUrl}
                      alt="Unchanged"
                      fill
                      className="object-contain"
                      unoptimized
                    />
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
                          className="w-full bg-neutral-800 text-white px-3 py-2 text-sm border border-neutral-700 focus:border-yellow-500 focus:outline-none resize-none disabled:opacity-50"
                          rows={3}
                          placeholder="Enter description..."
                        />
                      ) : (
                        <input
                          id={`field-${key}`}
                          type={key === 'year' || key === 'iso' ? 'number' : 'text'}
                          value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          disabled={processing}
                          className="w-full bg-neutral-800 text-white px-3 py-2 text-sm border border-neutral-700 focus:border-yellow-500 focus:outline-none disabled:opacity-50"
                          placeholder={`Enter ${key}...`}
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
          <button
            onClick={handleApprove}
            disabled={processing}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 font-medium disabled:opacity-50"
          >
            {processing ? 'Approving...' : 'Approve Changes'}
          </button>
          <button
            onClick={onReject}
            disabled={processing}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 font-medium disabled:opacity-50"
          >
            {processing ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            onClick={onClose}
            disabled={processing}
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
