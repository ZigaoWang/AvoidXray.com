'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useAddCatalogItem } from '@/components/AddCatalogItem'

const NOUN = { camera: 'camera', film: 'film stock' } as const
const SECTION = { camera: 'cameras', film: 'films' } as const

/**
 * The one primary action on the film stock and camera indexes: add what is
 * missing, through the same form and review as every other picker, then go to
 * its page. Shown to signed-in visitors only.
 */
export default function AddCatalogButton({ type }: { type: 'camera' | 'film' }) {
  const { data: session } = useSession()
  const router = useRouter()
  const addItem = useAddCatalogItem()
  if (!session) return null
  return (
    <>
      <Button onClick={() => addItem.start(type, '', item => { router.push(`/${SECTION[type]}/${item.id}`); router.refresh() })}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
        </svg>
        Add {NOUN[type]}
      </Button>
      {addItem.dialog}
    </>
  )
}
