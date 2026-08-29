import Link from 'next/link'
import { prisma } from '@/lib/db'
import { FEEDBACK_STATUSES, feedbackKindLabel, isFeedbackStatus } from '@/lib/feedback'
import FeedbackItem, { type AdminFeedback } from './FeedbackItem'
import type { FeedbackStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Newest first within a status: an unanswered report is worth more attention. */
const PAGE_SIZE = 50

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  // 'ALL' is handled before the enum check rather than through it: it is a view
  // of the queue, not a status a report can hold, so isFeedbackStatus rejects
  // it and the Everything tab would have quietly rendered the open ones.
  const active: FeedbackStatus | 'ALL' =
    status === 'ALL' ? 'ALL' : isFeedbackStatus(status) ? status : 'OPEN'

  const [items, counts] = await Promise.all([
    prisma.feedback.findMany({
      where: active === 'ALL' ? {} : { status: active },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        kind: true,
        message: true,
        email: true,
        pageUrl: true,
        userAgent: true,
        status: true,
        reply: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    }),
    prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  const countFor = (value: FeedbackStatus) =>
    counts.find((c) => c.status === value)?._count._all ?? 0
  const total = counts.reduce((sum, c) => sum + c._count._all, 0)

  const rows: AdminFeedback[] = items.map((item) => ({
    id: item.id,
    reference: item.reference,
    kindLabel: feedbackKindLabel(item.kind),
    message: item.message,
    email: item.email,
    username: item.user?.username ?? null,
    pageUrl: item.pageUrl,
    userAgent: item.userAgent,
    status: item.status,
    reply: item.reply,
    createdAt: item.createdAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  }))

  const tabs: { value: FeedbackStatus | 'ALL'; label: string; count: number }[] = [
    ...FEEDBACK_STATUSES.map((s) => ({
      value: s.value as FeedbackStatus,
      label: s.label,
      count: countFor(s.value),
    })),
    { value: 'ALL' as const, label: 'Everything', count: total },
  ]

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight mb-1">Feedback</h1>
        <p className="text-neutral-500 text-sm">
          Sent through <span className="text-neutral-400">/feedback</span>. Saving a status emails
          the sender if they left an address.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 mb-6" aria-label="Filter by status">
        {tabs.map((tab) => {
          const current = active === tab.value
          return (
            <Link
              key={tab.value}
              href={tab.value === 'OPEN' ? '/admin/feedback' : `/admin/feedback?status=${tab.value}`}
              aria-current={current ? 'page' : undefined}
              className={`px-3 h-8 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide border transition-colors ${
                current
                  ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white'
              }`}
            >
              {tab.label}
              <span className="tabular-nums opacity-70">{tab.count}</span>
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm border border-neutral-900 px-4 py-8 text-center">
          {active === 'OPEN' ? 'No open feedback.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <FeedbackItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {rows.length === PAGE_SIZE && (
        <p className="mt-4 text-xs text-neutral-600">
          Showing the newest {PAGE_SIZE}. Older ones are reachable by narrowing the status.
        </p>
      )}
    </div>
  )
}
