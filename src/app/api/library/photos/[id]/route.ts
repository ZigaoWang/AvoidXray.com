import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { applyPhotoDetails, type PhotoDetailsInput } from '@/lib/library/photoDetails'
import { formatRollDate } from '@/lib/library/rollFields'
import { publicObjectUrl, signedObjectUrl } from '@/lib/oss'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * One photo for the library viewer: its full-quality display version, its
 * details, its roll, and the frames before and after it in that roll (or, for
 * a loose photo, among the loose photos by upload).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params

  const photo = await prisma.photo.findFirst({
    where: { id, userId: user.id, kind: 'COMMUNITY', deletedAt: null },
    select: {
      id: true, width: true, height: true, caption: true, takenDate: true, visibility: true, screening: true,
      imagesPublic: true, largeKey: true, mediumKey: true, originalPath: true, originalFilename: true, scannerModel: true,
      rollId: true, rollPosition: true, createdAt: true, filmStockId: true, cameraId: true, labId: true,
      filmStock: { select: { name: true } }, camera: { select: { name: true } }, lab: { select: { name: true } },
      roll: { select: { id: true, title: true, shotFrom: true, shotFromPrecision: true, shotTo: true, shotToPrecision: true } },
    },
  })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const key = photo.largeKey ?? photo.mediumKey
  const src = photo.imagesPublic ? publicObjectUrl(key) : await signedObjectUrl(key)

  // Neighbours: the roll's frames in order, or loose photos by upload.
  const siblings = photo.rollId
    ? await prisma.photo.findMany({
      where: { rollId: photo.rollId, deletedAt: null, uploadComplete: true },
      select: { id: true },
      orderBy: [{ rollPosition: 'asc' }, { createdAt: 'asc' }],
    })
    : await prisma.photo.findMany({
      where: { userId: user.id, kind: 'COMMUNITY', rollId: null, deletedAt: null, uploadComplete: true },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  const index = siblings.findIndex(s => s.id === photo.id)

  return NextResponse.json({
    id: photo.id,
    src,
    width: photo.width,
    height: photo.height,
    caption: photo.caption,
    takenDate: photo.takenDate?.toISOString().slice(0, 10) ?? null,
    published: photo.visibility === 'PUBLIC',
    held: photo.screening === 'HELD',
    originalPath: photo.originalPath,
    originalFilename: photo.originalFilename,
    scannerModel: photo.scannerModel,
    filmStockId: photo.filmStockId, cameraId: photo.cameraId, labId: photo.labId,
    filmStock: photo.filmStock?.name ?? null, camera: photo.camera?.name ?? null, lab: photo.lab?.name ?? null,
    roll: photo.roll ? {
      id: photo.roll.id,
      title: photo.roll.title,
      shotFrom: formatRollDate(photo.roll.shotFrom, photo.roll.shotFromPrecision),
      shotTo: formatRollDate(photo.roll.shotTo, photo.roll.shotToPrecision),
    } : null,
    frame: index + 1,
    frames: siblings.length,
    prevId: index > 0 ? siblings[index - 1].id : null,
    nextId: index >= 0 && index < siblings.length - 1 ? siblings[index + 1].id : null,
  })
}

/**
 * Edits one photo's details from the viewer. Film, camera and lab only on a
 * loose photo; in a roll they are the roll's (`keptByRoll` says so).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return invalidBody()
  const exists = await prisma.photo.count({ where: { id, userId: user.id, kind: 'COMMUNITY' } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const result = await applyPhotoDetails(user.id, [id], body as PhotoDetailsInput)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
