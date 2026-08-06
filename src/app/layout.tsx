import type { Metadata } from "next";
import { Inter, Inter_Tight, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import JsonLd from "@/components/JsonLd";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      <body className={`${inter.variable} ${interTight.variable} ${bebasNeue.variable} ${jetbrainsMono.variable} antialiased font-sans bg-[#0a0a0a]`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
