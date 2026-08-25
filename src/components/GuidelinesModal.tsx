'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { GUIDELINES } from '@/lib/guidelines'

/**
 * The rules, once, before someone's first upload.
 *
 * They started as a list on the form itself, which is the wrong place for six
 * of them: the person who most needs to read it is the one who has never been
 * here, and everyone else scrolls straight past. So it shows up once, for
 * people who have not published anything yet, and the form keeps only a single
 * line and a link.
 */
export default function GuidelinesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 w-full max-w-xl my-4 md:my-10 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 md:p-8">
          <p className="text-[#D32F2F] text-xs uppercase tracking-widest font-bold mb-3">
            Before your first upload
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight mb-3">
            If it went through a camera on a roll of film, it belongs here.
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-7">
            That&rsquo;s the whole rule. Here it is with the edges filled in.
          </p>

          <ol className="space-y-4 mb-8">
            {GUIDELINES.map((g, i) => (
              <li key={g.title} className="flex gap-3.5">
                <span
                  className="text-sm font-black text-neutral-700 tabular-nums leading-6 select-none"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-neutral-400 min-w-0">
                  <span className="text-white font-semibold">{g.title}.</span> {g.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-neutral-800">
            <Button onClick={onClose}>Got it</Button>
            <Link
              href="/guidelines"
              className="text-sm text-neutral-500 hover:text-white underline underline-offset-2"
            >
              Keep this open somewhere
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
