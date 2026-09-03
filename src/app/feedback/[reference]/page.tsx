import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FeedbackThread, { type ThreadMessage } from '@/components/FeedbackThread'
import { prisma } from '@/lib/db'
import {
  FEEDBACK_THREAD_MAX,
  awaitingStaffReply,
  feedbackKindLabel,
  feedbackStatus,
  feedbackStatusBlurb,
  normalizeFeedbackReference,
  nudgeAvailableAt,
  waitDescription,
} from '@/lib/feedback'
import { formatDate } from '@/lib/formatDate'

// A capability URL: it must never be indexed, and it must never be cached
// where another reader could be served it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your message',
  robots: { index: false, follow: false },
}

const TONE: Record<string, string> = {
  neutral: 'border-neutral-700 text-neutral-300 bg-neutral-900',
  progress: 'border-[#D32F2F] text-white bg-[#D32F2F]/10',
  good: 'border-emerald-700 text-emerald-300 bg-emerald-950/40',
  muted: 'border-neutral-800 text-neutral-500 bg-neutral-900/60',
}

/**
 * One thread, readable and answerable by whoever holds its reference.
 *
 * There is no account behind a signed-out sender, so the reference is the
 * credential — fifty random bits from a CSPRNG, never listed and never
 * indexed. It grants access to one conversation and nothing else.
 */
export default async function FeedbackStatusPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const { reference } = await params

  // Normalised first, so someone who typed their own reference in lower case,
  // or without the prefix, lands on their thread rather than a 404.
  const normalized = normalizeFeedbackReference(decodeURIComponent(reference))
  if (!normalized) notFound()

  const thread = await prisma.feedback.findUnique({
    where: { reference: normalized },
    select: {
      reference: true,
      kind: true,
      message: true,
      status: true,
      createdAt: true,
      email: true,
      lastNudgeAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, author: true, createdAt: true },
      },
    },
  })
  if (!thread) notFound()

  const copy = feedbackStatus(thread.status)
  const answered = thread.messages.some((m) => m.author === 'STAFF')

  // Whether a reminder is offered, and how long the wait is if not. Computed
  // here so the button state matches what the endpoint will actually allow.
  const waiting = awaitingStaffReply(thread.messages)
  const lastActivityAt =
    thread.messages.length > 0
      ? thread.messages[thread.messages.length - 1].createdAt
      : thread.createdAt
  const availableAt = waiting ? nudgeAvailableAt(lastActivityAt, thread.lastNudgeAt) : null
  const nudge = waiting
    ? { availableIn: availableAt ? waitDescription(availableAt) : null }
    : null

  // The opening message is the first entry in the conversation rather than a
  // separate panel, so the page reads top to bottom in the order things happened.
  const entries: ThreadMessage[] = [
    {
      id: 'original',
      body: thread.message,
      author: 'SENDER',
      sentAt: formatDate(thread.createdAt),
    },
    ...thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      author: m.author,
      sentAt: formatDate(m.createdAt),
    })),
  ]

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
          {feedbackKindLabel(thread.kind)} · {thread.reference}
        </p>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-6">
          Your message
        </h1>

        <div className={`border px-4 py-3 mb-8 ${TONE[copy.tone] ?? TONE.neutral}`}>
          <p className="text-sm font-bold uppercase tracking-wider mb-1">{copy.label}</p>
          <p className="text-sm leading-relaxed opacity-90">
            {feedbackStatusBlurb(thread.status, answered)}
          </p>
        </div>

        <FeedbackThread
          reference={thread.reference}
          initialMessages={entries}
          canReply={thread.messages.length < FEEDBACK_THREAD_MAX}
          nudge={nudge}
        />

        {thread.email && (
          <p className="mt-8 pt-6 border-t border-neutral-900 text-xs text-neutral-600">
            Updates are emailed to {thread.email}.
          </p>
        )}
      </main>

      <Footer />
    </div>
  )
}
