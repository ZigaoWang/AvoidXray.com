'use client'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Logo from './Logo'
import UserMenu from './UserMenu'
import SearchBar from './SearchBar'

export default function ClientHeader() {
  const { data: session } = useSession()
  const user = session?.user as { username?: string; name?: string; avatar?: string } | undefined

  return (
    <header className="bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
        <Logo />

        <nav className="flex items-center gap-6">
          <SearchBar />
          <Link href="/explore" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Explore
          </Link>
          <Link href="/films" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Films
          </Link>
          <Link href="/cameras" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Cameras
          </Link>
          {session && user?.username ? (
            <>
              <Link href="/upload" className="bg-[#D32F2F] text-white text-xs px-5 py-2.5 uppercase tracking-wide font-bold hover:bg-[#B71C1C] transition-colors">
                Upload
              </Link>
              <UserMenu username={user.username} name={user.name} avatar={user.avatar} />
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
                Sign In
              </Link>
              <Link href="/register" className="bg-[#D32F2F] text-white text-xs px-4 py-2 uppercase tracking-wide font-bold hover:bg-[#E53935] transition-colors">
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
