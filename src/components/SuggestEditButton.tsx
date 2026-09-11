'use client'

import { useState } from 'react'
import SuggestEditModal from './SuggestEditModal'
import Button from '@/components/ui/Button'
import type { CatalogRecord } from '@/lib/catalogForm'

type SuggestEditButtonProps = {
  type: 'camera' | 'filmstock'
  /**
   * The whole record, passed straight through. This used to be fifteen scalar
   * props restated here and again in the modal, so every field the form grew
   * had to be threaded through two prop lists and a page's JSX before it
   * reached the control that edits it.
   */
  record: CatalogRecord
  /** Only when it has been approved, which is the page's own rule. */
  currentImage: string | null
}

/**
 * It used to also print "No description yet. Suggest edit to contribute."
 * above itself, whose link opened this same modal — the one action offered
 * twice, sixteen pixels apart, in two styles. Worse, the sentence it sat under
 * was the page's generated stand-in description, so a record with no
 * description of its own read as a paragraph followed by a denial that any
 * paragraph existed. The pages mark the stand-in where it actually is.
 */
export default function SuggestEditButton({
  type, record, currentImage,
}: SuggestEditButtonProps) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <Button onClick={() => setShowModal(true)} variant="secondary" fullWidth>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Suggest edit
      </Button>
      {showModal && (
        <SuggestEditModal
          type={type}
          record={record}
          currentImage={currentImage}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
