import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { deleteFromOSS } from '@/lib/oss'
import { extractKeyFromUrl } from '@/lib/ossUtils'
import { ADMIN_RESOURCES, coerceField, type ResourceName } from './resources'
import { safeHttpUrl, sanitizeHandle } from '@/lib/validation'

/**
 * Reads and writes behind the admin sections.
 *
 * Each resource says how to list a page of itself, how to shape a row for the
 * table, and what has to happen on delete beyond removing the row — a photo
 * owns files in object storage, and a user owns rows the schema does not
 * cascade. Getting that wrong leaves orphans that nothing else cleans up.
 */

export interface ListParams {
  page: number
  pageSize: number
  search: string
  /** Section-specific narrowing, e.g. only unpublished photos. */
  filter?: string
}

export interface ListResult {
  rows: Record<string, unknown>[]
  total: number
}

const MAX_PAGE_SIZE = 100

/** Case-insensitive `contains` across a resource's searchable fields. */
function searchWhere(resource: ResourceName, search: string): Prisma.InputJsonValue | undefined {
  const term = search.trim()
  if (!term) return undefined
  const fields = ADMIN_RESOURCES[resource].searchFields
  return {
    OR: fields.map(field => ({ [field]: { contains: term, mode: 'insensitive' } })),
  } as unknown as Prisma.InputJsonValue
}

export async function listResource(resource: ResourceName, params: ListParams): Promise<ListResult> {
  const take = Math.min(Math.max(params.pageSize, 1), MAX_PAGE_SIZE)
  const skip = Math.max(params.page - 1, 0) * take
  const where = (searchWhere(resource, params.search) ?? {}) as Record<string, unknown>
  const orderBy = ADMIN_RESOURCES[resource].orderBy as Record<string, 'asc' | 'desc'>

  switch (resource) {
    case 'users': {
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where, orderBy, skip, take,
          omit: { email: false },
          include: { _count: { select: { photos: true, comments: true } } },
        }),
        prisma.user.count({ where }),
      ])
      return {
        total,
        rows: rows.map(u => ({
          id: u.id, username: u.username, name: u.name, email: u.email,
          bio: u.bio, website: u.website, instagram: u.instagram, twitter: u.twitter,
          isAdmin: u.isAdmin, emailVerified: u.emailVerified,
          photoCount: u._count.photos, commentCount: u._count.comments,
          createdAt: u.createdAt,
        })),
      }
    }

    case 'photos': {
      // Drafts are invisible everywhere else on the site, so the one place an
      // admin can see them needs to be able to single them out.
      const scoped = {
        ...where,
        ...(params.filter === 'unpublished' ? { published: false } : {}),
        ...(params.filter === 'private' ? { visibility: 'PRIVATE' as const } : {}),
      }
      const [rows, total] = await Promise.all([
        prisma.photo.findMany({
          where: scoped, orderBy, skip, take,
          include: {
            user: { select: { id: true, username: true } },
            camera: { select: { id: true, name: true } },
            filmStock: { select: { id: true, name: true } },
          },
        }),
        prisma.photo.count({ where: scoped }),
      ])
      return {
        total,
        rows: rows.map(p => ({
          id: p.id, thumbnail: p.thumbnailPath, caption: p.caption,
          owner: p.user.username, ownerId: p.user.id,
          camera: p.camera?.name ?? null, cameraId: p.cameraId,
          filmStock: p.filmStock?.name ?? null, filmStockId: p.filmStockId,
          visibility: p.visibility, published: p.published,
          takenDate: p.takenDate, createdAt: p.createdAt,
          width: p.width, height: p.height, originalBytes: p.originalBytes,
        })),
      }
    }

    case 'comments': {
      const [rows, total] = await Promise.all([
        prisma.comment.findMany({
          where, orderBy, skip, take,
          include: { user: { select: { username: true } } },
        }),
        prisma.comment.count({ where }),
      ])
      return {
        total,
        rows: rows.map(c => ({
          id: c.id, content: c.content, author: c.user.username,
          photoId: c.photoId, createdAt: c.createdAt,
        })),
      }
    }

    case 'cameras': {
      const [rows, total] = await Promise.all([
        prisma.camera.findMany({
          where, orderBy, skip, take,
          include: { _count: { select: { photos: true } } },
        }),
        prisma.camera.count({ where }),
      ])
      return {
        total,
        rows: rows.map(c => ({
          id: c.id, name: c.name, brand: c.brand, cameraType: c.cameraType,
          format: c.format, mountType: c.mountType, year: c.year,
          description: c.description, imageStatus: c.imageStatus,
          imageUrl: c.imageUrl, photoCount: c._count.photos, slug: c.slug,
        })),
      }
    }

    case 'films': {
      const [rows, total] = await Promise.all([
        prisma.filmStock.findMany({
          where, orderBy, skip, take,
          include: { _count: { select: { photos: true } } },
        }),
        prisma.filmStock.count({ where }),
      ])
      return {
        total,
        rows: rows.map(f => ({
          id: f.id, name: f.name, brand: f.brand, manufacturer: f.manufacturer,
          aliases: f.aliases, iso: f.iso, process: f.process,
          colorBalance: f.colorBalance, filmType: f.filmType, exposures: f.exposures,
          description: f.description, imageStatus: f.imageStatus,
          imageUrl: f.imageUrl, photoCount: f._count.photos, slug: f.slug,
        })),
      }
    }

    case 'albums': {
      const [rows, total] = await Promise.all([
        prisma.collection.findMany({
          where, orderBy, skip, take,
          include: { user: { select: { username: true } }, _count: { select: { photos: true } } },
        }),
        prisma.collection.count({ where }),
      ])
      return {
        total,
        rows: rows.map(a => ({
          id: a.id, name: a.name, description: a.description,
          owner: a.user?.username ?? null, public: a.public, featured: a.featured,
          photoCount: a._count.photos, createdAt: a.createdAt,
        })),
      }
    }

    case 'notes': {
      const [rows, total] = await Promise.all([
        prisma.communityNote.findMany({
          where, orderBy, skip, take,
          include: { user: { select: { username: true } }, _count: { select: { votes: true } } },
        }),
        prisma.communityNote.count({ where }),
      ])
      return {
        total,
        rows: rows.map(n => ({
          id: n.id, content: n.content, author: n.user.username,
          targetType: n.targetType, targetId: n.targetId,
          votes: n._count.votes, createdAt: n.createdAt,
        })),
      }
    }
  }
}

