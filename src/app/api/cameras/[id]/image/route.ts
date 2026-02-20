import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToOSS, deleteFromOSS } from '@/lib/oss'
import { sendAdminModerationNotification } from '@/lib/email'
import sharp from 'sharp'

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
    const { id: cameraId } = await params

    // Get camera and check permissions
    const camera = await prisma.camera.findUnique({
      where: { id: cameraId },
      include: { user: true }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
    }

    // Check if user is the owner or admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (camera.userId !== userId && !user?.isAdmin) {
      return NextResponse.json(
        { error: 'You can only upload images for your own cameras' },
        { status: 403 }
      )
    }

    // Parse the form data
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const description = formData.get('description') as string | null

    // Need at least one of image or description
    if (!file && !description) {
      return NextResponse.json({ error: 'Provide an image or description' }, { status: 400 })
    }

    // Validate file type if image provided
    if (file && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    let imageUrl = camera.imageUrl

    // Process and upload image only if provided
    if (file) {
      // Process image
      const buffer = Buffer.from(await file.arrayBuffer())

      // Trim transparent background and add padding (max 1200x1200, WebP format)
      const processedBuffer = await sharp(buffer)
        .trim({
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          threshold: 10
        })
        .extend({
          top: 40,
          bottom: 40,
          left: 40,
          right: 40,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 90 })
        .toBuffer()

      // Delete old image if exists (including approved ones being replaced)
      if (camera.imageUrl) {
        const oldKey = camera.imageUrl.split('.com/')[1]
        if (oldKey) {
          try {
            await deleteFromOSS(oldKey)
            console.log('[Camera Image] Deleted old image:', oldKey)
          } catch (error) {
            console.error('Failed to delete old image:', error)
            // Continue anyway - we'll replace it
          }
        }
      }

      // Upload to OSS with timestamp to avoid cache issues
      const timestamp = Date.now()
      const key = `cameras/${cameraId}-${timestamp}.webp`
      imageUrl = await uploadToOSS(processedBuffer, key)
    }

    // If admin, auto-approve; otherwise set to pending
    const imageStatus = user?.isAdmin ? 'approved' : 'pending'

    // Update camera
    const updatedCamera = await prisma.camera.update({
      where: { id: cameraId },
      data: {
        imageUrl,
        description: description || camera.description,
        imageStatus,
        imageUploadedBy: userId,
        imageUploadedAt: new Date()
      }
    })

    // Send email notification to admin only if not admin (don't block on email failure)
    if (!user?.isAdmin) {
      const uploaderUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true }
      })

      if (uploaderUser) {
        sendAdminModerationNotification(
          'camera',
          camera.name,
          camera.brand,
          uploaderUser.username,
          cameraId
        ).catch(err => {
          console.error('Failed to send admin notification email:', err)
        })
      }
    }

    const message = user?.isAdmin
      ? 'Image uploaded and approved successfully.'
      : 'Image uploaded successfully. Waiting for admin approval.'

    return NextResponse.json({
      message,
      camera: updatedCamera
    })
  } catch (error) {
    console.error('Camera image upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload image' },
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

    // Get camera and check permissions
    const camera = await prisma.camera.findUnique({
      where: { id: cameraId }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
    }

    // Check if user is the owner or admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (camera.userId !== userId && !user?.isAdmin) {
      return NextResponse.json(
        { error: 'You can only delete images for your own cameras' },
        { status: 403 }
      )
    }

    // Delete from OSS
    if (camera.imageUrl) {
      const key = camera.imageUrl.split('.com/')[1]
      if (key) {
        await deleteFromOSS(key)
      }
    }

    // Update camera
    const updatedCamera = await prisma.camera.update({
      where: { id: cameraId },
      data: {
        imageUrl: null,
        imageStatus: 'none',
        imageUploadedBy: null,
        imageUploadedAt: null
      }
    })

    return NextResponse.json({
      message: 'Image deleted successfully',
      camera: updatedCamera
    })
  } catch (error) {
    console.error('Camera image delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    )
  }
}
