import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFromOSS } from '@/lib/oss'

function getOSSKey(url: string): string | null {
  const match = url.match(/aliyuncs\.com\/(.+)$/)
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  const { ids } = await req.json()
  if (!ids?.length) return NextResponse.json({ success: true })

  await Promise.all(ids.map(async (id: string) => {
    const photo = await prisma.photo.findUnique({ where: { id } })
    if (!photo) return

    const keys = [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
      .map(getOSSKey)
      .filter((k): k is string => k !== null)
    await Promise.all(keys.map(key => deleteFromOSS(key).catch(() => {})))
    await prisma.photo.delete({ where: { id } })
  }))

  return NextResponse.json({ success: true })
}
