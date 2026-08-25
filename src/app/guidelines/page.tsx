import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import JsonLd from '@/components/JsonLd'
import { ButtonLink } from '@/components/ui/Button'
import { GUIDELINES } from '@/lib/guidelines'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { SITE_URL } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'What Belongs Here',
  description:
    'AvoidXray is for photographs shot on film. What to upload, what not to, and why tagging your ' +
    'film stock and camera is the whole point.',
  alternates: { canonical: `${SITE_URL}/guidelines` },
  openGraph: {
    title: 'What Belongs Here – AvoidXray',
    description: 'AvoidXray is for photographs shot on film. Here is what that means.',
    url: `${SITE_URL}/guidelines`,
  },
}

export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'What Belongs Here', path: '/guidelines' },
        ])}
      />
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="text-sm mb-6">
          <ol className="flex items-center gap-2 text-neutral-500">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-neutral-300">What Belongs Here</li>
          </ol>
        </nav>

        <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 p-6 md:p-10 mb-8">
          <p className="text-[#D32F2F] text-xs uppercase tracking-widest font-bold mb-3">
            Before you upload
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight mb-3 max-w-2xl">
            If it went through a camera on a roll of film, it belongs here.
          </h1>
          <p className="text-neutral-400 max-w-2xl">
            That&rsquo;s the whole rule. Everything below is just that rule, said slowly.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ol className="border border-neutral-800">
              {GUIDELINES.map((g, i) => (
                <li
                  key={g.title}
                  className="flex gap-4 p-5 border-b border-neutral-800 last:border-b-0"
                >
                  <span
                    className="text-xs font-bold tabular-nums text-neutral-700 leading-6 select-none"
                    aria-hidden
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-white font-bold mb-1.5">{g.title}</h2>
                    <p className="text-neutral-400 text-sm leading-relaxed">{g.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <aside className="space-y-4">
            <div className="border border-neutral-800 p-5">
              <h2 className="text-white font-bold mb-2">Not sure what you shot?</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Happens more than you&rsquo;d think. A thrifted camera with half a roll already in
                it, a lab envelope with nothing written on it. Say you&rsquo;re not sure instead of
                leaving it blank. Someone usually recognizes it from the frame edges, and you can
                come back and fix it.
              </p>
            </div>

            <div className="border border-neutral-800 p-5">
              <h2 className="text-white font-bold mb-2">Something off?</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Spotted a photo that doesn&rsquo;t belong, or think yours was removed unfairly?{' '}
                <Link
                  href="https://github.com/ZigaoWang/avoidxray.com/issues"
                  className="text-neutral-200 hover:text-white underline underline-offset-2"
                >
                  Tell us
                </Link>
                .
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <ButtonLink href="/upload" fullWidth>
                Upload photos
              </ButtonLink>
              <ButtonLink href="/films" variant="outline" fullWidth>
                Browse film stocks
              </ButtonLink>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  )
}
