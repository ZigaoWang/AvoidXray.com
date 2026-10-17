// FieldInput rather than the bare fieldClass string: this is a Server
// Component, and Field is a client module, so the component is what crosses
// the boundary cleanly.
import { FieldInput } from '@/components/ui/Field'
import Button from '@/components/ui/Button'

/**
 * The search box, the same on the empty page and above results. A plain GET
 * form, so searching works before or without JavaScript. A search inside a
 * profile or an album keeps that scope when the words change.
 */
export default function SearchForm({
  q = '',
  user,
  album,
  autoFocus = false,
  placeholder = 'Photos, people, gear',
}: {
  q?: string
  user?: string
  album?: string
  autoFocus?: boolean
  placeholder?: string
}) {
  return (
    <form action="/search" method="get" role="search" className="mb-8 flex gap-2">
      {user && <input type="hidden" name="user" value={user} />}
      {album && <input type="hidden" name="album" value={album} />}
      <label htmlFor="search-q" className="sr-only">Search</label>
      <FieldInput
        id="search-q"
        name="q"
        type="search"
        required
        defaultValue={q}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="submit" variant="primary">Search</Button>
    </form>
  )
}
