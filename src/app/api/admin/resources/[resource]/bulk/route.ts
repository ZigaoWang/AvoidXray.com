import { NextRequest, NextResponse } from 'next/server'
import { currentUserId, requireAdmin } from '@/lib/admin/auth'
import { isResourceName } from '@/lib/admin/resources'
import { bulkDeleteResource, bulkUpdateResource, MAX_BULK_IDS } from '@/lib/admin/repository'

/**
 * The same edits and deletions as the resource endpoint, applied to a selection.
 *
 * Kept beside it rather than folded into it: the single-record handlers take an
 * `id` and report one outcome, and overloading them on the shape of the body is
 * how a request meaning "this one" quietly becomes "these two hundred".
 */

/** Deduplicated and bounded, so one request cannot ask for unbounded work. */
function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids = raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return [...new Set(ids)].slice(0, MAX_BULK_IDS)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { resource } = await params
  if (!isResourceName(resource)) {
    return NextResponse.json({ error: 'Unknown section' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { ids: rawIds, changes } = body as { ids?: unknown; changes?: unknown }
  const ids = parseIds(rawIds)
  if (ids.length === 0) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })
  if (!changes || typeof changes !== 'object') {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const result = await bulkUpdateResource(resource, ids, changes as Record<string, unknown>)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ updated: result.updated, requested: ids.length })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { resource } = await params
  if (!isResourceName(resource)) {
    return NextResponse.json({ error: 'Unknown section' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const ids = parseIds((body as { ids?: unknown } | null)?.ids)
  if (ids.length === 0) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })

  // The single-record path refuses this for the same reason: removing your own
  // account midway through signs you out and leaves one fewer administrator.
  // Refused rather than skipped, so the count cannot come back quietly short.
  const self = await currentUserId()
  if (resource === 'users' && self && ids.includes(self)) {
    return NextResponse.json({ error: 'Your own account is in the selection' }, { status: 400 })
  }

  const result = await bulkDeleteResource(resource, ids)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ deleted: result.deleted, requested: ids.length })
}
