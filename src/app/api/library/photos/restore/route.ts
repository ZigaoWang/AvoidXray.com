import { after, NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { parseIds } from '@/lib/library/requests'
import { restorePhotos } from '@/lib/library/trash'
import { syncStorageAfterVisibilityChange } from '@/lib/photoStorage'
import { invalidBody, readJsonObject } from '@/lib/requestBody'

/** Takes photos out of the Trash, back into their rolls and albums. Published ones are public again. */
export async function POST(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  const body = await readJsonObject(req)
  const ids = parseIds(body?.ids)
  if (!ids) return invalidBody()
  const restored = await restorePhotos(user.id, ids)
  after(() => syncStorageAfterVisibilityChange(ids))
  return NextResponse.json({ restored })
}
