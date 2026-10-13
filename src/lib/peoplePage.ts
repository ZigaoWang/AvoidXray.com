import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from './db'

/**
 * One page of a people list: who liked a photo, who follows an account, whom
 * it follows.
 *
 * These lists had no limit, so a popular photo or account sent every row on
 * every open. They page the way comments do, a fixed page and a cursor, and
 * the cursor is the row id with createdAt ordering, so a like or follow that
 * lands mid-read neither repeats a row nor skips one.
 */
export const PEOPLE_PAGE_SIZE = 50

/** The findMany arguments for the page a request asks for. */
export function peoplePageArgs(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get('cursor')
  return {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    // One over the page, so whether another follows is answered by this read.
    take: PEOPLE_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  }
}

/**
 * The response for rows read with `peoplePageArgs`.
 *
 * Each person carries whether the viewer follows them, so a list of people
 * can offer Follow on each row rather than sending the reader to every
 * profile in turn.
 */
export async function peoplePageResponse<Row extends { id: string }, Person extends { id: string }>(
  rows: Row[],
  person: (row: Row) => Person,
  viewerId: string | null,
) {
  const hasMore = rows.length > PEOPLE_PAGE_SIZE
  const page = (hasMore ? rows.slice(0, PEOPLE_PAGE_SIZE) : rows).map(row => ({ row, person: person(row) }))
  const followed = viewerId
    ? new Set((await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: page.map(p => p.person.id) } },
        select: { followingId: true },
      })).map(f => f.followingId))
    : new Set<string>()
  return NextResponse.json({
    people: page.map(p => ({ ...p.person, following: followed.has(p.person.id) })),
    nextCursor: hasMore ? page[page.length - 1].row.id : null,
  })
}
