import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const camera = await prisma.camera.findUnique({
      where: { id },
      include: { user: true }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
    }

    // Sanitize response
    const response = {
      ...camera,
      imageUrl: camera.imageStatus === 'approved' ? camera.imageUrl : null,
      description: camera.imageStatus === 'approved' ? camera.description : null,
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

export async function PATCH(
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

    if (camera.userId !== userId && !user?.isAdmin) {
      return NextResponse.json(
        { error: 'You can only update your own cameras' },
        { status: 403 }
      )
    }

    const { name, brand, description, cameraType, format, year } = await req.json()

    const updatedCamera = await prisma.camera.update({
      where: { id: cameraId },
      data: {
        ...(name && { name }),
        ...(brand !== undefined && { brand }),
        ...(description !== undefined && { description }),
        ...(cameraType !== undefined && { cameraType }),
        ...(format !== undefined && { format }),
        ...(year !== undefined && { year: year ? parseInt(year, 10) : null })
      }
    })

    return NextResponse.json(updatedCamera)
  } catch (error) {
    console.error('Update camera error:', error)
    return NextResponse.json(
      { error: 'Failed to update camera' },
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

    if (camera.userId !== userId && !user?.isAdmin) {
      return NextResponse.json(
        { error: 'You can only delete your own cameras' },
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
