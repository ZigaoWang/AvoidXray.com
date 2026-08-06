/**
 * Shared between app/sitemap.ts (the shards) and app/sitemap.xml/route.ts (the
 * index). They must agree on the shard size or the index will point at shards
 * that don't exist.
 *
 * Google's hard limit is 50,000 URLs / 50MB per sitemap; 5,000 keeps each shard
 * small enough to regenerate quickly.
 */
export const PHOTOS_PER_SHARD = 5000
