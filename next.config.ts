import type { NextConfig } from "next";

/**
 * Content-Security-Policy, limited to the directives that are meaningful
 * without a per-request nonce.
 *
 * `script-src` and `style-src` are deliberately absent. Next inlines both its
 * bootstrap script and Tailwind's critical CSS, so constraining them means
 * either 'unsafe-inline' — which buys nothing — or threading a nonce through
 * the proxy and every rendered document. That is worth doing, but it is a
 * change with its own failure modes and does not belong bundled in with the
 * headers below.
 *
 * What is here still closes real gaps: the page cannot be framed, a form
 * cannot be redirected off-site, an injected <base> cannot repoint every
 * relative URL, and plugin content cannot be embedded at all.
 */
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  // Belt and braces with frame-ancestors, which older browsers ignore.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops a browser second-guessing a Content-Type we set deliberately —
  // notably on the object storage URLs and the watermark's image/jpeg.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Full URL to our own pages, bare origin to anyone else. Photo and profile
  // paths are not something to hand to every outbound link.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here uses these, and saying so stops an embedded third party from
  // asking on our behalf.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Production only. A browser applies HSTS to localhost too, so sending this
  // in development would pin http://localhost:3000 to https and break it —
  // and the header means nothing over plain HTTP anyway.
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  // Nothing needs to know which framework serves this, and naming it only
  // helps someone matching the site against framework-specific advisories.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avoidxray.oss-cn-hongkong.aliyuncs.com',
      },
    ],
    // Source images are content-addressed and never rewritten in place, so an
    // optimized variant stays valid indefinitely. The default TTL had the
    // optimizer re-encoding the same images every few hours (x-nextjs-cache:
    // STALE) and forced browsers to revalidate far more often than necessary.
    minimumCacheTTL: 31536000,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
};

export default nextConfig;
