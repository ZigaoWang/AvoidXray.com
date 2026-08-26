'use client'

import { useSession } from 'next-auth/react'
import HeaderBar, { type HeaderUser } from './HeaderBar'

/**
 * Header for pages that are client components throughout, so there is no
 * server render to read the session from. Identical markup either way.
 */
export default function ClientHeader() {
  const { data: session } = useSession()
  return <HeaderBar user={session?.user as HeaderUser | undefined} />
}
