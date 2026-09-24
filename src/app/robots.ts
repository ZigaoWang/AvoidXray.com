import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // No trailing slash. A rule is a prefix match, so '/admin/' covered
          // every page under /admin and left /admin itself crawlable — the same
          // for /settings and /upload. All three render a shell before the
          // session resolves, so a crawler indexed three near-empty pages
          // under the site's default title.
          '/api',
          '/admin',
          '/settings',
          '/upload',
          // Editing screens are duplicates of the public page behind auth.
          '/photos/*/edit',
          '/albums/*/edit',
          '/albums/create',
          // Sign-in and search pages are left crawlable on purpose: they carry
          // noindex, and a crawler that may not fetch a page never reads its
          // noindex, so a linked one could still be listed from its URL alone.
        ],
      },
      // No group for Googlebot-Image. A crawler obeys only the most specific
      // group naming it, so the `allow: '/'` one that was here lifted every
      // disallow above for image search while adding nothing: images were never
      // restricted.
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
