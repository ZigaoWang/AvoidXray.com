import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { readJsonObject, invalidBody, asString, asNullableString, asInt } from '@/lib/requestBody'
import { reslugIfRenamed } from '@/lib/seo/rename'

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

    // Sanitize response
    const response = {
      ...filmStock,
      imageUrl: filmStock.imageStatus === 'approved' ? filmStock.imageUrl : null,
      description: filmStock.imageStatus === 'approved' ? filmStock.description : null,
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
    const { id: filmStockId } = await params

    const filmStock = await prisma.filmStock.findUnique({
      where: { id: filmStockId }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    // Check if user is admin or the one who uploaded the image
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    const canEdit = user?.isAdmin || filmStock.imageUploadedBy === userId

    if (!canEdit) {
      return NextResponse.json(
        { error: 'You can only update film stocks you created or as an admin' },
        { status: 403 }
      )
    }

    const body = await readJsonObject(req)

    if (!body) return invalidBody()

    const name = asString(body.name)
    const brand = asNullableString(body.brand)
    // Left out rather than nulled when unparseable: iso is not nullable.
    const iso = 'iso' in body ? asInt(body.iso) : undefined
    const description = asNullableString(body.description)
    const updatedFilmStock = await prisma.filmStock.update({
      where: { id: filmStockId },
      data: {
        ...(name && { name }),
        ...(brand !== undefined && { brand }),
        ...(iso !== undefined && { iso }),
        ...(description !== undefined && { description })
      }
    })

    // A rename moves the page, so the old slug is retired as a redirect.
    //
    // This route is not the revision pipeline, which does this itself. It
    // predates it and is reachable by the record's owner rather than only by an
    // administrator, so whether owner edits to a shared catalogue entry should
    // go through review is an open question rather than something to change
    // here. The slug bug is fixed either way.
    await reslugIfRenamed('film', filmStockId, body)

    return NextResponse.json(updatedFilmStock)
  } catch (error) {
    console.error('Update film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to update film stock' },
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

    await prisma.filmStock.delete({
      where: { id: filmStockId }
    })

    return NextResponse.json({ message: 'Film stock deleted successfully' })
  } catch (error) {
    console.error('Delete film stock error:', error)
    return NextResponse.json(
      { error: 'Failed to delete film stock' },
      { status: 500 }
    )
  }
}
