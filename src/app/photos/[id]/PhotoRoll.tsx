import Link from 'next/link'
import { focusRingInset } from '@/components/ui/focus'
import { eyebrowClass } from '@/components/ui/PageHeader'
import { publicRollText, photoCount, type PublicRoll } from '@/lib/publicRoll'

/**
 * The roll a photograph came from, linking to the roll's page. Drawn like a
 * row of the Albums card beside it, so the two sets a photo belongs to read
 * alike. Shown only while the roll has a page, which is while anything in it
 * is published.
 */
export default function PhotoRoll({ roll, published }: { roll: PublicRoll; published: number }) {
  const { name, line } = publicRollText(roll)
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-4">
      <h2 className={`${eyebrowClass} mb-3`}>From the roll</h2>
      <Link
        href={`/rolls/${roll.id}`}
        className={`group flex items-center gap-3 border border-neutral-800 p-3 hover:border-brand transition-colors ${focusRingInset}`}
      >
        <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <span className="flex-1 min-w-0">
          <span className="block text-white text-sm font-medium truncate group-hover:text-brand transition-colors">{name}</span>
          <span className="block text-neutral-500 text-xs mt-0.5">
            {[line, photoCount(published)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <svg className="w-4 h-4 text-neutral-600 group-hover:text-brand transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}
