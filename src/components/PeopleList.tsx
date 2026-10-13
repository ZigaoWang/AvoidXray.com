'use client'

import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { UserRow } from './ui/Modal'

interface Person {
  username: string
  name: string | null
  avatar: string | null
}

/**
 * A paged list of people inside a modal: who liked a photo, followers,
 * following.
 *
 * The liked-by and follower modals each fetched a whole list and rendered all
 * of it. The endpoints now answer fifty at a time with a cursor, and this is
 * the one client for them, so both modals page, fail and empty the same way.
 */
export default function PeopleList({
  url,
  emptyMessage,
  onNavigate,
}: {
  /** The list endpoint; `cursor` is appended for later pages. */
  url: string
  emptyMessage: string
  onNavigate: () => void
}) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = async (after: string | null) => {
    const res = await fetch(after ? `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(after)}` : url)
    if (!res.ok) throw new Error()
    const data = await res.json()
    if (!Array.isArray(data?.people)) throw new Error()
    return data as { people: Person[]; nextCursor: string | null }
  }

  useEffect(() => {
    let canceled = false
    fetchPage(null)
      .then(data => {
        if (canceled) return
        setPeople(data.people)
        setCursor(data.nextCursor)
      })
      .catch(() => { if (!canceled) setFailed(true) })
    return () => { canceled = true }
    // fetchPage only reads `url`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(cursor)
      setPeople(current => [...(current ?? []), ...data.people])
      setCursor(data.nextCursor)
    } catch {
      setFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  if (people === null && !failed) {
    return <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
  }
  if (people === null || (failed && people.length === 0)) {
    return <p className="py-8 text-center text-sm text-neutral-500">Could not load this list.</p>
  }
  if (people.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">{emptyMessage}</p>
  }

  return (
    <>
      {people.map(person => (
        <UserRow key={person.username} user={person} onNavigate={onNavigate} />
      ))}
      {failed ? (
        <p className="py-4 text-center text-sm text-neutral-500">Could not load more.</p>
      ) : cursor ? (
        <div className="py-3 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </>
  )
}
