import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { allocateLabSlug } from '@/lib/seo/ensureSlug'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { submittedCatalogFields, type FieldReader } from '@/lib/catalogWire'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { ADMIN_RESOURCES } from '@/lib/admin/resources'
import { labFieldProblem } from '@/lib/labFields'
import { safeHttpUrl } from '@/lib/validation'

/**
 * The lab catalog: the list a picker chooses from, and adding a lab to it.
 *
 * Shaped like /api/cameras without the image. A lab has no picture, so the
 * body is JSON only and nothing is written to storage.
 */

export async function GET() {
  // The columns a picker reads. The whole table, as the camera and film lists
  // are: the picker matches names and aliases as the person types, and the
  // catalog is small enough for that to be one request.
  const labs = await prisma.lab.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      aliases: true,
      city: true,
      country: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(labs)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id

  const limited = enforceLimit(
    'catalogCreate', userId, LIMITS.catalogCreate.perUser,
    'Too many new catalog entries in a short time. Please wait a moment.'
  )
  if (limited) return limited

  try {
    const body = await readJsonObject(req)
    if (!body) return invalidBody()

    // The same reader the camera route uses for JSON, so a list arrives as the
    // comma-separated text the field coercion expects.
    const read: FieldReader = field => {
      const value = body[field]
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string').join(',')
      }
      return asString(value) ?? null
    }

    const name = read('name')?.trim() ?? ''
    const description = read('description')?.trim() || undefined

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // The description is held back from the contributor fields, as it is for
    // a camera, so its cap is read from the same declaration here.
    const limits = ADMIN_RESOURCES.labs.editable
    if (description && description.length > limits.description.maxLength) {
      return NextResponse.json(
        { error: `Description must be ${limits.description.maxLength} characters or fewer` },
        { status: 400 }
      )
    }

    const submitted = submittedCatalogFields('labs', read)
    if ('error' in submitted) {
      return NextResponse.json({ error: submitted.error }, { status: 400 })
    }

    const problem = labFieldProblem({ ...submitted.data, name, description })
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    // Nothing in the schema stops two labs sharing a name, since two shops in
    // different cities can. The same name or a known alias of an existing lab
    // is far more often the same lab added twice, so it is refused and the
    // existing one named. The add dialog's duplicate check catches the near
    // misses before this is reached.
    const existing = await prisma.lab.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { aliases: { has: name } },
        ],
      },
      select: { id: true, slug: true, name: true, city: true, country: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: `${existing.name} is already in the catalog`, existing },
        { status: 409 }
      )
    }

    const lab = await prisma.lab.create({
      data: {
        ...(submitted.data as Prisma.LabUncheckedCreateInput),
        name,
        // Normalized the way the revision pipeline will store it, so a lab
        // added and a lab edited carry the same form of the same address.
        website: safeHttpUrl(submitted.data.website),
        slug: await allocateLabSlug(name),
        addedById: userId,
        description,
      },
    })

    return NextResponse.json(lab)
  } catch (error) {
    console.error('Create lab error:', error)
    return NextResponse.json({ error: 'Could not add that lab' }, { status: 500 })
  }
}
