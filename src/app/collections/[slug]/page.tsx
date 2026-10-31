import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import PageShell from '@/components/PageShell'
import MasonryGrid from '@/components/MasonryGrid'
import JsonLd from '@/components/JsonLd'
import DetailSpecs from '@/components/DetailSpecs'
import { textLinkClass } from '@/components/ui/TextLink'
import { pageTitleCompactClass, sectionHeadingClass } from '@/components/ui/PageHeader'
import { FEED_FIRST_PAGE } from '@/lib/photoFeed'
import { collectionPhotoCounts, collectionPhotoPage } from '@/lib/collections'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { OG_BASE, SITE_URL } from '@/lib/seo/site'

type Params = { params: Promise<{ slug: string }> }

const loadSource = cache((slug: string) => prisma.archiveSource.findUnique({ where: { slug } }))

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const source = await loadSource(slug)
  // The 404 status comes from src/proxy.ts, as on every page with a loading.tsx.
  if (!source) notFound()
  const count = (await collectionPhotoCounts()).get(source.id) ?? 0
  const description = `${count.toLocaleString('en-US')} public domain photographs from ${source.name}. ${source.creditLine.replace(/\.$/, '')}.`
  return {
    title: source.name,
    description,
    openGraph: { ...OG_BASE, title: `${source.name} – AvoidXray`, description, url: `${SITE_URL}/collections/${source.slug}` },
    alternates: { canonical: `${SITE_URL}/collections/${source.slug}` },
  }
}

/**
 * One archive's photographs, in the order they were imported, with its credit
 * and license as the archive asks for them. Each opens the archive photo's
 * own page, which carries the full record.
 */
export default async function CollectionPage({ params }: Params) {
  const { slug } = await params
  const source = await loadSource(slug)
  if (!source) notFound()

  const [photos, counts] = await Promise.all([
    collectionPhotoPage(source.id, { take: FEED_FIRST_PAGE + 1 }),
    collectionPhotoCounts(),
  ])
  const total = counts.get(source.id) ?? 0
  const hasMore = photos.length > FEED_FIRST_PAGE
  const path = `/collections/${source.slug}`

  return (
    <PageShell header={<Header />}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Collections', path: '/collections' },
          { name: source.name, path },
        ])}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-6">
        <Link href="/collections" className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
          &larr; Collections
        </Link>

        <div className="mb-8 max-w-3xl">
          <h1 className={`${pageTitleCompactClass} leading-tight`}>{source.name}</h1>
          <DetailSpecs
            specs={[
              { label: 'Credit', value: source.creditLine },
              { label: 'License', value: source.license },
              {
                label: 'Archive',
                value: (
                  <a href={source.homepageUrl} target="_blank" rel="noopener noreferrer" className={textLinkClass}>
                    {source.homepageUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ),
              },
            ]}
          />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className={sectionHeadingClass}>Photos</h2>
          <span className="text-neutral-500 text-sm">{total.toLocaleString('en-US')} {total === 1 ? 'photo' : 'photos'}</span>
        </div>

        <MasonryGrid
          initialPhotos={hasMore ? photos.slice(0, FEED_FIRST_PAGE) : photos}
          initialOffset={hasMore ? FEED_FIRST_PAGE : null}
          tab="recent"
          scopeQuery={`&collection=${encodeURIComponent(source.slug)}`}
          likes={false}
          emptyMessage="No photos in this collection yet"
        />
      </main>
    </PageShell>
  )
}
