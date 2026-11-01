import Button, { ButtonLink } from './Button'

/**
 * Previous and Next under a paged list, with where you are between them.
 *
 * Links rather than buttons, so every page is a URL that can be shared,
 * reloaded and crawled.
 */
export default function Pager({
  page,
  lastPage,
  hrefFor,
  onPage,
  busy = false,
  className = 'mt-8',
}: {
  page: number
  lastPage: number
  className?: string
} & (
  /** Pages that live in the URL: links, so a page can be shared and reloaded. */
  | { hrefFor: (page: number) => string; onPage?: never; busy?: never }
  /** Pages kept in a client table's state, such as the admin tables. */
  | { onPage: (page: number) => void; hrefFor?: never; busy?: boolean }
)) {
  if (lastPage <= 1) return null
  const step = (to: number, label: string) => hrefFor
    ? <ButtonLink href={hrefFor(to)} variant="outline" size="sm">{label}</ButtonLink>
    : <Button variant="outline" size="sm" disabled={busy} onClick={() => onPage!(to)}>{label}</Button>
  return (
    <nav className={`${className} flex items-center justify-between`} aria-label="Pagination">
      <p className="text-xs tabular-nums text-neutral-500">Page {page} of {lastPage}</p>
      <div className="flex gap-2">
        {page > 1 && step(page - 1, 'Previous')}
        {page < lastPage && step(page + 1, 'Next')}
      </div>
    </nav>
  )
}
