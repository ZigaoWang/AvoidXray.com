import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { prisma } from '@/lib/db'
import { feedbackKindLabel, feedbackStatus, normalizeFeedbackReference } from '@/lib/feedback'

// A capability URL: it must never be indexed, and it must never be cached
// where another reader could be served it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Report status',
  robots: { index: false, follow: false },
}

const TONE: Record<string, string> = {
  neutral: 'border-neutral-700 text-neutral-300 bg-neutral-900',
  progress: 'border-[#D32F2F] text-white bg-[#D32F2F]/10',
  good: 'border-emerald-700 text-emerald-300 bg-emerald-950/40',
  muted: 'border-neutral-800 text-neutral-500 bg-neutral-900/60',
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * What one reporter can see about their own report.
 *
 * There is no account behind a signed-out submission, so the reference itself
 * is the credential — fifty random bits, generated from a CSPRNG, never listed
 * anywhere and never indexed. The page shows only what that person already
 * wrote plus the answer to it, so a guessed reference discloses nothing beyond
 * a single message its author already has.
 */
export default async function ReportStatusPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const { reference } = await params

  // Normalised first, so a reporter who typed their own reference in lower
  // case, or without the prefix, lands on their report rather than a 404.
  const normalized = normalizeFeedbackReference(decodeURIComponent(reference))
  if (!normalized) notFound()

  const report = await prisma.feedback.findUnique({
    where: { reference: normalized },
    select: {
      reference: true,
      kind: true,
      message: true,
      status: true,
      reply: true,
      repliedAt: true,
      createdAt: true,
      email: true,
    },
  })
  if (!report) notFound()

  const copy = feedbackStatus(report.status)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Report</p>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight font-mono mb-6">
          {report.reference}
        </h1>

        <div className={`border px-4 py-3 mb-8 ${TONE[copy.tone] ?? TONE.neutral}`}>
          <p className="text-sm font-bold uppercase tracking-wider mb-1">{copy.label}</p>
          <p className="text-sm leading-relaxed opacity-90">{copy.blurb}</p>
        </div>

        {report.reply ? (
          <section className="mb-8">
            <h2 className="text-white text-sm font-bold uppercase tracking-wider mb-3">Reply</h2>
            <div className="border-l-2 border-[#D32F2F] bg-neutral-900/50 px-4 py-3">
              <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
                {report.reply}
              </p>
              {report.repliedAt && (
                <p className="text-neutral-500 text-xs mt-3">{formatDate(report.repliedAt)}</p>
              )}
            </div>
          </section>
        ) : (
          <section className="mb-8">
            <p className="text-neutral-500 text-sm leading-relaxed">
              No reply written yet.{' '}
              {report.email
                ? 'You’ll get an email the moment there is one — there’s no need to keep checking this page.'
                : 'You didn’t leave an email, so this page is the only place the answer will appear. Keep the link.'}
            </p>
          </section>
        )}

        <section className="mb-8">
          <h2 className="text-white text-sm font-bold uppercase tracking-wider mb-3">
            What you sent
          </h2>
          <div className="border border-neutral-800 bg-neutral-900/40 p-4">
            <p className="text-neutral-500 text-xs mb-3">
              {feedbackKindLabel(report.kind)} · {formatDate(report.createdAt)}
            </p>
            <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
              {report.message}
            </p>
          </div>
        </section>

        <p className="text-sm text-neutral-500 pt-6 border-t border-neutral-900">
          Something to add?{' '}
          <Link href="/report" className="text-neutral-300 hover:text-white underline underline-offset-2">
            Send another
          </Link>{' '}
          and mention this reference.
        </p>
      </main>

      <Footer />
    </div>
  )
}
