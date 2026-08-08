import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
