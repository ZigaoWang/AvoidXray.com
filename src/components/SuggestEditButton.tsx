'use client'

import { useState } from 'react'
import SuggestEditModal from './SuggestEditModal'

type SuggestEditButtonProps = {
  type: 'camera' | 'filmstock'
  id: string
  name: string
  brand: string | null
  currentImage: string | null
  currentDescription: string | null
  cameraType?: string | null
  format?: string | null
  year?: number | null
  defaultFilmStockId?: string | null
  filmType?: string | null
  iso?: number | null
  noDescription?: boolean
}

export default function SuggestEditButton({
  type, id, name, brand, currentImage, currentDescription,
  cameraType, format, year, defaultFilmStockId, filmType, iso, noDescription
}: SuggestEditButtonProps) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {noDescription && (
        <p className="text-neutral-600 text-sm mb-4">
          No description yet.{' '}
          <button onClick={() => setShowModal(true)} className="text-neutral-400 hover:text-white underline underline-offset-2 transition-colors">
            Suggest Edit
          </button>{' '}
          to contribute.
        </p>
      )}
      <button
        onClick={() => setShowModal(true)}
        className="w-full bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Suggest Edit
      </button>
      {showModal && (
        <SuggestEditModal
          type={type} id={id} name={name} brand={brand}
          currentImage={currentImage} currentDescription={currentDescription}
          cameraType={cameraType} format={format} year={year}
          defaultFilmStockId={defaultFilmStockId}
          filmType={filmType} iso={iso}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
