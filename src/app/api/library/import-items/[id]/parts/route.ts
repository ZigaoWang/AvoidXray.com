import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { uploadingItem } from '@/lib/library/importItems'
import { listParts, partCount, signParts } from '@/lib/library/multipart'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** Part URLs signed per call; the page asks again as it goes. */
const MAX_PARTS_PER_CALL = 20

/** Signs URLs for the parts the page is about to send. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const { id } = await params
  const item = await uploadingItem(user.id, id)
  if (!item) return NextResponse.json({ error: 'This file is no longer uploading' }, { status: 404 })

  const body = await readJsonObject(req)
  const count = partCount(item.bytes, item.partSize)
  const parts = Array.isArray(body?.parts) ? (body.parts as unknown[]) : null
  if (!parts || parts.length === 0 || parts.length > MAX_PARTS_PER_CALL
    || !parts.every(n => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= count)) {
    return invalidBody()
  }
  return NextResponse.json({ urls: await signParts(item.originalKey, item.multipartUploadId!, parts as number[]) })
}

/** The parts the bucket already holds, for resuming. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const { id } = await params
  const item = await uploadingItem(user.id, id)
  if (!item) return NextResponse.json({ error: 'This file is no longer uploading' }, { status: 404 })
  const parts = await listParts(item.originalKey, item.multipartUploadId!)
  return NextResponse.json({ uploadedParts: parts.map(p => p.partNumber) })
}
