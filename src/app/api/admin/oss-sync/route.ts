import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listOSSObjects, deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'

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
  const [photos, users, cameras, filmStocks, submissions] = await Promise.all([
    prisma.photo.findMany({ select: { originalPath: true, mediumPath: true, thumbnailPath: true } }),
    prisma.user.findMany({ select: { avatar: true } }),
    prisma.camera.findMany({ select: { imageUrl: true } }),
    prisma.filmStock.findMany({ select: { imageUrl: true } }),
    // Both sides of a submission: the proposed upload is not referenced
    // anywhere else until it is approved, and the original is what a rejection
    // falls back to.
    prisma.moderationSubmission.findMany({ select: { proposedImage: true, originalImage: true } }),
  ])

  const urls = [
    ...photos.flatMap((p) => [p.originalPath, p.mediumPath, p.thumbnailPath]),
    ...users.map((u) => u.avatar),
    ...cameras.map((c) => c.imageUrl),
    ...filmStocks.map((f) => f.imageUrl),
    ...submissions.flatMap((s) => [s.proposedImage, s.originalImage]),
  ]

  const keys = new Set<string>()
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
 * A second line of defence, deliberately independent of `referencedKeys`: if
 * something starts writing to the bucket and its column is not accounted for
 * above, its objects are reported as unknown rather than destroyed. Getting
 * this wrong costs bucket space; getting it wrong the other way costs every
 * user their avatar.
 */
const SWEEPABLE_PREFIXES = [
  'originals/',
  'medium/',
  'thumbs/',
  'avatars/',
  'cameras/',
  'filmstocks/',
  'moderation/',
]

function isSweepable(key: string): boolean {
  return SWEEPABLE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

interface Survey {
  ossTotal: number
  dbTotal: number
  /** Unreferenced and safe to delete. */
  orphanedKeys: string[]
  /** Unreferenced but outside the sweepable prefixes; left alone. */
  unknownKeys: string[]
}

async function surveyBucket(): Promise<Survey> {
  const [referenced, ossKeys] = await Promise.all([referencedKeys(), listOSSObjects()])

  const unreferenced = ossKeys.filter((key) => !referenced.has(key))

  return {
    ossTotal: ossKeys.length,
    dbTotal: referenced.size,
    orphanedKeys: unreferenced.filter(isSweepable),
    unknownKeys: unreferenced.filter((key) => !isSweepable(key)),
  }
}

/** Admin-only; returns the user when authorized, otherwise a response to send. */
async function requireAdmin(): Promise<{ error: NextResponse } | { error: null }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  return { error: null }
}

// DELETE: Remove orphaned files from OSS that don't exist in database
export async function DELETE() {
  const { error } = await requireAdmin()
  if (error) return error

  const survey = await surveyBucket()

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

  return NextResponse.json({
    success: true,
    ossTotal: survey.ossTotal,
    dbTotal: survey.dbTotal,
    orphaned: survey.orphanedKeys.length,
    skipped: survey.unknownKeys.length,
    deleted,
    failed: failed.length,
  })
}

// GET: Check for orphaned files without deleting
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const survey = await surveyBucket()

  return NextResponse.json({
    ossTotal: survey.ossTotal,
    dbTotal: survey.dbTotal,
    orphaned: survey.orphanedKeys.length,
    skipped: survey.unknownKeys.length,
    // A preview of exactly what DELETE would remove, so the decision is made
    // against the real list rather than a count.
    orphanedKeys: survey.orphanedKeys.slice(0, 20),
    unknownKeys: survey.unknownKeys.slice(0, 20),
  })
}
