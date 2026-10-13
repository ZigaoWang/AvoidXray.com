'use client'

import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { UserRow } from './ui/Modal'
import FollowButton from './FollowButton'

export interface Person {
  username: string
  name: string | null
  avatar: string | null
  /** Whether the viewer follows them, where the endpoint says. */
  following?: boolean
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
  followable = false,
  action: actionProp,
}: {
  /** The list endpoint; `cursor` is appended for later pages. */
  url: string
  emptyMessage: string
  onNavigate?: () => void
  /** Offer Follow beside each person, so following back does not mean
   *  opening each profile in turn. */
  followable?: boolean
  /** A control beside each row; `remove` drops the row once it has acted. */
  action?: (person: Person, remove: () => void) => React.ReactNode
}) {
  const action = actionProp ?? (followable
    ? (person: Person) => <FollowButton username={person.username} initialFollowing={Boolean(person.following)} />
    : undefined)
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
      {people.map(person => action ? (
        <div key={person.username} className="flex items-center">
          <div className="min-w-0 flex-1">
            <UserRow user={person} onNavigate={onNavigate ?? (() => {})} />
          </div>
          <div className="shrink-0 pr-4">
            {action(person, () => setPeople(current => (current ?? []).filter(p => p.username !== person.username)))}
          </div>
        </div>
      ) : (
        <UserRow key={person.username} user={person} onNavigate={onNavigate ?? (() => {})} />
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
