import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { currentUserId } from '@/lib/admin/auth'
import { prisma } from '@/lib/db'
import { hasFeature } from '@/lib/features'

export interface LibraryUser {
  id: string
  isAdmin: boolean
  storageLimitBytes: bigint | null
  /** The admin working on this account's library, when it is not their own. */
  actingAdminId?: string
}

/** The signed-in account, if it has the library. */
async function libraryUser(): Promise<LibraryUser | null> {
  const id = await currentUserId()
  if (!id) return null
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, storageLimitBytes: true },
  })
  return user && hasFeature(user, 'library') ? user : null
}

/**
 * Sent by the uploader when an admin uploads for another account
 * (`/upload?asUserId=`), naming that account.
 */
export const ACT_AS_HEADER = 'x-act-as'

/**
 * For library API routes: the account, or the response to send instead.
 *
 * Without the feature the answer is 404, as if the route did not exist,
 * rather than a 403 that would announce it.
 *
 * `actAs` is for the routes the uploader calls. On those, an admin's request
 * naming another account in ACT_AS_HEADER works on that account's library:
 * the import, its rolls and photos belong to it and count against its
 * storage, as the classic upload's photos did. The account need not have the
 * library itself. From anyone but an admin the header is refused, never
 * ignored, so a request cannot quietly land in the wrong library.
 */
export async function requireLibraryUser({ actAs = false }: { actAs?: boolean } = {}): Promise<LibraryUser | NextResponse> {
  const id = await currentUserId()
  if (!id) return NextResponse.json({ error: 'Sign in to do that' }, { status: 401 })
  const target = (await headers()).get(ACT_AS_HEADER)
  if (target && target !== id) {
    const admin = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true } })
    if (!actAs || !admin?.isAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const account = await prisma.user.findUnique({
      where: { id: target },
      select: { id: true, isAdmin: true, storageLimitBytes: true },
    })
    return account ? { ...account, actingAdminId: id } : NextResponse.json({ error: 'No such account' }, { status: 404 })
  }
  const user = await libraryUser()
  return user ?? NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/** For library pages: the account, or a 404 page. */
export async function requireLibraryPage(): Promise<LibraryUser> {
  const user = await libraryUser()
  if (!user) notFound()
  return user
}
