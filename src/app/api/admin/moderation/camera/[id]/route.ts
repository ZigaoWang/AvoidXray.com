import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

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
      // Merge editedData with proposedData (editedData takes priority)
      // proposedData is a JSON column, but the suggest-edit handler only ever
      // writes the resource's allowlisted fields into it, so the keys here are
      // bounded. editedData is the reviewing admin's own overrides.
      const finalData: Record<string, unknown> = {
        ...(submission.proposedData as Prisma.JsonObject),
        ...(editedData || {})
      }

      // Convert year to number if it exists
      if (finalData.year !== undefined && finalData.year !== null) {
        const year = parseInt(String(finalData.year), 10)
        finalData.year = Number.isNaN(year) ? null : year
      }

      // Apply changes to camera
      // Cast once, here: finalData is assembled from JSON and cannot be
      // expressed as the generated update input without losing the merge.
      const updateData = {
        ...finalData,
        imageStatus: 'approved'
      } as Prisma.CameraUpdateInput

      if (submission.proposedImage) {
        // Delete old image
        const camera = await prisma.camera.findUnique({ where: { id: submission.resourceId } })
        if (camera?.imageUrl) {
          const oldKey = extractKeyFromUrl(camera.imageUrl)
          if (oldKey) {
            try {
              await deleteFromOSS(oldKey)
            } catch (error) {
              console.error('Failed to delete old image:', error)
            }
          }
        }

        updateData.imageUrl = submission.proposedImage
        updateData.imageUploadedBy = submission.submittedBy
        updateData.imageUploadedAt = new Date()
      }

      await prisma.camera.update({
        where: { id: submission.resourceId },
        data: updateData
      })

      // Mark submission as approved
      await prisma.moderationSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'approved',
          reviewedBy: userId,
          reviewedAt: new Date()
        }
      })

      return NextResponse.json({
        message: 'Camera edit approved and changes applied'
      })
    } else {
      // Reject: delete proposed image, keep original data
      if (submission.proposedImage) {
        const key = extractKeyFromUrl(submission.proposedImage)
        if (key) {
          try {
            await deleteFromOSS(key)
          } catch (error) {
            console.error('Failed to delete proposed image:', error)
          }
        }
      }

      // Mark submission as rejected (don't touch camera record)
      await prisma.moderationSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date()
        }
      })

      return NextResponse.json({
        message: 'Camera edit rejected. Original data preserved.'
      })
    }
  } catch (error) {
    console.error('Camera moderation error:', error)
    return NextResponse.json(
      { error: 'Failed to moderate camera edit' },
      { status: 500 }
    )
  }
}
