import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'

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
    const { action, editedData } = await req.json()

    if (!['approve', 'reject'].includes(action)) {
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
      const finalData = {
        ...(submission.proposedData as object),
        ...(editedData || {})
      }

      // Convert ISO to number if it exists
      if (finalData.iso !== undefined && finalData.iso !== null) {
        finalData.iso = parseInt(String(finalData.iso), 10)
        // If parsing fails, set to null
        if (isNaN(finalData.iso)) {
          finalData.iso = null
        }
      }

      // Apply changes to filmstock
      const updateData: any = {
        ...finalData,
        imageStatus: 'approved'
      }

      if (submission.proposedImage) {
        // Delete old image
        const filmStock = await prisma.filmStock.findUnique({ where: { id: submission.resourceId } })
        if (filmStock?.imageUrl) {
          const oldKey = extractKeyFromUrl(filmStock.imageUrl)
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

      await prisma.filmStock.update({
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
        message: 'Film stock edit approved and changes applied'
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

      // Mark submission as rejected (don't touch filmstock record)
      await prisma.moderationSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date()
        }
      })

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
