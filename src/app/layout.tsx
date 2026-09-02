import type { Metadata } from "next";
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
  twitter: {
    card: "summary_large_image",
    title: "AvoidXray – Film Photography Community",
    description: "Browse and share film photography. Explore photos organized by film stock, camera, and photographer.",
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

          It targets a wrapper here rather than each page's own <main>, so it
          works everywhere without every page having to remember an id.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]
                     focus:bg-[#D32F2F] focus:text-white focus:px-4 focus:py-2
                     focus:text-sm focus:font-bold focus:uppercase focus:tracking-wide"
        >
          Skip to content
        </a>
        <Providers>
          <div id="main-content" tabIndex={-1} className="outline-none">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
