import { prisma } from './db'
import { bylineUserSelect } from './publicUser'
import { hiddenUserIds } from './blocks'
import { encodeCursor } from './notifications'

/**
 * How many comments one page holds.
 *
 * There was no `take` at all, so a photo that had collected a thousand
 * comments sent all thousand — each with a byline joined onto it — to every
 * reader who opened the page, and the response grew for as long as the
 * conversation did. Fifty is several screens' worth and a bounded index read.
 */
const PAGE_SIZE = 50

export interface CommentPage {
  comments: { id: string; content: string; createdAt: string; user: { username: string; name: string | null; avatar: string | null } }[]
  nextCursor: string | null
  /** Only on the first page: the photo's whole count, which the heading names. */
  total?: number
}

/**
 * One page of the conversation under a photo, newest first, without the
 * accounts the viewer has blocked or been blocked by.
 *
 * Shared by the photo page, which renders the first page into its HTML, and
 * the comments endpoint, which serves the pages after it. The caller has
 * already checked that the viewer may see the photo.
 *
 * Paged from a position rather than an offset. A conversation is written
 * into from the top while it is being read, and every comment posted during a
 * read would shift an offset by one — sending the row at the boundary twice,
 * or never. The position is (createdAt, id), as notifications page: on the
 * timestamp alone, two comments in the same millisecond on either side of a
 * page boundary lost the second one.
 */
export async function commentPage(
  photoId: string,
  viewerId: string | null,
  /** Without an id, from a cursor issued before ids were part of it. */
  before?: { createdAt: Date; id?: string },
): Promise<CommentPage> {
  const hidden = await hiddenUserIds(viewerId)
  const where = { photoId, ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}) }

  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        ...where,
        ...(before?.id
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : before ? { createdAt: { lt: before.createdAt } } : {}),
      },
      select: { id: true, content: true, createdAt: true, user: { select: bylineUserSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One over the page, so whether there is another one is answered by the
      // same read instead of a second query.
      take: PAGE_SIZE + 1,
    }),
    // Counted for the first page only: it is a fact about the photo, not about
    // how far down the reader has paged.
    before ? undefined : prisma.comment.count({ where }),
  ])

  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return {
    comments: page.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })),
    // Where the next request resumes: the oldest row handed over here.
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    ...(total === undefined ? {} : { total }),
  }
}
