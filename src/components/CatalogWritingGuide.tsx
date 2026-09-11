import type { CatalogType } from '@/lib/catalogForm'
import { focusRingInset } from '@/components/ui/focus'

/**
 * How to write a catalog entry, next to the box it is written in.
 *
 * docs/writing-standard.md is the full answer and runs to several hundred
 * lines, which is right for somebody curating the catalog and useless to
 * somebody adding the camera they just shot a roll on. Nobody opens a style
 * guide before filling in a form. So this is the short version, in the one
 * place it can still change what gets typed.
 *
 * The rules here are the four from that document that actually decide whether
 * an entry reads like the rest of the catalog. Everything else in it is either
 * a curator's concern or follows from these.
 *
 * The example is a real entry rather than an invented one, so what it shows is
 * reachable rather than aspirational.
 */

const EXAMPLE = {
  camera: [
    'A 1993 zoom compact with a 38 to 115mm lens, sold as the Sure Shot Z115 in the Americas.',
    'The lens is ten elements in nine groups, one of them aspherical, and opens to f/3.6 at the wide end. It focuses to 0.6m.',
    'At 350g on two CR123A cells it is a lot of camera to carry for a compact. The long end is dim: f/8.5 at 115mm, so you are on flash or fast film well before you get there.',
  ],
  film: [
    'A fast black and white film made by Harman and sold under the Ilford name, in production since 1989.',
    'Tonality is soft and forgiving rather than punchy. Grain is clearly visible and reads as texture rather than noise.',
    'It is built to be shot at more than box speed, which is most of why people reach for it. It is the wrong choice when you want fine grain.',
  ],
} as const

const RULES: Record<CatalogType, string[]> = {
  camera: [
    'Open with one sentence saying what it is. That line becomes the short description.',
    'Then the lens, how it focuses and meters, and what it is like to carry.',
    'Skip anything already shown as a chip: body type, format, year.',
    'Write what you know and stop. No "iconic", no "legendary", no "the best".',
  ],
  film: [
    'Open with one sentence saying what it is. That line becomes the short description.',
    'Then how it looks, how it behaves, and what it is for.',
    'Skip anything already shown as a chip: ISO, process, format.',
    'Write what you know and stop. No "iconic", no "legendary", no "the best".',
  ],
}

export default function CatalogWritingGuide({ type }: { type: CatalogType }) {
  return (
    <details className="mt-2 border border-neutral-800 bg-neutral-900/40">
      <summary
        className={`cursor-pointer list-none px-3 py-2 text-xs text-neutral-400 transition-colors
                    hover:text-neutral-200 ${focusRingInset}
                    [&::-webkit-details-marker]:hidden`}
      >
        What a good entry looks like
      </summary>

      <div className="space-y-3 border-t border-neutral-800 px-3 py-3">
        <ol className="space-y-1 text-xs leading-relaxed text-neutral-400">
          {RULES[type].map(rule => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden className="text-neutral-600">&bull;</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>

        <div className="border-l-2 border-neutral-700 pl-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-600">Example</p>
          {EXAMPLE[type].map((paragraph, i) => (
            <p
              key={i}
              className={`text-xs leading-relaxed ${i === 0 ? 'text-neutral-300' : 'mt-1.5 text-neutral-500'}`}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </details>
  )
}
