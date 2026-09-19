'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * The Umami tracker, with the admin area left out.
 *
 * Auto-tracking is turned off and pageviews are sent by hand. That is the only
 * way to exclude a section: Umami's tracker patches history.pushState and
 * records every client-side navigation, so simply declining to render the
 * script on /admin would not help once it had loaded anywhere else. Following a
 * header link from a photo page into the admin area would go on reporting every
 * screen of it.
 *
 * Worth excluding for two reasons. Administration is not content, so it does
 * not belong in a report about what visitors read; and the only people in there
 * are the site's own operators, whose browsing would otherwise be counted as an
 * audience. That is not a small distortion at this size, where the busiest
 * profile on the site is the owner's own.
 *
 * To exclude yourself from the public pages as well, run this in the browser
 * console once, which the tracker checks on every send:
 *
 *   localStorage.setItem('umami.disabled', '1')
 */

declare global {
  interface Window {
    umami?: { track: (payload?: unknown) => void }
  }
}

/** Sections that are never recorded. */
function excluded(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export default function Analytics({ websiteId }: { websiteId: string }) {
  const pathname = usePathname()

  // The script is not loaded yet on the first render, and the initial pageview
  // is sent from onLoad instead. Without this the effect below would fire
  // against an undefined window.umami and lose the landing page.
  const loaded = useRef(false)

  useEffect(() => {
    if (!loaded.current || !pathname || excluded(pathname)) return
    window.umami?.track()
  }, [pathname])

  return (
    <Script
      src="/s.js"
      data-website-id={websiteId}
      data-auto-track="false"
      strategy="afterInteractive"
      onLoad={() => {
        loaded.current = true
        if (!excluded(window.location.pathname)) window.umami?.track()
      }}
    />
  )
}
