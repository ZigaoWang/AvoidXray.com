import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import Header from '@/components/Header'
import PageShell from '@/components/PageShell'
import PageHeader from '@/components/ui/PageHeader'
import JsonLd from '@/components/JsonLd'
import AlbumCard from '@/components/AlbumCard'
import EmptyState from '@/components/ui/EmptyState'
import { collectionPhotoCounts, collectionPhotoPage } from '@/lib/collections'
import { photoCount } from '@/lib/publicRoll'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { OG_DEFAULT_IMAGE } from '@/lib/seo/site'

const DESCRIPTION = 'Public domain film photographs from archives, browsed by collection.'

export const metadata: Metadata = {
  title: 'Collections',
  description: DESCRIPTION,
  openGraph: {
    title: 'Collections – AvoidXray',
    description: DESCRIPTION,
    url: 'https://avoidxray.com/collections',
    images: [OG_DEFAULT_IMAGE],
  },
  alternates: { canonical: 'https://avoidxray.com/collections' },
}

export const dynamic = 'force-dynamic'

/** Every archive the site holds photographs from, one card each. */
export default async function CollectionsPage() {
  const [sources, counts] = await Promise.all([
    prisma.archiveSource.findMany({ select: { id: true, slug: true, name: true, creditLine: true }, orderBy: { name: 'asc' } }),
    collectionPhotoCounts(),
  ])
  const shown = sources.filter(s => (counts.get(s.id) ?? 0) > 0)
  const previews = await Promise.all(shown.map(s => collectionPhotoPage(s.id, { take: 4 })))

  return (
    <PageShell header={<Header />}>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Collections', path: '/collections' }])} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl mx-auto w-full py-10 md:py-16 px-6">
        <PageHeader title="Collections" description="Public domain photographs from archives, shown with the archive's own records." />

        {shown.length === 0 ? (
          <EmptyState message="No collections yet" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((source, cardIndex) => (
              <AlbumCard
                key={source.id}
                album={{ id: source.id, name: source.name, description: source.creditLine }}
                href={`/collections/${source.slug}`}
                tileAlt={`Photograph from ${source.name}`}
                previews={previews[cardIndex]}
                photoCount={counts.get(source.id) ?? 0}
                countLabel={photoCount(counts.get(source.id) ?? 0)}
                cardIndex={cardIndex}
                as="h2"
              />
            ))}
          </div>
        )}
      </main>
    </PageShell>
  )
}
