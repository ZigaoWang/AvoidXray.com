'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface LightboxProps {
  src: string
  alt: string
  prevId?: string | null
  nextId?: string | null
}

export default function Lightbox({ src, alt, prevId, nextId }: LightboxProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowLeft' && prevId) window.location.href = `/photos/${prevId}`
      if (e.key === 'ArrowRight' && nextId) window.location.href = `/photos/${nextId}`
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, prevId, nextId])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute inset-0 cursor-zoom-in"
        aria-label="View fullscreen"
      />

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/60 hover:text-white p-2"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {prevId && (
            <a
              href={`/photos/${prevId}`}
              onClick={e => e.stopPropagation()}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
          )}

          {nextId && (
            <a
              href={`/photos/${nextId}`}
              onClick={e => e.stopPropagation()}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )}

          <div className="max-w-[90vw] max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
            <Image
              src={src}
              alt={alt}
              width={1920}
              height={1280}
              className="max-w-full max-h-[90vh] object-contain"
              priority
            />
          </div>

          <p className="absolute bottom-4 text-white/40 text-sm">Press ESC to close • Arrow keys to navigate</p>
        </div>
      )}
    </>
  )
}
