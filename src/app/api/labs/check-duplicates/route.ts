import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findPotentialDuplicates } from '@/lib/duplicateDetection'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'

/**
 * Labs already in the catalog that look like the one about to be added.
 *
 * The camera check, for labs: signed in, limited, and scoring every row
 * against the submitted name. A lab has no maker, so the brand the scorer
 * compares is always empty, and each suggestion carries its city instead so
 * two shops with one name can be told apart.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
    }
    const userId = (session.user as { id: string }).id

    const limited = enforceLimit(
      'duplicateCheck', userId, LIMITS.duplicateCheck.perUser,
      'Too many checks in a short time. Please wait a moment.'
    )
    if (limited) return limited

    const body = await readJsonObject(req)
    if (!body) return invalidBody()
    const name = asString(body.name)?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const labs = await prisma.lab.findMany({
      select: { id: true, slug: true, name: true, aliases: true, city: true, country: true },
    })

    // Scored by name and by each alias, keeping a lab's best match, so one
    // known by another name is still found.
    const candidates = labs.flatMap(lab =>
      [lab.name, ...lab.aliases].map(label => ({ ...lab, name: label, brand: null, labName: lab.name }))
    )
    const best = new Map<string, (typeof candidates)[number] & { similarity: number }>()
    for (const match of findPotentialDuplicates({ name, brand: null }, candidates, candidates.length, 0.6)) {
      if (!best.has(match.id)) best.set(match.id, match)
    }
    const duplicates = [...best.values()].slice(0, 5)

    return NextResponse.json({
      hasPotentialDuplicates: duplicates.length > 0,
      suggestions: duplicates.map(d => ({
        id: d.id,
        slug: d.slug,
        name: d.labName,
        city: d.city,
        country: d.country,
        similarity: Math.round(d.similarity * 100),
      })),
    })
  } catch (error) {
    console.error('Check lab duplicates error:', error)
    return NextResponse.json({ error: 'Could not check for duplicates' }, { status: 500 })
  }
}
