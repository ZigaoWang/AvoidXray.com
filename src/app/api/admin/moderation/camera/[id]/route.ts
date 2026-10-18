import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { discardStoredImage } from '@/lib/oss'
import { ownedOssKey } from '@/lib/ossUtils'
import { readJsonObject, invalidBody, asString, asObject } from '@/lib/requestBody'
import { coerceEditableFields } from '@/lib/admin/resources'
import { reslugIfRenamed } from '@/lib/seo/rename'
import { isRecordNotFound, isUniqueViolation } from '@/lib/prismaErrors'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id: submissionId } = await params
    const body = await readJsonObject(req)
    if (!body) return invalidBody()
    const { editedData } = body
    const action = asString(body.action)
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get submission
    const submission = await prisma.moderationSubmission.findUnique({
      where: { id: submissionId }
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    if (submission.status !== 'pending') {
      return NextResponse.json(
        { error: 'Submission already processed' },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      // The proposal, with the reviewing admin's overrides on top. Both are
      // then put through the resource allowlist: proposedData is written by
      // the suggest-edit handler and is bounded, but editedData comes off the
      // request and is not, and it used to reach Prisma unread.
      const merged: Record<string, unknown> = {
        ...(submission.proposedData as Prisma.JsonObject),
        ...(asObject(editedData) ?? {})
      }

      const coerced = coerceEditableFields('cameras', merged)
      if ('error' in coerced) {
        return NextResponse.json({ error: coerced.error }, { status: 400 })
      }
      const finalData = coerced.data

      // Cast once, here: finalData is assembled from JSON and cannot be
      // expressed as the generated update input without losing the merge.
      const updateData = {
        ...finalData,
        imageStatus: 'approved',
        // The suggest-edit path predates the revision pipeline and writes the
        // row directly, but a draft made against the old values still has to
        // see that the record moved.
        version: { increment: 1 },
      } as Prisma.CameraUpdateInput

      if (submission.proposedImage) {
        updateData.imageUrl = submission.proposedImage
        updateData.imageUploadedBy = submission.submittedBy
        updateData.imageUploadedAt = new Date()
      }

      // Both writes or neither: a failure between them used to leave the
      // submission pending with the new image already live, and the next
      // approve would then treat that live image as the one to discard.
      //
      // The status moves first, and only from pending. Checked outside the
      // transaction, two admins acting at once could both get through: an
      // approve pointing the row at the proposed image while a reject deleted
      // that file.
      //
      // What the approval displaces is read from the row, inside the
      // transaction and after the claim. It was read off the submission's
      // originalImage, which is the image when the edit was suggested: if
      // another approval replaced it since, the file actually displaced was
      // never deleted and the one deleted was already gone. A retry can no
      // longer read the new image here, because it fails the claim first.
      const claimed = await prisma.$transaction(async tx => {
        const { count } = await tx.moderationSubmission.updateMany({
          where: { id: submissionId, status: 'pending' },
          data: {
            status: 'approved',
            reviewedBy: userId,
            reviewedAt: new Date()
          }
        })
        if (count === 0) return null

        const current = submission.proposedImage
          ? await tx.camera.findUnique({ where: { id: submission.resourceId }, select: { imageUrl: true } })
          : null
        await tx.camera.update({
          where: { id: submission.resourceId },
          data: updateData
        })
        // Only a picture this site stored for the record. The row's URL can be
        // anything an admin typed, and its path alone would name some other
        // object in the bucket.
        const replaced = current?.imageUrl ?? null
        return { replaced: ownedOssKey(replaced, 'cameras/') ? replaced : null }
      })
      if (!claimed) {
        return NextResponse.json({ error: 'Submission already processed' }, { status: 409 })
      }

      // A suggestion may rename the camera, and approving it moves the page.
      // Without this the record would be renamed while its URL kept the old
      // name, which is the drift the slug history exists to prevent. It stays
      // outside the transaction above: it reads the renamed row back through
      // its own client and opens a transaction of its own, so from in here it
      // would see the old name and decide nothing moved.
      await reslugIfRenamed('camera', submission.resourceId, finalData)

      // Only once the row names the replacement, and never when the two are
      // the same file — a submission can propose the image already on the row,
      // and discarding it would leave the page with a dead link.
      if (claimed.replaced !== submission.proposedImage) {
        await discardStoredImage(claimed.replaced)
      }

      return NextResponse.json({
        message: 'Camera edit approved and changes applied'
      })
    } else {
      // The original data is untouched; only the proposal goes away.
      const { count } = await prisma.moderationSubmission.updateMany({
        where: { id: submissionId, status: 'pending' },
        data: {
          status: 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date()
        }
      })
      if (count === 0) {
        return NextResponse.json({ error: 'Submission already processed' }, { status: 409 })
      }

      await discardStoredImage(submission.proposedImage)

      return NextResponse.json({
        message: 'Camera edit rejected. Original data preserved.'
      })
    }
  } catch (error) {
    if (isRecordNotFound(error)) {
      return NextResponse.json({ error: 'That camera no longer exists' }, { status: 404 })
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'Another camera already has that value' }, { status: 409 })
    }
    console.error('Camera moderation error:', error)
    return NextResponse.json(
      { error: 'Could not save that decision' },
      { status: 500 }
    )
  }
}
