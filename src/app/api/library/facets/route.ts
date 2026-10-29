import { NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { libraryFacets } from '@/lib/library/browse'

/** The film stocks, cameras, labs and years in the owner's library, for the filters. */
export async function GET() {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  return NextResponse.json(await libraryFacets(user.id))
}