/**
 * Applies an update, having first reduced the submitted body to the fields the
 * resource actually allows and coerced each one.
 */
export async function updateResource(
  resource: ResourceName,
  id: string,
  body: Record<string, unknown>
): Promise<{ error: string } | { ok: true }> {
  const spec = ADMIN_RESOURCES[resource]
  const data: Record<string, unknown> = {}

  for (const [field, fieldSpec] of Object.entries(spec.editable)) {
    if (!(field in body)) continue
    const result = coerceField(fieldSpec, body[field])
    if ('error' in result) return { error: result.error }
    data[field] = result.value
  }

  if (Object.keys(data).length === 0) return { error: 'Nothing to update' }

  // Per-resource rules that a field allowlist alone cannot express.
  if (resource === 'users') {
    if (typeof data.username === 'string') {
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(data.username)) {
        return { error: 'Username must be 3-20 characters: letters, numbers, underscore, hyphen' }
      }
      data.username = data.username.toLowerCase()
      const clash = await prisma.user.findFirst({
        where: { username: data.username as string, NOT: { id } },
        select: { id: true },
      })
      if (clash) return { error: 'That username is already taken' }
    }
    // Same normalisation the public profile form gets, so an admin cannot
    // write a link the site would refuse from its owner.
    if ('website' in data) data.website = safeHttpUrl(data.website)
    if ('instagram' in data) data.instagram = sanitizeHandle(data.instagram)
    if ('twitter' in data) data.twitter = sanitizeHandle(data.twitter)
  }

  if (resource === 'photos') {
    // Foreign keys are verified rather than trusted, so a mistyped id fails
    // with a message instead of a constraint violation.
    if (data.cameraId) {
      const exists = await prisma.camera.findUnique({ where: { id: String(data.cameraId) }, select: { id: true } })
      if (!exists) return { error: 'No camera with that ID' }
    }
    if (data.filmStockId) {
      const exists = await prisma.filmStock.findUnique({ where: { id: String(data.filmStockId) }, select: { id: true } })
      if (!exists) return { error: 'No film stock with that ID' }
    }
  }

  if (resource === 'films' && data.process === null) {
    return { error: 'Process is required' }
  }

  try {
    switch (resource) {
      case 'users': await prisma.user.update({ where: { id }, data }); break
      case 'photos': await prisma.photo.update({ where: { id }, data }); break
      case 'comments': await prisma.comment.update({ where: { id }, data }); break
      case 'cameras': await prisma.camera.update({ where: { id }, data }); break
      case 'films': await prisma.filmStock.update({ where: { id }, data }); break
      case 'albums': await prisma.collection.update({ where: { id }, data }); break
      case 'notes': await prisma.communityNote.update({ where: { id }, data }); break
    }
    return { ok: true }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return { error: 'That record no longer exists' }
      if (error.code === 'P2002') return { error: 'A record with that value already exists' }
    }
    console.error(`[admin] update ${resource}/${id} failed:`, error)
    return { error: 'Could not save the change' }
  }
}

