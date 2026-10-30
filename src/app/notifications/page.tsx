import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hiddenUserIds } from '@/lib/blocks'
import { loginHref } from '@/lib/loginHref'
import { decodeCursor, notificationPage } from '@/lib/notifications'
import Header from '@/components/Header'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/Button'
import NotificationItem from '@/components/NotificationItem'
import PageShell from '@/components/PageShell'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
}

/** Rows per page, after grouping. */
const PAGE_SIZE = 30

/**
 * Every notification, a page at a time. The bell holds the latest twenty, and
 * anything older had nowhere to be read.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>
}) {
  const { before: beforeParam } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect(loginHref(beforeParam ? `/notifications?before=${encodeURIComponent(beforeParam)}` : '/notifications'))
  }
  const userId = (session.user as { id: string }).id

  const before = decodeCursor(beforeParam)
  const hidden = await hiddenUserIds(userId)
  const { rows, next } = await notificationPage(userId, hidden, { before, groups: PAGE_SIZE })

  // Opening the list reads it, as opening the bell does. The rows above were
  // read first, so they still say which ones were new.
  if (rows.some(n => !n.read)) {
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
  }

  return (
    <PageShell header={<Header />}>
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-2xl mx-auto px-6 py-10 md:py-16">
        <PageHeader title="Notifications" description="Likes, comments and follows, and news about your photos." />

        {rows.length === 0 ? (
          before ? (
            <EmptyState message="No older notifications" action={{ href: '/notifications', label: 'Back to newest' }} />
          ) : (
            <EmptyState
              message="No notifications yet"
              hint="When someone likes, comments on or follows your work, it shows up here."
              action={{ href: '/upload', label: 'Upload photos' }}
            />
          )
        ) : (
          <ul className="divide-y divide-neutral-800 border border-neutral-800">
            {rows.map(n => (
              <li key={n.id}>
                <NotificationItem n={n} fresh={!n.read} />
              </li>
            ))}
          </ul>
        )}

        {(before || next) && rows.length > 0 && (
          <nav className="mt-8 flex justify-between gap-2" aria-label="Pagination">
            {before ? (
              <ButtonLink href="/notifications" variant="outline" size="sm">Newest</ButtonLink>
            ) : <span />}
            {next && (
              <ButtonLink href={`/notifications?before=${encodeURIComponent(next)}`} variant="outline" size="sm">
                Older
              </ButtonLink>
            )}
          </nav>
        )}
      </main>
    </PageShell>
  )
}
