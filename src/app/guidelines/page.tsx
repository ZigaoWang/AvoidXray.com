import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import JsonLd from '@/components/JsonLd'
import { GUIDELINES, NOT_ALLOWED } from '@/lib/guidelines'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { SITE_URL } from '@/lib/seo/site'

const DESCRIPTION =
  'AvoidXray is for photographs shot on film. What to post, what not to, and why tagging your film ' +
  'stock and camera is the whole point.'

export const metadata: Metadata = {
  title: 'Guidelines',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guidelines` },
  openGraph: {
    title: 'Guidelines — AvoidXray',
    description: DESCRIPTION,
    url: `${SITE_URL}/guidelines`,
    type: 'article',
  },
  twitter: { card: 'summary', title: 'Guidelines — AvoidXray', description: DESCRIPTION },
}

/**
 * The guidelines, in the site's own voice.
 *
 * These briefly lived as Part Three of the legal document, which was the wrong
 * home twice over: it put the interesting part behind a liability clause, and
 * it left two pages stating the content rules in different words. The terms
 * now reference this page, so there is one set of rules and this is it.
 *
 * Shares its type scale and column width with /legal so moving between the two
 * doesn't feel like moving between two sites.
 */
export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Guidelines', path: '/guidelines' },
        ])}
      />
      <Header />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <nav aria-label="Breadcrumb" className="text-sm mb-8">
          <ol className="flex items-center gap-2 text-neutral-500">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-neutral-300">Guidelines</li>
          </ol>
        </nav>

        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">
          Guidelines
        </h1>
        <p className="text-lg text-neutral-300 leading-relaxed mb-14">
          AvoidXray is for photographs shot on film. If it went through a camera on a roll, it
          belongs here.
        </p>

        <h2 className="text-xl font-bold text-white mb-6">What belongs here</h2>
        <div className="space-y-8">
          {GUIDELINES.map(g => (
            <section key={g.title}>
              <h3 className="text-base font-bold text-white mb-1.5">{g.title}</h3>
              <p className="text-neutral-300 leading-relaxed">{g.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-8">
          <h3 className="text-base font-bold text-white mb-1.5">Not sure what you shot?</h3>
          <p className="text-neutral-300 leading-relaxed">
            A thrifted camera with half a roll already in it, a lab envelope with nothing written on
            it. Say you&rsquo;re not sure instead of leaving it blank. Someone usually recognises it
            from the frame edges, and you can come back and fix it later.
          </p>
        </section>

        <hr className="border-neutral-800 my-12" />

        <h2 className="text-xl font-bold text-white mb-2">What doesn&rsquo;t</h2>
        <p className="text-neutral-500 leading-relaxed mb-6">
          Short list, and none of it is a surprise.
        </p>
        <div className="space-y-8">
          {NOT_ALLOWED.map(r => (
            <section key={r.title}>
              <h3 className="text-base font-bold text-white mb-1.5">{r.title}</h3>
              <p className="text-neutral-300 leading-relaxed">{r.body}</p>
            </section>
          ))}
        </div>

        {/* Set apart from the list deliberately. Everything above is removed;
            this is the one where the consequence leaves the site, so it should
            not read as another bullet. */}
        <p className="mt-8 border-l-2 border-[#D32F2F] pl-4 text-neutral-300 leading-relaxed">
          Sexual content involving anyone under 18 is illegal. It is removed, the account is banned
          permanently, and it is reported to the authorities. There is no version of this we handle
          quietly.
        </p>

        <hr className="border-neutral-800 my-12" />

        <h2 className="text-xl font-bold text-white mb-6">A few practical things</h2>

        <section className="mb-8">
          <h3 className="text-base font-bold text-white mb-1.5">What&rsquo;s in the frame</h3>
          <p className="text-neutral-300 leading-relaxed">
            Phone photographs often record where they were taken, which can be your home. We strip
            those coordinates out of every upload before storing it. Worth a thought anyway for what
            else ends up in shot: house numbers, licence plates, school uniforms, mail on a table.
          </p>
        </section>

        <section className="mb-8">
          <h3 className="text-base font-bold text-white mb-1.5">Blocking and reporting</h3>
          <p className="text-neutral-300 leading-relaxed">
            <span className="text-white font-medium">Block</span> anyone you&rsquo;d rather not deal
            with. They can&rsquo;t follow you, comment on your photos, or like your work, and you
            stop seeing each other.
          </p>
          <p className="text-neutral-300 leading-relaxed mt-3">
            <span className="text-white font-medium">Report</span> anything that breaks these rules
            from the <span className="text-white">&hellip;</span> menu on the photo, comment, or
            profile. It reaches us with the link attached, and the person reported is never told who
            reported them. Please don&rsquo;t report someone for disagreeing with you.
          </p>
        </section>

        <section>
          <h3 className="text-base font-bold text-white mb-1.5">If something breaks the rules</h3>
          <p className="text-neutral-300 leading-relaxed mb-3">
            We try to match the response to what happened.
          </p>
          <ul className="space-y-2 text-neutral-300 leading-relaxed list-disc pl-6">
            <li>
              <span className="text-white font-medium">Honest mistakes</span> get a note and a
              chance to fix it.
            </li>
            <li>
              <span className="text-white font-medium">Content that breaks a rule</span> gets
              removed, with a reason where that&rsquo;s practical.
            </li>
            <li>
              <span className="text-white font-medium">Repeated problems</span> get a suspension.
            </li>
            <li>
              <span className="text-white font-medium">Serious violations</span> get an immediate
              permanent ban, with no warning first: anything sexual, harassment campaigns, and
              publishing someone&rsquo;s private information.
            </li>
          </ul>
        </section>

        <hr className="border-neutral-800 my-12" />

        <section className="mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Something look wrong?</h2>
          {/* Was an email address asking people to paste a link by hand. Both
              of these routes exist and carry the context with them. */}
          <p className="text-neutral-300 leading-relaxed">
            If a photo doesn&rsquo;t belong here, use{' '}
            <span className="text-white">Report photo</span> from the{' '}
            <span className="text-white">&hellip;</span> menu on it.
          </p>
          <p className="text-neutral-300 leading-relaxed mt-3">
            For anything else &mdash; a bug, or a photo of yours you think we removed unfairly
            &mdash; use{' '}
            <Link
              href="/feedback"
              className="text-[#EF5350] underline underline-offset-2 hover:text-white"
            >
              feedback
            </Link>
            . You get a reference you can check back on, and we reply there. We&rsquo;re a small
            operation and we do make mistakes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-2">The legal side</h2>
          <p className="text-neutral-300 leading-relaxed">
            These guidelines form part of the{' '}
            <Link
              href="/legal"
              className="text-[#EF5350] underline underline-offset-2 hover:text-white"
            >
              terms and privacy policy
            </Link>
            , which cover who owns what, what we do with your data, and where it&rsquo;s stored.
            Drier reading, but it&rsquo;s all there.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  )
}
