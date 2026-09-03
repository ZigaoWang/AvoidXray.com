'use client'

import { useState } from 'react'
import SuggestEditModal from './SuggestEditModal'
import Button from '@/components/ui/Button'

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
  exposures?: string | null
  process?: string | null
  colorBalance?: string | null
  manufacturer?: string | null
  aliases?: string[]
  noDescription?: boolean
}

export default function SuggestEditButton({
  type, id, name, brand, currentImage, currentDescription,
  cameraType, format, year, defaultFilmStockId, filmType, iso, exposures, noDescription,
  process, colorBalance, manufacturer, aliases
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
      <Button onClick={() => setShowModal(true)} variant="secondary" fullWidth>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Suggest edit
      </Button>
      {showModal && (
        <SuggestEditModal
          type={type} id={id} name={name} brand={brand}
          currentImage={currentImage} currentDescription={currentDescription}
          cameraType={cameraType} format={format} year={year}
          defaultFilmStockId={defaultFilmStockId}
          filmType={filmType} iso={iso} exposures={exposures}
          process={process} colorBalance={colorBalance}
          manufacturer={manufacturer} aliases={aliases}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
