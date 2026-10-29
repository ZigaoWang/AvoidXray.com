import { after, NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { parseIds } from '@/lib/library/requests'
import { trashPhotos } from '@/lib/library/trash'
import { syncStorageAfterVisibilityChange } from '@/lib/photoStorage'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** Moves photos to the Trash. Their files go private after the response. */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const body = await readJsonObject(req)
  const ids = parseIds(body?.ids)
  if (!ids) return invalidBody()
  const trashed = await trashPhotos(user.id, ids)
  after(() => syncStorageAfterVisibilityChange(ids))
  return NextResponse.json({ trashed })
}
