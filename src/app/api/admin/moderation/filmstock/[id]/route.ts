import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { discardStoredImage } from '@/lib/oss'
import { readJsonObject, invalidBody, asString, asObject } from '@/lib/requestBody'
import { coerceEditableFields } from '@/lib/admin/resources'
import { reslugIfRenamed } from '@/lib/seo/rename'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

      const coerced = coerceEditableFields('films', merged)
      if ('error' in coerced) {
        return NextResponse.json({ error: coerced.error }, { status: 400 })
      }
      const finalData = coerced.data

      // Cast once, here: finalData is assembled from JSON and cannot be
      // expressed as the generated update input without losing the merge.
      const updateData = {
        ...finalData,
        imageStatus: 'approved'
      } as Prisma.FilmStockUpdateInput

      // What the approval displaces, read off the submission and not off the
      // row. A retry that lands after the row was already updated would read
      // the new image there and go on to delete the picture the page shows.
      const replaced = submission.proposedImage ? submission.originalImage : null

      if (submission.proposedImage) {
        updateData.imageUrl = submission.proposedImage
        updateData.imageUploadedBy = submission.submittedBy
        updateData.imageUploadedAt = new Date()
      }

      // Both writes or neither: a failure between them used to leave the
      // submission pending with the new image already live, and the next
      // approve would then treat that live image as the one to discard.
      await prisma.$transaction(async tx => {
        await tx.filmStock.update({
          where: { id: submission.resourceId },
          data: updateData
        })

        await tx.moderationSubmission.update({
          where: { id: submissionId },
          data: {
            status: 'approved',
            reviewedBy: userId,
            reviewedAt: new Date()
          }
        })
      })

      // A suggestion may rename the stock, and approving it moves the page.
      // Without this the record would be renamed while its URL kept the old
      // name, which is the drift the slug history exists to prevent. It stays
      // outside the transaction above: it reads the renamed row back through
      // its own client and opens a transaction of its own, so from in here it
      // would see the old name and decide nothing moved.
      await reslugIfRenamed('film', submission.resourceId, finalData)

      // Only once the row names the replacement, and never when the two are
      // the same file — a submission can propose the image already on the row,
      // and discarding it would leave the page with a dead link.
      if (replaced !== submission.proposedImage) {
        await discardStoredImage(replaced)
      }

      return NextResponse.json({
        message: 'Film stock edit approved and changes applied'
      })
    } else {
      // The original data is untouched; only the proposal goes away.
      // Mark submission as rejected (don't touch filmstock record)
      await prisma.moderationSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date()
        }
      })

      await discardStoredImage(submission.proposedImage)

      return NextResponse.json({
        message: 'Film stock edit rejected. Original data preserved.'
      })
    }
  } catch (error) {
    console.error('Film stock moderation error:', error)
    return NextResponse.json(
      { error: 'Failed to moderate film stock edit' },
      { status: 500 }
    )
  }
}
