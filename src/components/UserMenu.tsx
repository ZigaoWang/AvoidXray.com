'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'

type UserMenuProps = {
  username: string
  name?: string | null
  avatar?: string | null
}

export default function UserMenu({ username, name, avatar }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-white text-sm font-bold transition-colors overflow-hidden"
      >
        {avatar ? (
          <Image src={avatar} alt="" width={32} height={32} className="w-full h-full object-cover" />
        ) : (
          (name || username).charAt(0).toUpperCase()
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 shadow-xl z-50">
          <div className="px-4 py-3 border-b border-neutral-800">
            <p className="text-white text-sm font-medium truncate">{name || username}</p>
            <p className="text-neutral-500 text-xs truncate">@{username}</p>
          </div>
          <div className="py-1">
            <Link
              href={`/${username}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              Profile
            </Link>
            <Link
              href="/albums"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              My Albums
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              Settings
            </Link>
          </div>
          <div className="border-t border-neutral-800 py-1">
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="block w-full text-left px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-[#D32F2F] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
