import { NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { bytesToAdd, MAX_ROOM_FILES } from '@/lib/library/importItems'
import { storageUsage } from '@/lib/library/storage'
import { readJsonObject } from '@/lib/requestBody'

const HEX64 = /^[0-9a-f]{64}$/

/**
 * Whether a drop fits: the bytes its files would add once those already in
 * the library are left out, and the account's storage. Asked by the uploader
 * only for a drop larger than the room left by its raw size; one that clearly
 * fits starts at once.
 */
export async function POST(req: Request) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const body = await readJsonObject(req)
  const raw = Array.isArray(body?.files) ? body.files : null
  if (!raw || raw.length === 0 || raw.length > MAX_ROOM_FILES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_ROOM_FILES} files` }, { status: 400 })
  }
  const files: { sha256: string; imageSha256: string | null; bytes: number }[] = []
  for (const f of raw as Record<string, unknown>[]) {
    const sha256 = typeof f?.sha256 === 'string' ? f.sha256 : ''
    const imageSha256 = typeof f?.imageSha256 === 'string' ? f.imageSha256 : null
    const bytes = typeof f?.bytes === 'number' ? f.bytes : -1
    if (!HEX64.test(sha256) || (imageSha256 !== null && !HEX64.test(imageSha256)) || !Number.isSafeInteger(bytes) || bytes < 0) {
      return NextResponse.json({ error: 'A file could not be read' }, { status: 400 })
    }
    files.push({ sha256, imageSha256, bytes })
  }
  const [toAdd, storage] = await Promise.all([bytesToAdd(user.id, files), storageUsage(user)])
  return NextResponse.json({ ...toAdd, storage })
}
