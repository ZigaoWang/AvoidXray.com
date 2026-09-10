import { prisma } from '@/lib/db'
import { entitySlug, uniqueSlug } from './slug'

/**
 * Allocate a slug for a newly created film stock or camera.
 *
 * Resolves collisions against the slugs of that kind that are in use *and* the
 * ones that have been retired. A retired slug is not free: it redirects to
 * whatever the entry was renamed to, and a database trigger
 * (`reject_retired_slug`, added by 20260905150000_identity_on_slug) refuses any
 * insert that tries to claim one.
 *
 * Reading only the live slugs meant that after "Canon Autoboy S" was renamed,
 * anyone adding a camera by that name got a slug the trigger then rejected, and
 * POST /api/cameras answered 500 with nothing to explain it. `retireSlug`
 * already consults this table; allocation did not.
 *
 * There's a theoretical race between the read and the insert, which the unique
 * index turns into a write error rather than a duplicate — callers should treat
 * a failure here as non-fatal, since the backfill script will fix any gap.
 */
export async function allocateSlug(
  kind: 'filmstock' | 'camera',
  name: string,
  brand?: string | null
): Promise<string> {
  // SlugHistory names film stocks 'film'; the resource is called 'filmstock'
  // everywhere else.
  const historyKind = kind === 'filmstock' ? 'film' : 'camera'

  const [rows, retired] = await Promise.all([
    kind === 'filmstock'
      ? prisma.filmStock.findMany({ select: { slug: true } })
      : prisma.camera.findMany({ select: { slug: true } }),
    prisma.slugHistory.findMany({ where: { kind: historyKind }, select: { slug: true } }),
  ])

  const taken = new Set(rows.map((r) => r.slug).filter((s): s is string => !!s))
  for (const row of retired) taken.add(row.slug)

  return uniqueSlug(entitySlug(name, brand), taken)
}
