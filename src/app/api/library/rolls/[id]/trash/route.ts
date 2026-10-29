import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { trashPhotos } from '@/lib/library/trash'
import { syncStorageAfterVisibilityChange } from '@/lib/photoStorage'

/**
 * Deletes a roll: its photos go to the Trash and the roll stays, out of sight,
 * so restoring them puts them back in it. Purging its last photo removes it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params
  const roll = await prisma.roll.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
  if (!roll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const photos = await prisma.photo.findMany({ where: { rollId: id, deletedAt: null }, select: { id: true } })
  const ids = photos.map(p => p.id)
  const trashed = ids.length ? await trashPhotos(user.id, ids) : 0
  if (ids.length) after(() => syncStorageAfterVisibilityChange(ids))
  return NextResponse.json({ trashed, photoIds: ids })
}
