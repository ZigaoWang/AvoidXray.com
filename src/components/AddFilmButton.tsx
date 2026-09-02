'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import NewItemModal from '@/components/NewItemModal'
import Button from '@/components/ui/Button'
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
      {/* The shared component. Both of these were hand-rolled at sentence
          case and font-medium, so the one primary action on the films and
          cameras pages did not look like the primary action anywhere else on
          the site. */}
      <Button onClick={() => setShowModal(true)}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
        </svg>
        Add Film
      </Button>

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
