'use client'
import { useId } from 'react'
import type { LookId } from '@/lib/exportFormats'

/**
 * A small diagram of what a look actually makes.
 *
 * The shelf was six words. A word does not say whether Filmstrip means
 * perforations down the sides or a caption underneath, so the only way to find
 * out was to press each one and wait for a server render — six renders to read
 * a menu, and the reason to have named looks at all was to stop making people
 * assemble the thing before they can see it.
 *
 * Drawn rather than rendered, and the same for every photograph, because this
 * describes the arrangement and not the picture. The preview beside it is
 * already the truthful account of how this frame will come out; this only has
 * to say what the arrangement is, and can do that in a few rectangles.
 */
export default function LookMark({ look }: { look: LookId }) {
  // The perforations are cut out of the strip rather than painted over it, so
  // whatever the button's own background happens to be shows through them. A
  // hole filled with a fixed colour only matches one of the button's two states.
  const holes = useId()

  // currentColor throughout, so the mark takes the button's own state — muted
  // when the look is not chosen, white when it is — with no second palette.
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 }

  return (
    <svg viewBox="0 0 32 26" className="w-full h-6 mb-1.5" aria-hidden focusable="false">
      {look === 'print' && (
        <>
          <rect x="4.5" y="2.5" width="23" height="21" {...common} />
          <rect x="7.5" y="5.5" width="17" height="11" fill="currentColor" opacity="0.55" stroke="none" />
          <line x1="10" y1="19.5" x2="22" y2="19.5" {...common} />
          <line x1="13" y1="21.5" x2="19" y2="21.5" {...common} opacity="0.6" />
        </>
      )}

      {look === 'darkroom' && (
        <>
          <rect x="4.5" y="2.5" width="23" height="21" fill="currentColor" opacity="0.22" stroke="currentColor" strokeWidth={1} />
          <rect x="7.5" y="5.5" width="17" height="11" fill="currentColor" opacity="0.75" stroke="none" />
          <line x1="10" y1="19.5" x2="22" y2="19.5" {...common} />
          <line x1="13" y1="21.5" x2="19" y2="21.5" {...common} opacity="0.6" />
        </>
      )}

      {look === 'bare' && (
        <>
          <rect x="2.5" y="2.5" width="27" height="21" {...common} />
          <rect x="8.5" y="7.5" width="15" height="11" fill="currentColor" opacity="0.55" stroke="none" />
        </>
      )}

      {(look === 'filmstrip' || look === 'negative') && (
        <>
          <rect
            x="2.5"
            y="4.5"
            width="27"
            height="17"
            fill="currentColor"
            opacity={look === 'negative' ? 0.5 : 0.28}
            stroke="none"
            mask={`url(#${holes})`}
          />
          {/* Perforations along both long edges, which is what makes a strip a
              strip rather than a box with a picture in it. */}
          <mask id={holes}>
            <rect x="2.5" y="4.5" width="27" height="17" fill="white" />
            {[4, 9, 14, 19, 24].map(x => (
              <g key={x}>
                <rect x={x} y="5.6" width="4" height="2.4" fill="black" />
                <rect x={x} y="18" width="4" height="2.4" fill="black" />
              </g>
            ))}
          </mask>
          <rect
            x="4"
            y="9.4"
            width="24"
            height="7.2"
            fill="currentColor"
            opacity={look === 'negative' ? 0.9 : 0.7}
            stroke="none"
          />
        </>
      )}

      {look === 'slide' && (
        <>
          <rect x="5.5" y="1.5" width="21" height="23" rx="2" {...common} />
          <line x1="9" y1="5.5" x2="23" y2="5.5" {...common} opacity="0.6" />
          <rect x="8.5" y="8.5" width="15" height="9" fill="currentColor" opacity="0.75" stroke="none" />
          <line x1="10" y1="21.5" x2="22" y2="21.5" {...common} opacity="0.6" />
        </>
      )}
    </svg>
  )
}
