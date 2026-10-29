import { NextRequest, NextResponse } from 'next/server'
import { storeLocalPart, verifyLocalPartUrl } from '@/lib/library/multipart'

/**
 * Stands in for the bucket's part uploads in development (LOCAL_UPLOADS=1).
 * The URL is signed by multipart.ts, as a bucket URL is; outside development
 * every request is a 404.
 */
export async function PUT(req: NextRequest) {
  const part = verifyLocalPartUrl(req.nextUrl.searchParams)
  if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const bytes = Buffer.from(await req.arrayBuffer())
  try {
    const etag = await storeLocalPart(part.uploadId, part.partNumber, bytes)
    return new NextResponse(null, { status: 200, headers: { ETag: etag } })
  } catch {
    return NextResponse.json({ error: 'No such upload' }, { status: 404 })
  }
}
