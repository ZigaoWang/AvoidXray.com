import { prisma } from '@/lib/db'
import { entitySlug, uniqueSlug } from './slug'

/**
 * Renaming a film stock or camera, keeping its old URLs working.
 *
 * The slug is derived from the name, so a rename moves the page. Three things
 * have to happen together for that not to break the site:
 *
 *   1. The new slug has to be unique, because the column is.
 *   2. The slug it replaces has to be recorded, or every link to the old URL
 *      404s — the resolver matches slugs exactly and nothing else would know
 *      where the page went.
 *   3. If the record is renamed *back*, the slug it is returning to has to stop
 *      being a redirect, or the page would bounce to itself forever.
 *
 * All three run in one transaction: a slug written without its history entry is
 * a broken link, and a history entry without the slug is a redirect loop.
 */

export type SlugKind = 'film' | 'camera'

/**
 * Move a record's URL if an update renamed it.
 *
 * Called after the write, with whatever the update actually applied. Every path
 * that can rename a film or camera goes through this — the admin table, an
 * admin's direct edit, and a moderator approving someone's suggestion — so a
 * rename cannot land by a route that forgets to move the page with it.
 *
 * A record whose name did not change costs one indexed read and no writes.
 */
export async function reslugIfRenamed(
  kind: SlugKind,
  id: string,
  applied: Record<string, unknown>
): Promise<void> {
  if (!('name' in applied) && !('brand' in applied)) return

  const existing = kind === 'film'
    ? await prisma.filmStock.findUnique({ where: { id }, select: { slug: true, name: true, brand: true } })
    : await prisma.camera.findUnique({ where: { id }, select: { slug: true, name: true, brand: true } })
  // Deleted between the write and here. Nothing to move.
  if (!existing) return

  // Read back from the record rather than from the payload: the update has
  // already been applied, so the row is the truth about what it is now called.
  await retireSlug(kind, id, existing.slug, existing.name, existing.brand)
}

/**
 * The slug a record should have under a new name, or null if it does not move.
 *
 * Exported so a caller can tell the difference between a rename that changes
 * the URL and one that does not — the admin table says so before saving.
 */
export function nextSlug(
  current: string | null,
  name: string,
  brand: string | null
): string | null {
  const desired = entitySlug(name, brand)
  if (!desired || desired === current) return null
  return desired
}

/**
 * Move a record to the slug its new name implies.
 *
 * Returns the slug actually written, which may carry a `-2` discriminator if
 * the plain one was taken. Returns null when the name does not change the URL,
 * in which case nothing is written and the caller updates the row as usual.
 */
export async function retireSlug(
  kind: SlugKind,
  id: string,
  current: string | null,
  name: string,
  brand: string | null
): Promise<string | null> {
  const desired = nextSlug(current, name, brand)
  if (!desired) return null

  // Every slug the namespace has spoken for: the ones in use and the ones held
  // by history. A retired slug cannot be handed to a different record, or the
  // redirect would send readers of the first page to the second.
  const [live, retired] = await Promise.all([
    kind === 'film'
      ? prisma.filmStock.findMany({ where: { slug: { not: null } }, select: { slug: true } })
      : prisma.camera.findMany({ where: { slug: { not: null } }, select: { slug: true } }),
    prisma.slugHistory.findMany({ where: { kind }, select: { slug: true, targetId: true } }),
  ])

  const taken = new Set<string>()
  for (const row of live) if (row.slug) taken.add(row.slug)
  // A slug this same record retired earlier is not taken against itself: going
  // back to a former name should reclaim the URL rather than invent "-2".
  for (const row of retired) if (row.targetId !== id) taken.add(row.slug)
  // Its own current slug is about to be freed.
  if (current) taken.delete(current)

  const slug = uniqueSlug(desired, taken)

  await prisma.$transaction(async tx => {
    // Reclaiming a slug this record used to have: drop the redirect first, or
    // the page would point at itself.
    await tx.slugHistory.deleteMany({ where: { kind, slug } })

    if (current) {
      await tx.slugHistory.upsert({
        where: { kind_slug: { kind, slug: current } },
        create: { kind, slug: current, targetId: id },
        // A slug retired by this same record before — keep it pointing here.
        update: { targetId: id },
      })
    }

    if (kind === 'film') await tx.filmStock.update({ where: { id }, data: { slug } })
    else await tx.camera.update({ where: { id }, data: { slug } })
  })

  return slug
}
