import { prisma } from '@/lib/db'
import { slugify, uniqueSlug } from '@/lib/seo/slug'
import { normalizeManufacturer } from '@/lib/filmFields'

/**
 * Finding the brand a submitted name refers to, or making one.
 *
 * Matching is deliberately generous — exact name, then slug, then alias, all
 * case-insensitively — because the whole point of the table is that "Yestar",
 * "Yes!Star" and "yesstar" are one company. A miss here does not merely create
 * a duplicate row; it splits a brand's catalogue in two and the split is
 * invisible until someone notices half the films are missing from a page.
 */
export async function resolveBrand(input: string): Promise<{ id: string } | null> {
  const name = normalizeManufacturer(input)
  if (!name) return null

  const slug = slugify(name)

  const existing = await prisma.brand.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { slug },
        // Aliases carry the spellings and corporate names a reader might use.
        { aliases: { has: name } },
      ],
    },
    select: { id: true },
  })
  if (existing) return existing

  // New brand. The catalogue grows this way, and refusing unknown names would
  // mean no stock could be added without an administrator first.
  const taken = new Set(
    (await prisma.brand.findMany({ select: { slug: true } })).map(b => b.slug)
  )

  return prisma.brand.create({
    data: { slug: uniqueSlug(slug, taken), name },
    select: { id: true },
  })
}
