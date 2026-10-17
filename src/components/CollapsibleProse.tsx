'use client'

import { useState } from 'react'

/**
 * A film or camera description that folds after its first paragraph on a
 * phone.
 *
 * Five paragraphs and a spec table stood between a phone and the first sample
 * photo, about a screen and a half of reading on a page that exists to show
 * photographs. Wider screens set the text beside the image and show all of it.
 * The folded paragraphs are hidden with CSS, not left out, so the whole text is
 * still in the page for search engines and screen readers that read it.
 */
export default function CollapsibleProse({ paragraphs }: { paragraphs: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-400">
      {paragraphs.map((para, i) => (
        <p key={i} className={i > 0 && !open ? 'hidden md:block' : undefined}>{para}</p>
      ))}
      {paragraphs.length > 1 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden text-sm font-medium text-white underline decoration-neutral-600 underline-offset-4 hover:decoration-white"
        >
          Read more
        </button>
      )}
    </div>
  )
}
