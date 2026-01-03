import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'

function getOSSKey(url: string): string | null {
  const match = url.match(/aliyuncs\.com\/(.+)$/)
  return match ? match[1] : null
}

async function isAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  return user?.isAdmin === true
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type, id } = await req.json()

  if (type === 'user') {
    await prisma.user.delete({ where: { id } })
  } else if (type === 'photo') {
    const photo = await prisma.photo.findUnique({ where: { id } })
    if (photo) {
      const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
        .map(getOSSKey)
        .filter((k): k is string => k !== null)
      await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))
      await prisma.photo.delete({ where: { id } })
      await Promise.all([
        prisma.camera.deleteMany({ where: { photos: { none: {} } } }),
        prisma.filmStock.deleteMany({ where: { photos: { none: {} } } }),
        prisma.tag.deleteMany({ where: { photos: { none: {} } } })
      ])
    }
  } else if (type === 'comment') {
    await prisma.comment.delete({ where: { id } })
  } else if (type === 'camera') {
    await prisma.camera.delete({ where: { id } })
  } else if (type === 'filmStock') {
    await prisma.filmStock.delete({ where: { id } })
  } else if (type === 'tag') {
    await prisma.tag.delete({ where: { id } })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type, id, name, brand, userId: targetId, isAdmin: makeAdmin } = await req.json()

  if (type === 'camera') {
    await prisma.camera.update({ where: { id }, data: { name, brand } })
  } else if (type === 'filmStock') {
    await prisma.filmStock.update({ where: { id }, data: { name, brand } })
  } else if (type === 'tag') {
    await prisma.tag.update({ where: { id }, data: { name } })
  } else if (targetId) {
    await prisma.user.update({ where: { id: targetId }, data: { isAdmin: makeAdmin } })
  }

  return NextResponse.json({ success: true })
}
