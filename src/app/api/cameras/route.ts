import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const cameras = await prisma.camera.findMany()
  return NextResponse.json(cameras)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { name, brand } = await req.json()
  const userId = (session.user as { id: string }).id
  const camera = await prisma.camera.create({ data: { name, brand, userId } })
  return NextResponse.json(camera)
}
