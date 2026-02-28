'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import HeroMasonry from './HeroMasonry'

interface HeroSectionProps {
  items: any[]
  totalPhotos: number
  totalFilms: number
  totalCameras: number
  isLoggedIn: boolean
}

export default function HeroSection({ items, totalPhotos, totalFilms, totalCameras, isLoggedIn }: HeroSectionProps) {
  const [isReady, setIsReady] = useState(false)

  return (
    <section className="h-[calc(100vh-64px)] relative flex items-center justify-center">
      {/* Masonry Background */}
      <HeroMasonry items={items} onReady={() => setIsReady(true)} />

      {/* Overlay - starts darker, slowly reveals photos when ready */}
      <div
        className={`absolute inset-0 pointer-events-none transition-colors duration-[2500ms] ease-out ${
          isReady ? 'bg-[#0a0a0a]/65' : 'bg-[#0a0a0a]/90'
        }`}
      />

      {/* Content - always visible, no fade-in delay */}
      <div className="relative z-10 text-center px-6 -mt-16">
        <div className="flex items-center justify-center mb-4">
          <Image src="/logo.svg" alt="AvoidXray" width={320} height={64} className="w-[260px] md:w-[320px]" priority />
        </div>
        <p className="text-white/70 text-lg md:text-xl font-light mb-6">
          Protect your film. Share your work.
        </p>

        <div className="flex items-center justify-center gap-6 mb-8">
          <Link href="/explore" className="group">
            <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{totalPhotos}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Photos</div>
          </Link>
          <div className="w-px h-8 bg-neutral-700" />
          <Link href="/films" className="group">
            <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{totalFilms}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Films</div>
          </Link>
          <div className="w-px h-8 bg-neutral-700" />
          <Link href="/cameras" className="group">
            <div className="text-2xl md:text-3xl font-black text-white group-hover:text-[#D32F2F] transition-colors">{totalCameras}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">Cameras</div>
          </Link>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link href="/explore" className="bg-neutral-800 text-white px-6 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-neutral-700 transition-colors">
            Explore
          </Link>
          <Link href={isLoggedIn ? "/upload" : "/register"} className="bg-neutral-800 text-white px-6 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-neutral-700 transition-colors">
            {isLoggedIn ? "Upload" : "Join Now"}
          </Link>
        </div>
      </div>
    </section>
  )
}
