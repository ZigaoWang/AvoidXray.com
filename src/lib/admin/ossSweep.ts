import { prisma } from '@/lib/db'
import { listOSSObjects, deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { storedKeys } from '@/lib/photoStorage'
import { PHOTO_FILE_KEYS } from '@/lib/photoVisibilityChange'

/**
 * The orphan sweep: objects in the bucket nothing references any more, and
 * deleting them. Used by /api/admin/oss-sync and scripts/sweep-orphans.ts.
 */

/**
 * Object keys that are still referenced by a row somewhere.
 *
 * This used to read Photo alone, while the sweep below listed the entire
 * bucket — so every avatar, every camera and film stock image, and every
 * pending moderation upload was classified as an orphan and hard-deleted. The
 * preview reported them as orphans too, which made the deletion look correct
 * right up until it ran.
 *
 * Any future column that stores an OSS URL must be added here, or this will
 * delete what it points at.
 */
async function referencedKeys(): Promise<Set<string>> {
  const [photos, users, cameras, filmStocks, submissions, importItems] = await Promise.all([
    // By key: a private photo's paths name the image route, not the bucket.
    prisma.photo.findMany({ select: PHOTO_FILE_KEYS }),
    prisma.user.findMany({ select: { avatar: true } }),
    prisma.camera.findMany({ select: { imageUrl: true } }),
    prisma.filmStock.findMany({ select: { imageUrl: true } }),
    // Both sides of a submission: the proposed upload is not referenced
    // anywhere else until it is approved, and the original is what a rejection
    // falls back to.
    prisma.moderationSubmission.findMany({ select: { proposedImage: true, originalImage: true } }),
    // An imported original waits here, before its photo exists, for as long
    // as the import worker takes to reach it.
    prisma.importItem.findMany({ where: { state: { not: 'DONE' } }, select: { originalKey: true } }),
  ])

  const urls = [
    ...users.map((u) => u.avatar),
    ...cameras.map((c) => c.imageUrl),
    ...filmStocks.map((f) => f.imageUrl),
    ...submissions.flatMap((s) => [s.proposedImage, s.originalImage]),
  ]

  const keys = new Set<string>([...photos.flatMap(storedKeys), ...importItems.map(i => i.originalKey)])
  for (const url of urls) {
    if (!url) continue
    const key = extractKeyFromUrl(url)
    if (key) keys.add(key)
  }
  return keys
}

/**
 * Prefixes this endpoint is allowed to delete under.
 *
 * A second line of defense, deliberately independent of `referencedKeys`: if
 * something starts writing to the bucket and its column is not accounted for
 * above, its objects are reported as unknown rather than destroyed. Getting
 * this wrong costs bucket space; getting it wrong the other way costs every
 * user their avatar.
 */
const SWEEPABLE_PREFIXES = [
  'originals/',
  'medium/',
  'thumbs/',
  'large/',
  'avatars/',
  'cameras/',
  'filmstocks/',
  'moderation/',
]

function isSweepable(key: string): boolean {
  return SWEEPABLE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * How old an unreferenced object has to be before the sweep will delete it.
 *
 * An upload writes its three renditions to the bucket and only then creates the
 * Photo row, so between those two steps the objects are real and referenced by
 * nothing. A sweep running in that window classified them as orphans and
 * deleted them, leaving a photo whose files no longer existed. An hour is the
 * same window the unpublished-photo cleanup already uses, and it is far longer
 * than any upload takes.
 */
const MIN_ORPHAN_AGE_MS = 60 * 60 * 1000

export interface Survey {
  ossTotal: number
  dbTotal: number
  /** Unreferenced and safe to delete. */
  orphanedKeys: string[]
  /** Unreferenced but outside the sweepable prefixes; left alone. */
  unknownKeys: string[]
  /** Unreferenced, sweepable, but too recent to be sure; left for next time. */
  tooRecentKeys: string[]
}

export async function surveyBucket(): Promise<Survey> {
  const [referenced, objects] = await Promise.all([referencedKeys(), listOSSObjects()])

  const unreferenced = objects.filter((o) => !referenced.has(o.key))
  const cutoff = Date.now() - MIN_ORPHAN_AGE_MS
  // No timestamp means the listing did not report one; treat that as too
  // recent rather than guessing, because the cost of guessing wrong is a
  // deleted photograph.
  const settled = unreferenced.filter((o) => o.lastModified !== null && o.lastModified.getTime() < cutoff)
  const recent = unreferenced.filter((o) => o.lastModified === null || o.lastModified.getTime() >= cutoff)

  return {
    ossTotal: objects.length,
    dbTotal: referenced.size,
    orphanedKeys: settled.filter((o) => isSweepable(o.key)).map((o) => o.key),
    unknownKeys: unreferenced.filter((o) => !isSweepable(o.key)).map((o) => o.key),
    tooRecentKeys: recent.filter((o) => isSweepable(o.key)).map((o) => o.key),
  }
}

/** Deletes the survey's orphans; returns how many went and the keys that would not. */
export async function sweepOrphans(survey: Survey): Promise<{ deleted: number; failed: string[] }> {
  let deleted = 0
  const failed: string[] = []
  for (const key of survey.orphanedKeys) {
    try {
      await deleteFromOSS(key)
      deleted++
    } catch (e) {
      console.error(`Failed to delete OSS key ${key}:`, e)
      failed.push(key)
    }
  }
  return { deleted, failed }
}
