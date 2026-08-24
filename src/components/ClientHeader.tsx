'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import UserMenu from './UserMenu'
import SearchBar from './SearchBar'
import MobileMenu from './MobileMenu'
import NotificationBell from './NotificationBell'
import { ButtonLink } from '@/components/ui/Button'

export default function ClientHeader() {
  const { data: session } = useSession()
  const user = session?.user as { username?: string; name?: string; avatar?: string } | undefined

  return (
    <header className="bg-[#0a0a0a] relative">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
        <Link href="/">
          <Image src="/logo.svg" alt="AvoidXray" width={160} height={32} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <SearchBar />
          <Link href="/explore" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Explore
          </Link>
          <Link href="/discover/albums" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Albums
          </Link>
          <Link href="/films" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Films
          </Link>
          <Link href="/cameras" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Cameras
          </Link>
          {session && user?.username ? (
            <>
              <ButtonLink  href="/upload" size="sm">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                Upload
              </ButtonLink>
              <NotificationBell />
              <UserMenu username={user.username} name={user.name} avatar={user.avatar} />
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
                Sign In
              </Link>
              <ButtonLink  href="/register" size="sm">
                Join
              </ButtonLink>
            </>
          )}
        </nav>

        {/* Mobile Nav */}
        <MobileMenu isLoggedIn={!!session} username={user?.username} />
      </div>
    </header>
  )
}
