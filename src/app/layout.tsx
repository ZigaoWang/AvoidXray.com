import type { Metadata, Viewport } from "next";
import Analytics from "@/components/Analytics";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import JsonLd from "@/components/JsonLd";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";

/**
 * The three families the site draws with. Each is exposed only as a CSS
 * variable; globals.css maps those onto Tailwind's `--font-sans`,
 * `--font-display` and `--font-mono` so the utility classes resolve to them.
 *
 * `display: 'swap'` on all three: the fallback renders immediately and is
 * replaced when the file arrives, rather than holding the text invisible.
 *
 * Bebas Neue used to be loaded here as well. Nothing referenced it — not a
 * class, not a variable, not a CSS rule — so it was a font file fetched on
 * every cold visit and never drawn.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  // 900 included because globals.css sets headings in black; without the cut
  // the browser either rounds down to 800 or synthesises one.
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://avoidxray.com'),
  title: {
    default: "AvoidXray – Film Photography Community",
    template: "%s – AvoidXray",
  },
  description: "Browse and share film photography. Explore photos organized by film stock, camera, and photographer.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://avoidxray.com",
    siteName: "AvoidXray",
    title: "AvoidXray – Film Photography Community",
    description: "Browse and share film photography. Explore photos organized by film stock, camera, and photographer.",
  },
  // Card type only. A title or description here is inherited by every page
  // that declares openGraph but no twitter block, and Next only fills twitter
  // from openGraph when the resolved twitter title is empty, so sharing
  // /explore or /films on X showed the homepage's copy. Left blank, each page's
  // own openGraph title and description carry over.
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // NOTE: deliberately no `alternates.canonical` here. Next.js inherits root
  // metadata into every page that doesn't override it, so a canonical set at
  // this level made every un-overridden page (all photo pages, /albums,
  // /discover/albums) declare itself a duplicate of the homepage — which tells
  // Google not to index them. Each page now sets its own canonical.
  icons: {
    icon: [
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/favicon/favicon.ico",
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
};

/**
 * Edge to edge on a notched phone.
 *
 * Six places already position controls with `env(safe-area-inset-*)` — the
 * lightbox's close and arrow buttons, the mobile menu's foot, the manage
 * page's selection bar — and every one of them was evaluating to zero, because
 * those values are only non-zero when the document asks for the whole screen.
 * The intent was written and never switched on.
 *
 * Turning it on means the page owns the notch and the home indicator, so
 * anything pinned to an edge has to say what to do about them: the header pads
 * for the status bar below, the body pads for the sides in landscape, and the
 * toasts clear the home indicator.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <JsonLd data={[websiteJsonLd(), organizationJsonLd()]} />
      </head>
      <body className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} antialiased font-sans bg-[#0a0a0a]`}>
        {/*
          Skip link. Off-screen until focused, which is the first thing a
          keyboard or screen reader user reaches on every page. Without it they
          tab through the whole header — logo, five nav links, search, sign in —
          before reaching the content, on every single navigation.

          It targets each page's own <main>, which every page now carries the
          id on. It used to target a wrapper around {children} here, on the
          theory that one id in one place could not be forgotten — but every
          page renders its own <Header /> inside that wrapper, so the target
          sat *above* the header and moving focus to it skipped nothing at all.
          The next Tab landed on the logo, and then on the nine header controls
          the link exists to bypass.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]
                     focus:bg-brand focus:text-white focus:px-4 focus:py-2
                     focus:text-sm focus:font-bold focus:uppercase focus:tracking-wide"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        {/*
          Umami, served first-party from this origin.

          The src is /s.js on our own domain rather than cloud.umami.is, and it
          reports to /_e here. Both are nginx locations proxying a loopback-only
          Umami on the server. That matters twice over: the script rides the
          same CN2 route as the rest of the site, measured at roughly four times
          faster into the mainland than any third-party origin tested against
          it, and a first-party path is not on the blocklists that cover hosted
          analytics domains. On an audience of photographers that is the
          difference between counting most visitors and counting some of them.

          Rendered only when the id is configured, so a development server and
          any deploy without the variable set record nothing. The id is not a
          secret; it ships in the HTML of every page either way.

          The component excludes /admin; see the note there for why that cannot
          be done by declining to render this.
        */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Analytics websiteId={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID} />
        )}
      </body>
    </html>
  );
}
