'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ModerationDetailModal from './ModerationDetailModal'

type Submission = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  resourceType: 'camera' | 'filmstock'
  proposedImage: string | null
  originalImage: string | null
  originalData: Record<string, unknown>
  proposedData: Record<string, unknown>
  submittedBy: string
  submitterName: string
  submittedAt: string
}

type Camera = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  description: string | null
  imageUploadedAt: string | null
  originalImage: string | null
  originalData: Record<string, unknown>
  proposedData: Record<string, unknown>
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
}

type FilmStock = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  iso: number | null
  imageUrl: string | null
  description: string | null
  imageUploadedAt: string | null
  originalImage: string | null
  originalData: Record<string, unknown>
  proposedData: Record<string, unknown>
  uploader: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  } | null
}

type ModerationData = {
  cameras: Camera[]
  filmStocks: FilmStock[]
  total: number
}

export default function ModerationQueue() {
  const [data, setData] = useState<ModerationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

  const fetchPendingItems = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/moderation')
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Failed to load pending items:', err)
      setError(err instanceof Error ? err.message : 'Failed to load pending items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPendingItems()
  }, [fetchPendingItems])

  const handleModeration = async (
    submissionId: string,
    type: 'camera' | 'filmstock',
    action: 'approve' | 'reject',
    editedData?: Record<string, unknown>
  ) => {
    setProcessing(submissionId)
    try {
      const res = await fetch(`/api/admin/moderation/${type}/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, editedData })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to moderate')
      }

      const result = await res.json()
      alert(result.message)

      // Close modal and refresh
      setSelectedSubmission(null)
      await fetchPendingItems()
    } catch (err) {
      console.error('Moderation error:', err)
      alert(err instanceof Error ? err.message : 'Failed to process moderation action')
    } finally {
      setProcessing(null)
    }
  }

  const getChangesCount = (item: Camera | FilmStock) => {
    let count = 0
    // Check if image actually changed (imageUrl is the proposed image from API)
    if (item.imageUrl && item.imageUrl !== item.originalImage) count++
    // Check each data field
    Object.keys(item.proposedData || {}).forEach(key => {
      const oldValue = (item.originalData || {})[key]
      const newValue = item.proposedData[key]
      if (oldValue !== newValue && newValue !== undefined && newValue !== null && newValue !== '') {
        count++
      }
    })
    return count
  }

  // Transform camera to submission format for the modal
  const cameraToSubmission = (camera: Camera): Submission => ({
    submissionId: camera.submissionId,
    id: camera.id,
    name: camera.name,
    brand: camera.brand,
    resourceType: 'camera',
    proposedImage: camera.imageUrl, // imageUrl from API is the proposed image
    originalImage: camera.originalImage,
    originalData: camera.originalData || {},
    proposedData: camera.proposedData || {},
    submittedBy: camera.user.id,
    submitterName: camera.user.username,
    submittedAt: camera.imageUploadedAt || new Date().toISOString()
  })

  // Transform filmstock to submission format for the modal
  const filmStockToSubmission = (filmStock: FilmStock): Submission => ({
    submissionId: filmStock.submissionId,
    id: filmStock.id,
    name: filmStock.name,
    brand: filmStock.brand,
    resourceType: 'filmstock',
    proposedImage: filmStock.imageUrl, // imageUrl from API is the proposed image
    originalImage: filmStock.originalImage,
    originalData: filmStock.originalData || {},
    proposedData: filmStock.proposedData || {},
    submittedBy: filmStock.uploader?.id || '',
    submitterName: filmStock.uploader?.username || 'Unknown',
    submittedAt: filmStock.imageUploadedAt || new Date().toISOString()
  })

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="text-neutral-500">Loading pending items...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neutral-900 p-6 text-center">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={() => {
            setLoading(true)
            fetchPendingItems()
          }}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="bg-neutral-900 p-6 text-center">
        <div className="text-neutral-500">No pending items to review</div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
        {/* Pending Cameras */}
        {data.cameras.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">
              Pending Cameras ({data.cameras.length})
            </h3>
            <div className="space-y-3">
              {data.cameras.map(camera => {
                const changesCount = getChangesCount(camera)
                return (
                  <div
                    key={camera.submissionId}
                    className="bg-neutral-900 border border-neutral-800 p-4 flex items-center gap-4"
                  >
                    {/* Thumbnail - show proposed image */}
                    <div className="relative w-20 h-20 bg-neutral-800 flex-shrink-0">
                      {camera.imageUrl ? (
                        <Image
                          src={camera.imageUrl}
                          alt={camera.name}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white">{camera.name}</h4>
                      {camera.brand && (
                        <p className="text-sm text-neutral-500">{camera.brand}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="text-neutral-600">
                          {changesCount} change{changesCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-neutral-700">•</span>
                        <Link
                          href={`/${camera.user.username}`}
                          className="text-neutral-500 hover:text-white"
                        >
                          @{camera.user.username}
                        </Link>
                        <span className="text-neutral-700">•</span>
                        <span className="text-neutral-600">
                          {camera.imageUploadedAt ? new Date(camera.imageUploadedAt).toLocaleDateString() : 'Unknown date'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => setSelectedSubmission(cameraToSubmission(camera))}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Pending Film Stocks */}
        {data.filmStocks.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">
              Pending Film Stocks ({data.filmStocks.length})
            </h3>
            <div className="space-y-3">
              {data.filmStocks.map(filmStock => {
                const changesCount = getChangesCount(filmStock)
                return (
                  <div
                    key={filmStock.submissionId}
                    className="bg-neutral-900 border border-neutral-800 p-4 flex items-center gap-4"
                  >
                    {/* Thumbnail - show proposed image */}
                    <div className="relative w-20 h-20 bg-neutral-800 flex-shrink-0">
                      {filmStock.imageUrl ? (
                        <Image
                          src={filmStock.imageUrl}
                          alt={filmStock.name}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white">{filmStock.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        {filmStock.brand && <span>{filmStock.brand}</span>}
                        {filmStock.iso && (
                          <>
                            {filmStock.brand && <span>•</span>}
                            <span>ISO {filmStock.iso}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="text-neutral-600">
                          {changesCount} change{changesCount !== 1 ? 's' : ''}
                        </span>
                        {filmStock.uploader && (
                          <>
                            <span className="text-neutral-700">•</span>
                            <Link
                              href={`/${filmStock.uploader.username}`}
                              className="text-neutral-500 hover:text-white"
                            >
                              @{filmStock.uploader.username}
                            </Link>
                          </>
                        )}
                        <span className="text-neutral-700">•</span>
                        <span className="text-neutral-600">
                          {filmStock.imageUploadedAt ? new Date(filmStock.imageUploadedAt).toLocaleDateString() : 'Unknown date'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => setSelectedSubmission(filmStockToSubmission(filmStock))}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedSubmission && (
        <ModerationDetailModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          onApprove={(editedData) => handleModeration(
            selectedSubmission.submissionId,
            selectedSubmission.resourceType,
            'approve',
            editedData
          )}
          onReject={() => handleModeration(
            selectedSubmission.submissionId,
            selectedSubmission.resourceType,
            'reject'
          )}
          processing={processing === selectedSubmission.submissionId}
        />
      )}
    </>
  )
}
