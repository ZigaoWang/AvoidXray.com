'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

type Submission = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  resourceType: 'camera' | 'filmstock'
  originalImage: string | null
  originalData: any
  proposedImage: string | null
  proposedData: any
  submittedBy: string
  submitterName: string
  submittedAt: string
}

type Props = {
  submission: Submission
  onClose: () => void
  onApprove: (editedData?: any) => void
  onReject: () => void
  processing: boolean
}

export default function ModerationDetailModal({
  submission,
  onClose,
  onApprove,
  onReject,
  processing
}: Props) {
  // Initialize editable state from proposed data
  const [editedData, setEditedData] = useState<any>({})

  // Initialize editedData when submission changes
  useEffect(() => {
    setEditedData(submission.proposedData || {})
  }, [submission.proposedData])

  // Calculate what actually changed
  const changes: string[] = []

  // Check if image actually changed (proposedImage exists AND is different from original)
  if (submission.proposedImage && submission.proposedImage !== submission.originalImage) {
    changes.push('image')
  }

  Object.keys(submission.proposedData || {}).forEach(key => {
    const oldValue = submission.originalData?.[key]
    const newValue = submission.proposedData?.[key]
    // Only count as changed if new value exists and is different
    if (newValue !== undefined && newValue !== null && newValue !== '' && oldValue !== newValue) {
      changes.push(key)
    }
  })

  const hasImageChange = changes.includes('image')
  const dataChanges = changes.filter(c => c !== 'image')

  const handleFieldChange = (field: string, value: string) => {
    setEditedData((prev: any) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleApprove = () => {
    // Only send fields that were actually in proposedData
    const finalData: any = {}
    Object.keys(submission.proposedData || {}).forEach(key => {
      finalData[key] = editedData[key] !== undefined ? editedData[key] : submission.proposedData[key]
    })
    onApprove(finalData)
  }

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
            className="text-neutral-500 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Changes Summary */}
        <div className="p-6 bg-neutral-800 border-b border-neutral-700">
          <h3 className="text-sm font-bold text-white mb-2">Changes Requested:</h3>
          <div className="flex flex-wrap gap-2">
            {hasImageChange && (
              <span className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded">
                Image Upload
              </span>
            )}
            {dataChanges.map(field => (
              <span key={field} className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded capitalize">
                {field}
              </span>
            ))}
          </div>
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
                {submission.originalImage ? (
                  <div className="relative aspect-square bg-neutral-800 border border-neutral-700">
                    <Image
                      src={submission.originalImage}
                      alt="Before"
                      fill
                      className="object-contain"
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
                {Object.entries(submission.originalData || {}).map(([key, value]) => (
                  <div key={key} className="border-b border-neutral-800 pb-2">
                    <div className="text-xs text-neutral-600 uppercase mb-1">{key}</div>
                    <div className="text-neutral-400">
                      {value ? String(value) : <span className="italic text-neutral-700">Empty</span>}
                    </div>
                  </div>
                ))}
                {Object.keys(submission.originalData || {}).length === 0 && (
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
                {submission.proposedImage ? (
                  <div className={`relative aspect-square bg-neutral-800 border ${hasImageChange ? 'border-yellow-500' : 'border-neutral-700'}`}>
                    <Image
                      src={submission.proposedImage}
                      alt="After"
                      fill
                      className="object-contain"
                    />
                  </div>
                ) : submission.originalImage ? (
                  <div className="relative aspect-square bg-neutral-800 border border-neutral-700">
                    <Image
                      src={submission.originalImage}
                      alt="Unchanged"
                      fill
                      className="object-contain"
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
                {Array.from(new Set([
                  ...Object.keys(submission.originalData || {}),
                  ...Object.keys(submission.proposedData || {})
                ])).map(key => {
                  const oldValue = submission.originalData?.[key]
                  const newValue = submission.proposedData?.[key]
                  const hasChanged = oldValue !== newValue && newValue !== undefined
                  const currentValue = editedData[key] !== undefined ? editedData[key] : (newValue !== undefined ? newValue : oldValue)

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
                          value={currentValue || ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          className="w-full bg-neutral-800 text-white px-3 py-2 text-sm border border-neutral-700 focus:border-yellow-500 focus:outline-none resize-none"
                          rows={3}
                          placeholder="Enter description..."
                        />
                      ) : (
                        <input
                          id={`field-${key}`}
                          type={key === 'year' || key === 'iso' ? 'number' : 'text'}
                          value={currentValue || ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          className="w-full bg-neutral-800 text-white px-3 py-2 text-sm border border-neutral-700 focus:border-yellow-500 focus:outline-none"
                          placeholder={`Enter ${key}...`}
                        />
                      )}

                      {hasChanged && oldValue && (
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
