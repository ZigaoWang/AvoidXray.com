import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'
import { MAX_FILES_PER_REGISTER, registerFiles, type FileToRegister } from '@/lib/library/importItems'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/**
 * Registers files for upload: each comes back to be uploaded, resumed, skipped
 * as already in the library, or refused with the reason.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user
  const limited = enforceLimit('import', user.id, LIMITS.import.perUser, 'Too many requests. Wait a minute and try again.')
  if (limited) return limited

  const { id } = await params
  const owned = await prisma.import.count({ where: { id, userId: user.id } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await readJsonObject(req)
  if (!body || !Array.isArray(body.files) || body.files.length === 0 || body.files.length > MAX_FILES_PER_REGISTER) {
    return invalidBody()
  }
  const files: FileToRegister[] = []
  for (const raw of body.files) {
    const f = raw as Record<string, unknown>
    if (typeof f?.clientId !== 'string' || typeof f.filename !== 'string' || typeof f.bytes !== 'number' || typeof f.sha256 !== 'string') {
      return invalidBody()
    }
    files.push({
      clientId: f.clientId.slice(0, 100),
      filename: f.filename,
      folder: typeof f.folder === 'string' && f.folder ? f.folder : null,
      bytes: f.bytes,
      sha256: f.sha256.toLowerCase(),
      imageSha256: typeof f.imageSha256 === 'string' ? f.imageSha256.toLowerCase() : null,
      rollId: typeof f.rollId === 'string' ? f.rollId : null,
      rollPosition: Number.isInteger(f.rollPosition) ? (f.rollPosition as number) : null,
    })
  }

  return NextResponse.json({ results: await registerFiles(user, id, files) })
}
