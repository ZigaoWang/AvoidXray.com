import { unstable_cache } from 'next/cache'
import { prisma } from './db'
import { PUBLIC_PHOTO } from './photoVisibility'
import { photoCountsByCamera, photoCountsByFilmStock } from './counts'

/**
 * Reads every visitor would get the same answer to, shared between visits.
 *
 * The public pages are force-dynamic, because each carries something about the
 * viewer: their session, their blocks, a fresh shuffle. That made every visit
 * to the home page run six queries, two of them counts over the whole Photo
 * table, to draw numbers that change a few times an hour. Only the parts that
 * do not depend on who is looking are here. Anything filtered by a viewer's
 * blocks, likes or follows, or that could include a private photo, stays out:
 * a cached answer is served to everyone.
 *
 * `unstable_cache` because this app does not run with cacheComponents, and
 * `'use cache'` requires it. The data cache lives in .next/cache, which
 * `prebuild` clears, so a deploy never serves a value in an older shape.
 *
 * Values pass through JSON on the way into the cache: no Date, Map or BigInt
 * may be returned from a function here.
 *
 * Five minutes, so a new photo or stock reaches the counts soon enough without
 * waiting on an invalidation. The tags let a write that knows it changed one of
 * these say so sooner, with `revalidateTag(tag, 'max')`.
 */
const REVALIDATE_SECONDS = 300

/** Public photos were added, removed, or changed visibility. */
export const PHOTOS_TAG = 'public-photos'
/** Film stocks, cameras or brands were added, removed or edited. */
export const CATALOG_TAG = 'catalog'

/** The home page's headline numbers. */
export const siteCounts = unstable_cache(
  async () => {
    const [photos, films, cameras] = await Promise.all([
      prisma.photo.count({ where: { ...PUBLIC_PHOTO } }),
      // Counted, not derived from the hero's gear lists. Those are filtered to
      // gear that has an approved image, so using their length told the
      // reader there were fewer film stocks and cameras on the site than there
      // really are, and disagreed with the count on the social card.
      prisma.filmStock.count(),
      prisma.camera.count(),
    ])
    return { photos, films, cameras }
  },
  ['site-counts'],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_TAG, CATALOG_TAG] },
)

/**
 * The home page collage's pools, before the shuffle.
 *
 * The shuffle happens per visit in the page, so caching the pools does not
 * make every visitor see the same layout.
 */
export const heroPools = unstable_cache(
  async (photoPool: number, gearPool: number) => {
    const gear = {
      where: { imageStatus: 'approved', imageUrl: { not: null } },
      select: { id: true, slug: true, name: true, brand: true, imageUrl: true },
      take: gearPool,
    } as const
    const [photos, films, cameras] = await Promise.all([
      prisma.photo.findMany({
        where: { ...PUBLIC_PHOTO },
        // Geometry and the image, and nothing else. The collage is decorative
        // (the grid is aria-hidden and every tile's alt is empty), so the
        // caption and the three joins that fed the old alt text described
        // nothing. Giving the tiles words again means bringing these back.
        select: { id: true, thumbnailPath: true, width: true, height: true, blurHash: true },
        // Bounded. This had no `take` at all, so every visit to the homepage
        // loaded every public photo to shuffle them and keep the first hundred.
        orderBy: { createdAt: 'desc' },
        take: photoPool,
      }),
      prisma.filmStock.findMany(gear),
      prisma.camera.findMany(gear),
    ])
    return { photos, films, cameras }
  },
  ['hero-pools'],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_TAG, CATALOG_TAG] },
)

/** Every film stock, with the fields the index's cards and filters read. */
export const filmIndex = unstable_cache(
  async () => {
    const [stocks, brands] = await Promise.all([
      prisma.filmStock.findMany({
        // Selected, not included. `include` fetches every column, so the index
        // pulled each stock's description, summary, aliases and measured spec
        // columns in order to draw a name, an ISO and a photo count. Counts
        // come from publicPhotoCounts rather than a `_count` here, which Prisma
        // compiles into an unrestricted aggregate over the Photo table.
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          manufacturer: true,
          iso: true,
          imageUrl: true,
          imageStatus: true,
          process: true,
          colorBalance: true,
          brandId: true,
          format: true,
        },
        orderBy: { name: 'asc' },
      }),
      // Small table, whole table: this resolves brand ids into the names and
      // slugs the chips are written with.
      prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    ])
    return { stocks, brands }
  },
  ['film-index'],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
)

/** Every camera, with the fields the index's cards and filters read. */
export const cameraIndex = unstable_cache(
  async () => {
    const [cameras, brands] = await Promise.all([
      prisma.camera.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          imageUrl: true,
          imageStatus: true,
          bodyType: true,
          format: true,
          brandId: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    ])
    return { cameras, brands }
  },
  ['camera-index'],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] },
)

/**
 * Public photo counts for every stock or every body, for a viewer who has
 * blocked nobody. As entries: a Map does not survive the cache's JSON.
 *
 * A viewer with blocks gets their own count, without the blocked accounts'
 * photos, and does not come through here.
 */
const publicGearCounts = unstable_cache(
  async (kind: 'film' | 'camera') => {
    const ids = kind === 'film'
      ? (await prisma.filmStock.findMany({ select: { id: true } })).map(r => r.id)
      : (await prisma.camera.findMany({ select: { id: true } })).map(r => r.id)
    const counts = kind === 'film'
      ? await photoCountsByFilmStock(ids, { ...PUBLIC_PHOTO })
      : await photoCountsByCamera(ids, { ...PUBLIC_PHOTO })
    return [...counts]
  },
  ['public-gear-counts'],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_TAG, CATALOG_TAG] },
)

export async function publicPhotoCounts(kind: 'film' | 'camera'): Promise<Map<string, number>> {
  return new Map(await publicGearCounts(kind))
}
