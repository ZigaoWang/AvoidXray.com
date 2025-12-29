import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function Header() {
  const session = await getServerSession(authOptions)

  return (
    <header className="bg-[#0a0a0a] border-b border-neutral-900">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
        <Link href="/" className="text-white text-lg tracking-tight" >
          Film Gallery
        </Link>
        <nav className="flex items-center gap-10">
          <Link href="/films" className="text-xs text-neutral-500 hover:text-white transition-colors uppercase tracking-wider">
            Films
          </Link>
          <Link href="/cameras" className="text-xs text-neutral-500 hover:text-white transition-colors uppercase tracking-wider">
            Cameras
          </Link>
          {session ? (
            <>
              <Link href="/upload" className="text-xs text-neutral-500 hover:text-white transition-colors uppercase tracking-wider">
                Upload
              </Link>
              <Link href="/api/auth/signout" className="text-xs text-neutral-500 hover:text-white transition-colors uppercase tracking-wider">
                Sign Out
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs text-neutral-500 hover:text-white transition-colors uppercase tracking-wider">
                Sign In
              </Link>
              <Link
                href="/register"
                className="text-xs text-white border border-neutral-700 px-4 py-2 uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
              >
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
