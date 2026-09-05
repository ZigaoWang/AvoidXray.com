/**
 * Where a value came from, offered next to it.
 *
 * An offer to check, not a claim of quality. So it is a small link and nothing
 * else: no badge, no colour, no icon that needs explaining. Absence means
 * nobody has recorded a source yet, which is the ordinary state of most of the
 * catalogue and is not an accusation.
 *
 * The reverse view, marking what is uncited, belongs in admin, where the point
 * is to work through the backlog. Same data, opposite default, because a
 * visitor wants to know what is checked and a maintainer wants to know what is
 * not.
 *
 * Worth revisiting once cited fields outnumber uncited ones, at which point
 * marking the exceptions becomes the informative direction again.
 */
export default function SourceLink({ url, label = 'source' }: { url?: string | null; label?: string }) {
  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="ml-1.5 text-[11px] text-neutral-600 underline decoration-neutral-800 underline-offset-2
                 hover:text-neutral-400 hover:decoration-neutral-600"
      title="Where this came from"
    >
      {label}
    </a>
  )
}
