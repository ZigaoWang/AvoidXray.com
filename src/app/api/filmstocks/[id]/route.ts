import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isForeignKeyViolation } from '@/lib/prismaErrors'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const filmStock = await prisma.filmStock.findUnique({
      where: { id }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    // See the camera route: the picture's moderation state gates the picture
    // and nothing else.
    const response = {
      ...filmStock,
      imageUrl: filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null,
      imageStatus: undefined,
      imageUploadedBy: undefined,
      imageUploadedAt: undefined
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch film stock' },
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

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user?.isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can delete film stocks' },
        { status: 403 }
      )
    }

    const { id: filmStockId } = await params

    const filmStock = await prisma.filmStock.findUnique({
      where: { id: filmStockId }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    try {
      await prisma.filmStock.delete({
        where: { id: filmStockId }
      })
    } catch (error) {
      // A respool points at the stock it came from, and that relation is
      // Restrict, so the database refuses to delete a stock other stocks name
      // as their parent. Unhandled it came out as a 500, which reads as the
      // site being broken rather than a deletion that was refused.
      if (!isForeignKeyViolation(error)) throw error
      return NextResponse.json(
        { error: 'Another film stock lists this one as its parent. Update it before deleting.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ message: 'Film stock deleted successfully' })
  } catch (error) {
    console.error('Delete film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to delete film stock' },
      { status: 500 }
    )
  }
}
