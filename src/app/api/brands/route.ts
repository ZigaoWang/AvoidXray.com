import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveBrand } from '@/lib/brands'
import { readJsonObject, invalidBody, asString } from '@/lib/requestBody'
import { isUniqueViolation } from '@/lib/prismaErrors'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'

/** The cap ADMIN_RESOURCES declares for a brand's name. */
const BRAND_NAME_MAX = 60

/**
 * The brands a film's maker can be chosen from.
 *
 * Exists so `manufacturedByBrandId` can be a picker rather than a typed id. The
 * column was unreachable from every form, which is why a stock's real maker
 * could not be corrected without opening the database.
 */
export async function GET() {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(brands)
}

/**
 * Naming a maker the table does not hold yet.
 *
 * The picker could only offer what already existed, so correcting a stock whose
 * coater had never been recorded was impossible — the one name you needed was
 * the one name not on the list. The camera form never had this problem: it
 * takes a typed brand and resolves it.
 *
 * So this is that same resolution, reachable from the picker. `resolveBrand`
 * matches an existing brand generously — by name, slug or alias, case
 * insensitively — before it creates anything, which is what keeps "Yestar" and
 * "Yes!Star" from becoming two companies with half a catalog each.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id

  // Shares the bucket with the other catalog writes: a brand is a public row
  // carrying text, and this is the cheapest one to create.
  const limited = enforceLimit(
    'catalog-write', userId, LIMITS.contentWrite.perUser,
    'You are adding brands very quickly. Please wait a moment.'
  )
  if (limited) return limited

  const body = await readJsonObject(req)
  if (!body) return invalidBody()

  const name = asString(body.name)?.trim()
  if (!name) {
    return NextResponse.json({ error: 'A name is required' }, { status: 400 })
  }
  if (name.length > BRAND_NAME_MAX) {
    return NextResponse.json(
      { error: `A brand name must be ${BRAND_NAME_MAX} characters or fewer` },
      { status: 400 }
    )
  }

  // `resolveBrand` looks before it creates, so two people naming the same new
  // brand at once both see it missing and both insert it. Brand.slug and
  // Brand.name are unique, so the loser used to answer 500 for a name that had
  // just been created successfully — by the other request, from the same text.
  // That row is exactly what this request was asking for, so resolve again and
  // the second pass finds it.
  let brand: { id: string } | null
  try {
    brand = await resolveBrand(name)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    brand = await resolveBrand(name)
  }
  if (!brand) {
    return NextResponse.json({ error: 'That name could not be used' }, { status: 400 })
  }

  // The resolved row, not the submitted text: the caller selects by id, and the
  // name it gets back is the one the catalog already knew this company by.
  const saved = await prisma.brand.findUnique({
    where: { id: brand.id },
    select: { id: true, name: true },
  })
  if (!saved) {
    // Only a delete landing between the two queries explains this. Sending the
    // null body on was worse than saying so: the picker read `brand.id` off it,
    // stored undefined as the chosen maker, and reported that it had worked.
    return NextResponse.json({ error: 'That brand is no longer in the catalog' }, { status: 409 })
  }
  return NextResponse.json(saved)
}
