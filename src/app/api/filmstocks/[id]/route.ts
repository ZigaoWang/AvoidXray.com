import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString, asNullableString, asInt } from '@/lib/requestBody'
import { isForeignKeyViolation } from '@/lib/prismaErrors'
import { applyAdminEdit, submitRevision } from '@/lib/revisions'

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

    // The same namespace createImageRouteHandler uses, so the two routes into
    // the review queue cannot be combined to double the allowance. Every call
    // here files a PENDING revision, and nothing throttled it.
    const limited = enforceLimit(
      'resource-edit', userId, LIMITS.contentWrite.perUser,
      'You are submitting edits very quickly. Please wait a moment.'
    )
    if (limited) return limited

    const filmStock = await prisma.filmStock.findUnique({
      where: { id: filmStockId }
    })

    if (!filmStock) {
      return NextResponse.json({ error: 'Film stock not found' }, { status: 404 })
    }

    // Every field on a film stock is a catalog field, so the whole edit goes
    // through the revision pipeline, exactly as it does for cameras. Whoever
    // happened to upload the image has no special claim on the record: the
    // gate that checked for it here refused everyone else with a 403 before
    // the code below could ever file their edit for review.
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    const body = await readJsonObject(req)

    if (!body) return invalidBody()

    const name = asString(body.name)
    const brand = asNullableString(body.brand)
    // Left out rather than nulled when unparseable: iso is not nullable.
    const iso = 'iso' in body ? asInt(body.iso) : undefined
    const description = asNullableString(body.description)
    const payload: Record<string, unknown> = {
      ...(name !== undefined && { name }),
      ...(brand !== undefined && { brand }),
      ...(description !== undefined && { description }),
      ...(iso !== undefined && { iso }),
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    // An administrator's edit applies immediately, anyone else's waits for
    // review.
    if (user?.isAdmin) {
      const result = await applyAdminEdit('FILM_STOCK', filmStockId, payload, userId)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    } else {
      await submitRevision({
        entityType: 'FILM_STOCK',
        entityId: filmStockId,
        payload,
        source: 'USER',
        submittedById: userId,
      })
      return NextResponse.json({ message: 'Sent for review' }, { status: 202 })
    }

    const updatedFilmStock = await prisma.filmStock.findUnique({ where: { id: filmStockId } })


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
