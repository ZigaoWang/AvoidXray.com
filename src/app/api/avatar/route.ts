import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToOSS, deleteFromOSS } from '@/lib/oss'
import { randomUUID } from 'crypto'

function getOSSKey(url: string): string | null {
  const match = url.match(/aliyuncs\.com\/(.+)$/)
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }

  // Delete old avatar from OSS
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.avatar) {
    const oldKey = getOSSKey(user.avatar)
    if (oldKey) await deleteFromOSS(oldKey).catch(() => {})
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop() || 'jpg'
  const key = `avatars/${randomUUID()}.${ext}`
  const path = await uploadToOSS(buffer, key)

  return NextResponse.json({ path })
}
