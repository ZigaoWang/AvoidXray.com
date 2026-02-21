'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ModerationDetailModal from './ModerationDetailModal'

type Camera = {
  submissionId: string
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  description: string | null
  imageUploadedAt: string | null
  originalImage: string | null
  originalData: any
  proposedData: any
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
  originalData: any
  proposedData: any
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
  const [processing, setProcessing] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null)

  const fetchPendingItems = async () => {
    try {
      const res = await fetch('/api/admin/moderation')
      if (!res.ok) throw new Error('Failed to fetch')
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Failed to load pending items:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingItems()
  }, [])

  const handleModeration = async (
    submissionId: string,
    type: 'camera' | 'filmstock',
    action: 'approve' | 'reject',
    editedData?: any
  ) => {
    setProcessing(submissionId)
    try {
      const res = await fetch(`/api/admin/moderation/${type}/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, editedData })
      })

      if (!res.ok) throw new Error('Failed to moderate')

      const result = await res.json()
      alert(result.message)

      // Close modal and refresh
      setSelectedSubmission(null)
      await fetchPendingItems()
    } catch (error) {
      console.error('Moderation error:', error)
      alert('Failed to process moderation action')
    } finally {
      setProcessing(null)
    }
  }

  const getChangesCount = (item: Camera | FilmStock) => {
    let count = 0
    // Check if image actually changed
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

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="text-neutral-500">Loading pending items...</div>
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
                    {/* Thumbnail */}
                    <div className="relative w-20 h-20 bg-neutral-800 flex-shrink-0">
                      {camera.imageUrl ? (
                        <Image
                          src={camera.imageUrl}
                          alt={camera.name}
                          fill
                          className="object-contain"
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
                          {new Date(camera.imageUploadedAt || '').toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => setSelectedSubmission({
                        ...camera,
                        resourceType: 'camera',
                        submitterName: camera.user.username,
                        submittedAt: camera.imageUploadedAt
                      })}
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
                    {/* Thumbnail */}
                    <div className="relative w-20 h-20 bg-neutral-800 flex-shrink-0">
                      {filmStock.imageUrl ? (
                        <Image
                          src={filmStock.imageUrl}
                          alt={filmStock.name}
                          fill
                          className="object-contain"
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
                          {new Date(filmStock.imageUploadedAt || '').toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => setSelectedSubmission({
                        ...filmStock,
                        resourceType: 'filmstock',
                        submitterName: filmStock.uploader?.username || 'Unknown',
                        submittedAt: filmStock.imageUploadedAt
                      })}
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
