import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ unverified: false })

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username: email.toLowerCase() }] }
  })

  if (user && !user.emailVerified) {
    return NextResponse.json({ unverified: true })
  }

  return NextResponse.json({ unverified: false })
}
