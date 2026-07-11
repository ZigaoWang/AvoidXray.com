import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id
  const { id } = await params

  const note = await prisma.communityNote.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.userId === userId) {
    return NextResponse.json({ error: 'Cannot vote on own note' }, { status: 400 })
  }

  const existing = await prisma.noteVote.findUnique({
    where: { userId_noteId: { userId, noteId: id } },
  })

  if (existing) {
    await prisma.noteVote.delete({ where: { id: existing.id } })
  } else {
    await prisma.noteVote.create({ data: { userId, noteId: id } })
  }

  const helpfulCount = await prisma.noteVote.count({ where: { noteId: id } })

  return NextResponse.json({ votedHelpful: !existing, helpfulCount })
}
