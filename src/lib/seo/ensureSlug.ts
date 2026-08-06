import { prisma } from '@/lib/db'
import { entitySlug, uniqueSlug } from './slug'

/**
 * Allocate a slug for a newly created film stock or camera.
 *
 * Reads the existing slugs of that kind and resolves collisions against them.
 * There's a theoretical race between the read and the insert, which the unique
 * index turns into a write error rather than a duplicate — callers should treat
 * a failure here as non-fatal, since the backfill script will fix any gap.
 */
export async function allocateSlug(
  kind: 'filmstock' | 'camera',
  name: string,
  brand?: string | null
): Promise<string> {
  const rows =
    kind === 'filmstock'
      ? await prisma.filmStock.findMany({ select: { slug: true } })
      : await prisma.camera.findMany({ select: { slug: true } })

  const taken = new Set(rows.map((r) => r.slug).filter((s): s is string => !!s))
  return uniqueSlug(entitySlug(name, brand), taken)
}
