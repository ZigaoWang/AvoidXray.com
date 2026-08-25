import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { ButtonLink } from '@/components/ui/Button'
import { GUIDELINES } from '@/lib/guidelines'
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
      <Header />

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 md:py-20">
        <p className="text-[#D32F2F] text-xs uppercase tracking-widest font-bold mb-3">
          Before you upload
        </p>
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-[1.05] mb-5">
          If it went through a camera on a roll of film, it belongs here.
        </h1>
        <p className="text-neutral-400 text-lg leading-relaxed mb-14">
          That&rsquo;s the whole rule. Everything below is just that rule, said slowly.
        </p>

        <ol className="space-y-10">
          {GUIDELINES.map((g, i) => (
            <li key={g.title} className="flex gap-5">
              <span
                className="text-2xl font-black text-neutral-800 tabular-nums leading-none pt-1 select-none"
                aria-hidden
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-white mb-2">{g.title}</h2>
                <p className="text-neutral-400 leading-relaxed">{g.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16 border-t border-neutral-800 pt-10">
          <h2 className="text-xl font-bold text-white mb-2">Not sure what you shot?</h2>
          <p className="text-neutral-400 leading-relaxed mb-6">
            Happens more than you&rsquo;d think. A thrifted camera with half a roll already in it, a lab
            envelope with nothing written on it. Say you&rsquo;re not sure instead of leaving it blank.
            Someone usually recognizes it from the frame edges, and you can always come back and fix it.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/upload">Upload photos</ButtonLink>
            <ButtonLink href="/films" variant="outline">
              Browse film stocks
            </ButtonLink>
          </div>
        </div>

        <p className="mt-14 text-sm text-neutral-600">
          Spotted a photo that doesn&rsquo;t belong, or think yours was removed unfairly?{' '}
          <Link
            href="https://github.com/ZigaoWang/avoidxray.com/issues"
            className="text-neutral-400 hover:text-white underline underline-offset-2"
          >
            Tell us
          </Link>
          .
        </p>
      </main>

      <Footer />
    </div>
  )
}
