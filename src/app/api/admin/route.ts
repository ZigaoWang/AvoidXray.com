import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isRecordNotFound } from '@/lib/prismaErrors'
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

// The DELETE handler that lived here is gone. It duplicated deleteResource in
// lib/admin/repository with files deleted before rows, and nothing called it:
// the admin table deletes through /api/admin/resources.

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
    try {
      await prisma.user.update({ where: { id: targetId }, data: { isAdmin: makeAdmin } })
    } catch (error) {
      if (isRecordNotFound(error)) return NextResponse.json({ error: 'No user with that ID' }, { status: 404 })
      throw error
    }
  }

  return NextResponse.json({ success: true })
}
