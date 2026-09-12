'use client'
import { useState } from 'react'
import WatermarkGenerator from './WatermarkGenerator'
import Button from './ui/Button'

interface WatermarkButtonProps {
  photoId: string
  camera?: string | null
  filmStock?: string | null
  takenDate?: string | null
  /** The photograph's own size, which decides how large an export it can fill. */
  width: number
  height: number
}

export default function WatermarkButton({ photoId, camera, filmStock, takenDate, width, height }: WatermarkButtonProps) {
  const [showGenerator, setShowGenerator] = useState(false)

  return (
    <>
      {/* The shared button, at the shared height.
          It was hand-rolled at py-2 with a brand-red border, directly under a
          hand-rolled py-2.5 link and above a py-2 toggle: three full-width
          controls in a stack, no two the same height, and the only resting
          brand color on the page was on a download. Red is reserved for the
          one action a screen wants from you, and taking a copy of someone
          else's photograph is not it. */}
      <Button variant="outline" size="md" fullWidth onClick={() => setShowGenerator(true)}>
        Download with watermark
      </Button>

      {showGenerator && (
        <WatermarkGenerator
          photoId={photoId}
          camera={camera}
          filmStock={filmStock}
          takenDate={takenDate}
          width={width}
          height={height}
          onClose={() => setShowGenerator(false)}
        />
      )}
    </>
  )
}
