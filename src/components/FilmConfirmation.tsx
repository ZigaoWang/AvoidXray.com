import Link from 'next/link'
import { checkboxClass } from '@/components/ui/Field'

/**
 * The promise asked before photos go public: shot on film, not nude or
 * sexual, and the uploader's to post. Ticked each time, never remembered: the
 * point is that reading it is unavoidable, between the last choice and the
 * button that publishes.
 */
export default function FilmConfirmation({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 border border-neutral-800 bg-neutral-900 p-4">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className={`mt-0.5 ${checkboxClass}`} />
      <span className="text-sm">
        <span className="block font-semibold text-white transition-colors group-hover:text-brand">These were shot on film</span>
        <span className="mt-0.5 block text-xs text-neutral-500">
          {/* The nudity rule is stated here rather than only on the guidelines
              page: this is the last screen before a photo goes up, and it is
              the one rule with no warning step. */}
          Not a phone, not a filter, nothing nude or sexual, and they&rsquo;re mine to post.{' '}
          <Link href="/guidelines" target="_blank" onClick={e => e.stopPropagation()} className="underline underline-offset-2 hover:text-neutral-300">
            The rules
          </Link>
        </span>
      </span>
    </label>
  )
}
