import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import JsonLd from '@/components/JsonLd'
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

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="text-sm mb-8">
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

        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-5">
          What belongs here
        </h1>
        <p className="text-lg text-neutral-300 leading-relaxed mb-14">
          AvoidXray is for photographs shot on film. If it went through a camera on a roll, it
          belongs here.
        </p>

        <div className="space-y-9">
          {GUIDELINES.map(g => (
            <section key={g.title}>
              <h2 className="text-lg text-white font-bold mb-1.5">{g.title}</h2>
              <p className="text-neutral-400 leading-relaxed">{g.body}</p>
            </section>
          ))}
        </div>

        <hr className="border-neutral-800 my-12" />

        <section className="mb-8">
          <h2 className="text-white font-bold mb-2">Not sure what you shot?</h2>
          <p className="text-neutral-400 leading-relaxed">
            A thrifted camera with half a roll already in it, a lab envelope with nothing written on
            it. Say you&rsquo;re not sure instead of leaving it blank. Someone usually recognizes it
            from the frame edges, and you can come back and fix it later.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold mb-2">Something look wrong?</h2>
          <p className="text-neutral-400 leading-relaxed">
            If you spot a photo that doesn&rsquo;t belong here, or you think yours was removed
            unfairly, email{' '}
            <a
              href="mailto:a@zigao.wang?subject=AvoidXray"
              className="text-neutral-200 hover:text-white underline underline-offset-2"
            >
              a@zigao.wang
            </a>
            . Paste the link to the photo so we can actually go and look at it.
          </p>
        </section>

      </main>

      <Footer />
    </div>
  )
}
