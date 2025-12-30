'use client'

import { useState } from 'react'
import Link from 'next/link'

interface MobileMenuProps {
  isLoggedIn: boolean
  username?: string
}

export default function MobileMenu({ isLoggedIn, username }: MobileMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="text-neutral-400 hover:text-white p-2"
        aria-label="Menu"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 bg-[#0a0a0a] border-t border-neutral-800 z-50">
          <nav className="flex flex-col p-4 gap-4">
            <Link href="/explore" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
              Explore
            </Link>
            <Link href="/films" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
              Films
            </Link>
            <Link href="/cameras" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
              Cameras
            </Link>
            {isLoggedIn ? (
              <>
                <Link href="/upload" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
                  Upload
                </Link>
                <Link href={`/${username}`} onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
                  Profile
                </Link>
                <Link href="/settings" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
                  Settings
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white py-2">
                  Sign In
                </Link>
                <Link href="/register" onClick={() => setOpen(false)} className="bg-[#D32F2F] text-white text-center py-3 font-bold">
                  Join
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  )
}
