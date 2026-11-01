import { NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { storageUsage } from '@/lib/library/storage'

/** Storage used and the account's limit, for the line on the library and in Settings. */
export async function GET() {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user
  return NextResponse.json(await storageUsage(user), { headers: { 'Cache-Control': 'private, no-store' } })
}
