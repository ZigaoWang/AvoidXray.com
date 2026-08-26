import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import HeaderBar, { type HeaderUser } from './HeaderBar'

/** Server-rendered header: the session is known before the first paint. */
export default async function Header() {
  const session = await getServerSession(authOptions)
  return <HeaderBar user={session?.user as HeaderUser | undefined} />
}
