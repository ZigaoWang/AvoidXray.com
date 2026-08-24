/**
 * Minimal sitemap XML builders.
 *
 * Next's built-in `sitemap.ts` convention was dropped here in favor of explicit
 * route handlers: `generateSitemaps` emits the shards but no index, and adding
 * an `app/sitemap.xml/route.ts` alongside it collides with the same convention.
 * Writing the XML directly also lets us emit the full Google image extension.
 */

export interface SitemapImage {
  loc: string
  title?: string
  caption?: string
}

export interface SitemapUrl {
  loc: string
  lastmod?: Date | string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  images?: SitemapImage[]
}

/** XML text escaping. Captions are user-supplied, so this is not optional. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function buildUrlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const parts = [`<loc>${esc(u.loc)}</loc>`]
      if (u.lastmod) parts.push(`<lastmod>${iso(u.lastmod)}</lastmod>`)
      if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`)
      if (typeof u.priority === 'number') parts.push(`<priority>${u.priority}</priority>`)

      for (const img of u.images ?? []) {
        const imgParts = [`<image:loc>${esc(img.loc)}</image:loc>`]
        // image:title and image:caption are what give Google Images text to
        // match a query against — the whole reason photo pages are in here.
        if (img.title) imgParts.push(`<image:title>${esc(img.title)}</image:title>`)
        if (img.caption) imgParts.push(`<image:caption>${esc(img.caption)}</image:caption>`)
        parts.push(`<image:image>${imgParts.join('')}</image:image>`)
      }

      return `<url>${parts.join('')}</url>`
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${body}\n</urlset>\n`
  )
}

export function buildSitemapIndex(entries: Array<{ loc: string; lastmod?: Date | string }>): string {
  const body = entries
    .map(
      (e) =>
        `<sitemap><loc>${esc(e.loc)}</loc>` +
        (e.lastmod ? `<lastmod>${iso(e.lastmod)}</lastmod>` : '') +
        `</sitemap>`
    )
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n</sitemapindex>\n`
  )
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Cached at the edge for an hour, served stale for a day while revalidating.
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
