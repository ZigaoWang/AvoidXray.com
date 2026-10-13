import { prisma } from './db'
import { hiddenUserIds } from './blocks'

export interface NoteListItem {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  edited: boolean
  user: { username: string; name: string | null; avatar: string | null }
  isAuthor: boolean
  helpfulCount: number
  votedHelpful: boolean
}

export interface NoteList {
  notes: NoteListItem[]
  canPost: boolean
  hasShotWith: boolean
  authenticated: boolean
}

export async function userHasShotWith(userId: string, targetType: string, targetId: string): Promise<boolean> {
  if (targetType === 'camera') {
    // Matched by name and brand rather than by id alone.
    //
    // The reason has changed since this was written. Cameras used to be one row
    // per user, and the comment here still described that model long after it
    // was replaced by shared catalog rows. What keeps the lookup is that
    // Camera.name carries no unique constraint, so two rows for one body can
    // exist until somebody merges them, and a note is about the camera rather
    // than about whichever of those rows a photo happens to point at.
    const target = await prisma.camera.findUnique({
      where: { id: targetId },
      select: { name: true, brand: true },
    })
    if (!target) return false
    const siblingIds = await prisma.camera.findMany({
      where: { name: target.name, brand: target.brand },
      select: { id: true },
    })
    const ids = siblingIds.map(c => c.id)
    if (ids.length === 0) return false
    const count = await prisma.photo.count({
      where: { userId, cameraId: { in: ids } },
    })
    return count > 0
  }

  // FilmStock names are globally unique — direct id match is safe.
  const count = await prisma.photo.count({
    where: { userId, filmStockId: targetId },
  })
  return count > 0
}

/**
 * The community notes on a film stock or camera, as the viewer sees them.
 *
 * Shared by the gear pages, which render them into their HTML, and the notes
 * endpoint, which the section refreshes from after a change. Notes by an
 * account the viewer has blocked, or been blocked by, are left out: a note is
 * a person's writing shown with their name, avatar and a link to their
 * profile, which is exactly what a block removes everywhere else.
 */
export async function noteList(targetType: string, targetId: string, userId: string | null | undefined): Promise<NoteList> {
  const hidden = await hiddenUserIds(userId)

  const notes = await prisma.communityNote.findMany({
    where: {
      targetType,
      targetId,
      ...(hidden.length > 0 ? { userId: { notIn: hidden } } : {}),
    },
    include: {
      user: { select: { username: true, name: true, avatar: true } },
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const [myVotes, hasShotWith] = await Promise.all([
    userId
      ? prisma.noteVote.findMany({
          where: { userId, noteId: { in: notes.map(n => n.id) } },
          select: { noteId: true },
        })
      : [],
    userId ? userHasShotWith(userId, targetType, targetId) : false,
  ])
  const myVoted = new Set(myVotes.map(v => v.noteId))

  return {
    notes: notes.map(n => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      edited: n.updatedAt.getTime() - n.createdAt.getTime() > 1000,
      user: n.user,
      isAuthor: userId ? n.userId === userId : false,
      helpfulCount: n._count.votes,
      votedHelpful: myVoted.has(n.id),
    })),
    canPost: !!userId && hasShotWith,
    hasShotWith,
    authenticated: !!userId,
  }
}
