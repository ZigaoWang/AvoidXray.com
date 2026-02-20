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
    const { id: filmStockId } = await params

    // Get film stock
    const filmStock = await prisma.filmStock.findUnique({
      where: { id: filmStockId }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    // Get user to check if admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    // Check if user is admin OR if they created this film stock
    // (Film stocks don't have userId, so we check who uploaded first or if admin)
    const canUpload = user?.isAdmin ||
                      !filmStock.imageUploadedBy ||
                      filmStock.imageUploadedBy === userId

    if (!canUpload) {
      return NextResponse.json(
        { error: 'You can only upload images for film stocks you created or as an admin' },
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

    let imageUrl = filmStock.imageUrl

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
      if (filmStock.imageUrl) {
        const oldKey = filmStock.imageUrl.split('.com/')[1]
        if (oldKey) {
          try {
            await deleteFromOSS(oldKey)
            console.log('[Film Stock Image] Deleted old image:', oldKey)
          } catch (error) {
            console.error('Failed to delete old image:', error)
            // Continue anyway - we'll replace it
          }
        }
      }

      // Upload to OSS with timestamp to avoid cache issues
      const timestamp = Date.now()
      const key = `filmstocks/${filmStockId}-${timestamp}.webp`
      imageUrl = await uploadToOSS(processedBuffer, key)
    }

    // If admin, auto-approve; otherwise set to pending
    const imageStatus = user?.isAdmin ? 'approved' : 'pending'

    // Update film stock
    const updatedFilmStock = await prisma.filmStock.update({
      where: { id: filmStockId },
      data: {
        imageUrl,
        description: description || filmStock.description,
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
          'filmstock',
          filmStock.name,
          filmStock.brand,
          uploaderUser.username,
          filmStockId
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
      filmStock: updatedFilmStock
    })
  } catch (error) {
    console.error('Film stock image upload error:', error)
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
    const { id: filmStockId } = await params

    // Get film stock
    const filmStock = await prisma.filmStock.findUnique({
      where: { id: filmStockId }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    // Get user to check if admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    // Check if user is admin OR if they uploaded this image
    const canDelete = user?.isAdmin || filmStock.imageUploadedBy === userId

    if (!canDelete) {
      return NextResponse.json(
        { error: 'You can only delete images you uploaded or as an admin' },
        { status: 403 }
      )
    }

    // Delete from OSS
    if (filmStock.imageUrl) {
      const key = filmStock.imageUrl.split('.com/')[1]
      if (key) {
        await deleteFromOSS(key)
      }
    }

    // Update film stock
    const updatedFilmStock = await prisma.filmStock.update({
      where: { id: filmStockId },
      data: {
        imageUrl: null,
        imageStatus: 'none',
        imageUploadedBy: null,
        imageUploadedAt: null
      }
    })

    return NextResponse.json({
      message: 'Image deleted successfully',
      filmStock: updatedFilmStock
    })
  } catch (error) {
    console.error('Film stock image delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    )
  }
}
