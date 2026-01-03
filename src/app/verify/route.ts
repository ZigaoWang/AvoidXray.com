import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid', req.url))
  }

  const user = await prisma.user.findFirst({ where: { verificationToken: token } })
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=invalid', req.url))
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null }
  })

  return NextResponse.redirect(new URL('/login?verified=true', req.url))
}
