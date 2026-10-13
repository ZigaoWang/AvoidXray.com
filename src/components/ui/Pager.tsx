import { ButtonLink } from './Button'

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
}: {
  page: number
  lastPage: number
  hrefFor: (page: number) => string
}) {
  if (lastPage <= 1) return null
  return (
    <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
      <p className="text-xs tabular-nums text-neutral-500">Page {page} of {lastPage}</p>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink href={hrefFor(page - 1)} variant="outline" size="sm">Previous</ButtonLink>
        )}
        {page < lastPage && (
          <ButtonLink href={hrefFor(page + 1)} variant="outline" size="sm">Next</ButtonLink>
        )}
      </div>
    </nav>
  )
}
