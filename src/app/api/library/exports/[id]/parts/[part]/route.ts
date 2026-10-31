import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { partFileName, type StoredPart } from '@/lib/library/exports'
import { signedObjectUrl } from '@/lib/oss'

/**
 * Downloads one part of a ready export: the owner only, until it expires.
 * Answered with a redirect to a short-lived signed address, so the zip comes
 * straight from the bucket and the link on the page is what lasts the week.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; part: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id, part } = await params
  const found = await prisma.libraryExport.findFirst({
    where: { id, userId: user.id, state: 'READY', expiresAt: { gt: new Date() } },
    select: { title: true, createdAt: true, parts: true },
  })
  const parts = (found?.parts as unknown as StoredPart[] | null) ?? []
  const n = Number(part)
  if (!found || !Number.isInteger(n) || n < 1 || n > parts.length) {
    return NextResponse.json({ error: 'This download has expired or does not exist' }, { status: 404 })
  }
  const url = await signedObjectUrl(parts[n - 1].key, { download: partFileName(found.title, found.createdAt, n, parts.length) })
  // Resolved against the request: the local stand-in for the bucket signs a path, not an address.
  return NextResponse.redirect(new URL(url, req.url), { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
}
