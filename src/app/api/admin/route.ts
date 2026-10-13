import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { readJsonObject, invalidBody, asString, asBoolean } from '@/lib/requestBody'

/**
 * Reads only the flag it needs. This fetched the entire user row —
 * passwordHash, reset token, verification token and all — to look at one
 * boolean, on every admin request.
 */
async function isAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })
  return user?.isAdmin === true
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const type = asString(body.type)
  const id = asString(body.id)
  // Every branch below addresses a row by this id; without it the query goes
  // to Prisma as undefined and comes back as a 500.
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  if (type === 'user') {
    // Get all photos from this user to delete from OSS
    const photos = await prisma.photo.findMany({
      where: { userId: id },
      select: { originalPath: true, mediumPath: true, thumbnailPath: true }
    })

    // Delete all photo files from OSS
    const ossKeys = photos.flatMap(photo =>
      [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
        .map(extractKeyFromUrl)
        .filter((k): k is string => k !== null)
    )
    await Promise.all(ossKeys.map(key => deleteFromOSS(key).catch(() => {})))

    // Delete notifications where this user is the actor (not covered by cascade)
    await prisma.notification.deleteMany({ where: { actorId: id } })

    // Delete moderation submissions by this user
    await prisma.moderationSubmission.deleteMany({ where: { submittedBy: id } })

    // Now delete the user (cascades to photos, likes, comments, follows,
    // notifications and collections). Cameras and film stocks they added stay:
    // Camera.addedById is SetNull precisely because a catalog entry is a shared
    // record and not the property of whoever typed it in first.
    await prisma.user.delete({ where: { id } })
  } else if (type === 'photo') {
    const photo = await prisma.photo.findUnique({ where: { id } })
    if (photo) {
      const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
        .map(extractKeyFromUrl)
        .filter((k): k is string => k !== null)
      await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))
      await prisma.photo.delete({ where: { id } })
    }
  } else if (type === 'comment') {
    await prisma.comment.delete({ where: { id } })
  } else if (type === 'camera') {
    await prisma.camera.delete({ where: { id } })
  } else if (type === 'filmStock') {
    await prisma.filmStock.delete({ where: { id } })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const body = await readJsonObject(req)

  if (!body) return invalidBody()

  const type = asString(body.type)
  const targetId = asString(body.userId)
  const makeAdmin = asBoolean(body.isAdmin)

  // The camera and film rename branch that used to live here is gone. It wrote
  // straight to the record with no history and no reslug, so a rename through
  // it left the URL behind, and nothing had called it since the admin table
  // moved to /api/admin/resources. Renames go through the revision pipeline.
  if (type === 'cleanup') {
    // Clean up orphaned records from deleted users
    const existingUserIds = (await prisma.user.findMany({ select: { id: true } })).map(u => u.id)

    // Delete notifications where actor no longer exists
    const deletedNotifications = await prisma.notification.deleteMany({
      where: { actorId: { notIn: existingUserIds } }
    })

    // Delete moderation submissions where submitter no longer exists
    const deletedSubmissions = await prisma.moderationSubmission.deleteMany({
      where: { submittedBy: { notIn: existingUserIds } }
    })

    // Cameras and film stocks are deliberately not touched. This swept away
    // every catalog row that happened to have no photos yet, which is not an
    // orphan: it is an entry nobody has shot with, including one an
    // administrator wrote by hand that morning. It also ran on every user and
    // photo deletion, so a record created during an upload could be deleted
    // out from under the person still uploading against it.
    return NextResponse.json({
      success: true,
      cleaned: {
        notifications: deletedNotifications.count,
        moderationSubmissions: deletedSubmissions.count,
      }
    })
  } else if (targetId && makeAdmin !== undefined) {
    // Both required: a missing flag would otherwise reach Prisma as undefined
    // and silently update nothing while reporting success.
    await prisma.user.update({ where: { id: targetId }, data: { isAdmin: makeAdmin } })
  }

  return NextResponse.json({ success: true })
}
