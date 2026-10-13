import { prisma } from './db'
import { bylineUserSelect } from './publicUser'
import { hiddenUserIds } from './blocks'

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
 * Paged from a timestamp rather than an offset. A conversation is written
 * into from the top while it is being read, and every comment posted during a
 * read would shift an offset by one — sending the row at the boundary twice,
 * or never.
 */
export async function commentPage(photoId: string, viewerId: string | null, before?: Date): Promise<CommentPage> {
  const hidden = await hiddenUserIds(viewerId)
  const where = { photoId, ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}) }

  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where: { ...where, ...(before ? { createdAt: { lt: before } } : {}) },
      select: { id: true, content: true, createdAt: true, user: { select: bylineUserSelect } },
      orderBy: { createdAt: 'desc' },
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
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    ...(total === undefined ? {} : { total }),
  }
}
