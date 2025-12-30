import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Logo from './Logo'

export default async function Header() {
  const session = await getServerSession(authOptions)

  return (
    <header className="bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
        <Logo />

        <nav className="flex items-center gap-6">
          <Link href="/films" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Films
          </Link>
          <Link href="/cameras" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
            Cameras
          </Link>
          {session ? (
            <>
              <Link href="/upload" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
                Upload
              </Link>
              <Link href="/api/auth/signout" className="text-xs text-neutral-400 hover:text-white transition-colors uppercase tracking-wide font-medium">
                Sign Out
              </Link>
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
