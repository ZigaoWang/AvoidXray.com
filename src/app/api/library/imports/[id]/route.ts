import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'

/**
 * Where each file of an import has got to, polled by the import page while
 * photos are being made. Thumbnails are the owner's own, through the image
 * route, since the photos are private.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params

  const found = await prisma.import.findFirst({
    where: { id, userId: user.id },
    select: {
      publishChoice: true,
      items: {
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true, state: true, error: true, publish: true, lookalikeOfId: true,
          photo: { select: { id: true, thumbnailPath: true, screening: true, visibility: true } },
        },
      },
    },
  })
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lookalikeIds = [...new Set(found.items.flatMap(i => (i.lookalikeOfId ? [i.lookalikeOfId] : [])))]
  const lookalikes = new Map((await prisma.photo.findMany({
    where: { id: { in: lookalikeIds }, userId: user.id },
    select: { id: true, thumbnailPath: true },
  })).map(p => [p.id, p.thumbnailPath]))

  return NextResponse.json({
    publishChoice: found.publishChoice,
    items: found.items.map(item => ({
      id: item.id,
      state: item.state,
      error: item.error,
      publish: item.publish,
      photoId: item.photo?.id ?? null,
      thumb: item.photo?.thumbnailPath ?? null,
      held: item.photo?.screening === 'HELD',
      published: item.photo?.visibility === 'PUBLIC',
      lookalike: item.lookalikeOfId && lookalikes.has(item.lookalikeOfId)
        ? { photoId: item.lookalikeOfId, thumb: lookalikes.get(item.lookalikeOfId)! }
        : null,
    })),
  })
}
