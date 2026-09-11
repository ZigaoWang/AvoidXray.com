import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { bylineUserSelect } from '@/lib/publicUser'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const camera = await prisma.camera.findUnique({
      where: { id },
      include: { addedBy: { select: bylineUserSelect } }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
    }

    // An image still under review is nobody's business but the moderators'.
    // The description is not gated with it: that column tracks the moderation
    // state of the product photograph and nothing else, and tying the prose to
    // it meant deleting an image deleted the description from anything reading
    // this endpoint while the page carried on showing it.
    const response = {
      ...camera,
      imageUrl: camera.imageStatus === 'approved' ? camera.imageUrl : null,
      imageStatus: undefined,
      imageUploadedBy: undefined,
      imageUploadedAt: undefined
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get camera error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch camera' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id
    const { id: cameraId } = await params

    const camera = await prisma.camera.findUnique({
      where: { id: cameraId }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
    }

    // Check if user is owner or admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    // A catalog entry that other people's photos point at is not something
    // its creator can remove. Deletion is irreversible and is an administrator's
    // call.
    if (!user?.isAdmin) {
      return NextResponse.json(
        { error: 'Only an administrator can delete a catalog entry' },
        { status: 403 }
      )
    }

    await prisma.camera.delete({
      where: { id: cameraId }
    })

    return NextResponse.json({ message: 'Camera deleted successfully' })
  } catch (error) {
    console.error('Delete camera error:', error)
    return NextResponse.json(
      { error: 'Failed to delete camera' },
      { status: 500 }
    )
  }
}
