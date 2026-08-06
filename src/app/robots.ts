import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/settings/',
          '/upload/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          // Editing screens are duplicates of the public page behind auth.
          '/photos/*/edit',
          '/albums/*/edit',
          '/albums/create',
          // Search result pages are infinite and add no unique value.
          '/search',
        ],
      },
      {
        // Image crawlers get an explicit invitation. Photo pages are the whole
        // point of the site for image search, so nothing here is restricted.
        userAgent: 'Googlebot-Image',
        allow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
