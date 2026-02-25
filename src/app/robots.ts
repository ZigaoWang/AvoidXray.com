import { MetadataRoute } from 'next'

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
          '/photos/', // Don't index individual photos - not useful for search
        ],
      },
    ],
    sitemap: 'https://avoidxray.com/sitemap.xml',
  }
}