/** The object-storage keys a photo owns. */
function photoKeys(photo: { originalPath: string; mediumPath: string; thumbnailPath: string }): string[] {
  return [photo.originalPath, photo.mediumPath, photo.thumbnailPath]
    .map(extractKeyFromUrl)
    .filter((k): k is string => k !== null)
}

export async function deleteResource(
  resource: ResourceName,
  id: string
): Promise<{ error: string } | { ok: true }> {
  try {
    switch (resource) {
      case 'photos': {
        const photo = await prisma.photo.findUnique({ where: { id } })
        if (!photo) return { error: 'That photo no longer exists' }
        // Files first: a row removed while its objects survive leaves storage
        // nobody can account for, and the orphan sweep is the only thing that
        // would ever find them.
        await Promise.all(photoKeys(photo).map(key => deleteFromOSS(key).catch(() => {})))
        await prisma.photo.delete({ where: { id } })
        return { ok: true }
      }

      case 'users': {
        const photos = await prisma.photo.findMany({
          where: { userId: id },
          select: { originalPath: true, mediumPath: true, thumbnailPath: true },
        })
        await Promise.all(photos.flatMap(photoKeys).map(key => deleteFromOSS(key).catch(() => {})))
        // Neither of these carries a cascading relation to User, so they
        // outlive the account unless removed here.
        await prisma.notification.deleteMany({ where: { actorId: id } })
        await prisma.moderationSubmission.deleteMany({ where: { submittedBy: id } })
        await prisma.user.delete({ where: { id } })
        return { ok: true }
      }

      case 'comments': await prisma.comment.delete({ where: { id } }); return { ok: true }
      case 'cameras': await prisma.camera.delete({ where: { id } }); return { ok: true }
      case 'films': await prisma.filmStock.delete({ where: { id } }); return { ok: true }
      case 'albums': await prisma.collection.delete({ where: { id } }); return { ok: true }
      case 'notes': await prisma.communityNote.delete({ where: { id } }); return { ok: true }
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return { error: 'That record no longer exists' }
      if (error.code === 'P2003') {
        return { error: 'Still referenced by other records — remove those first' }
      }
    }
    console.error(`[admin] delete ${resource}/${id} failed:`, error)
    return { error: 'Could not delete that record' }
  }
}
