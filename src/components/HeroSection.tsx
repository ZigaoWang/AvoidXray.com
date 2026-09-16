'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import HeroMasonry, { type MasonryItem } from './HeroMasonry'
import { ButtonLink } from '@/components/ui/Button'

interface HeroSectionProps {
  items: MasonryItem[]
  totalPhotos: number
  totalFilms: number
  totalCameras: number
  isLoggedIn: boolean
}

export default function HeroSection({ items, totalPhotos, totalFilms, totalCameras, isLoggedIn }: HeroSectionProps) {
  const [isReady, setIsReady] = useState(false)

  return (
    // dvh, not vh. On a phone `100vh` is the viewport with the browser chrome
    // hidden, which is not the viewport you are looking at until you scroll —
    // so the hero ran taller than the screen and the two buttons at the bottom
    // of it sat underneath the address bar on first load. dvh tracks the space
    // actually visible.
    <section className="relative flex h-[calc(100dvh-64px)] items-center justify-center">
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
        {/* An h1, not a div. The homepage had no heading of any level at all:
            nothing for a screen reader moving by heading to land on, and
            nothing telling a crawler what the front page is about. The
            wordmark is the title, so it is marked up as one; the image's alt
            text supplies the words. */}
        <h1 className="flex items-center justify-center mb-4">
          <Image src="/logo.svg" alt="AvoidXray" width={320} height={64} className="w-[260px] md:w-[320px]" priority />
        </h1>
        {/* One line under the wordmark, and that is the whole of the copy on
            this page. A second explanatory sentence was added here and taken
            straight back out: the hero is a wordmark, a tagline and two
            buttons over the photographs, not a place to pitch. */}
        <p className="text-white/70 text-lg md:text-xl font-light mb-6">
          Protect your film. Share your work.
        </p>

        {/* Three equal columns, not three boxes cut to their contents.
            It was a flex row with a gap, so each column was as wide as its own
            longest line and the space between the numbers was decided by how
            many letters happened to be in the label underneath. "Film stocks"
            is nearly twice "Photos", so the numbers sat at three different
            distances from each other — survivable on a wide screen, where
            there is room for the eye to forgive it, and plainly crooked on a
            phone. A grid gives every column the same width, which is the only
            thing that puts the numbers on an even rhythm.

            One list rather than three copies of the same markup: the classes
            were written out three times, which is how the three of them drift. */}
        <div className="mx-auto mb-8 grid w-full max-w-[20rem] grid-cols-3 sm:max-w-sm">
          {([
            { href: '/explore', value: totalPhotos, label: 'Photos' },
            { href: '/films', value: totalFilms, label: 'Film stocks' },
            { href: '/cameras', value: totalCameras, label: 'Cameras' },
          ] as const).map((stat, i) => (
            <Link
              key={stat.href}
              href={stat.href}
              /* The rule between columns is drawn on the cell rather than
                 placed between them, so it stays the short centered stroke it
                 was instead of becoming a full-height divide. */
              className={`group relative px-1 ${
                i > 0
                  ? 'before:absolute before:left-0 before:top-1/2 before:h-8 before:w-px before:-translate-y-1/2 before:bg-neutral-700 before:content-[""]'
                  : ''
              }`}
            >
              <div className="text-2xl md:text-3xl font-black text-white tabular-nums group-hover:text-brand transition-colors">
                {stat.value}
              </div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider group-hover:text-neutral-400 transition-colors">
                {stat.label}
              </div>
            </Link>
          ))}
        </div>

        {/* The shared button component, and one of the two is primary.
            Both were hand-rolled and both were bg-neutral-800, so the front
            page of the site asked for nothing in particular — the action it
            exists to prompt looked exactly like the one beside it. */}
        {/* md, not lg. At 48px these were taller than anything else on the
            page and read as heavy against the thin tagline and the stat row
            above them; 40px is the height they were before they moved onto
            the shared component. */}
        <div className="flex items-center justify-center gap-3">
          <ButtonLink href={isLoggedIn ? '/upload' : '/register'} size="md">
            {isLoggedIn ? 'Upload' : 'Join now'}
          </ButtonLink>
          <ButtonLink href="/explore" size="md" variant="secondary">
            Explore
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
