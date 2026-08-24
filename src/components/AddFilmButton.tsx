'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import NewItemModal from '@/components/NewItemModal'
import { buildNewItemFormData, CREATE_ENDPOINT, type NewItemPayload } from '@/lib/newItemForm'

export default function AddFilmButton() {
  const { data: session } = useSession()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return null

  const handleSubmit = async (data: NewItemPayload) => {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch(CREATE_ENDPOINT.film, {
        method: 'POST',
        body: buildNewItemFormData('film', data),
      })

      if (!res.ok) {
        if (res.status === 413) throw new Error('File too large. Maximum size is 10MB.')
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create film stock')
      }

      const filmStock = await res.json()
      setShowModal(false)
      router.push(`/films/${filmStock.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create film stock')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Film
      </button>

      {showModal && (
        <NewItemModal
          type="film"
          onSubmit={handleSubmit}
          onCancel={() => { setShowModal(false); setError(null) }}
          loading={creating}
          error={error}
        />
      )}
    </>
  )
}
