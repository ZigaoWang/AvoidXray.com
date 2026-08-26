import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { isResourceName } from '@/lib/admin/resources'
import { deleteResource, listResource, updateResource } from '@/lib/admin/repository'
import { parseIntParam } from '@/lib/validation'

/**
 * One endpoint for every admin section: list, edit, remove.
 *
 * The resource name comes from the path and is checked against the registry
 * before anything else, so an unknown value cannot reach a Prisma call.
 */

const DEFAULT_PAGE_SIZE = 25

export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { resource } = await params
  if (!isResourceName(resource)) {
    return NextResponse.json({ error: 'Unknown section' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const result = await listResource(resource, {
    page: parseIntParam(searchParams.get('page'), { fallback: 1, min: 1, max: 100_000 }),
    pageSize: parseIntParam(searchParams.get('pageSize'), { fallback: DEFAULT_PAGE_SIZE, min: 1, max: 100 }),
    search: searchParams.get('search') ?? '',
    filter: searchParams.get('filter') ?? undefined,
  })

  return NextResponse.json(result)
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

  const { id, ...changes } = body as { id?: unknown }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const result = await updateResource(resource, id, changes as Record<string, unknown>)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { resource } = await params
  if (!isResourceName(resource)) {
    return NextResponse.json({ error: 'Unknown section' }, { status: 404 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Deleting your own account from the admin table would sign you out midway
  // through and leave the site with one fewer administrator than intended.
  const self = await requireAdmin.currentUserId()
  if (resource === 'users' && id === self) {
    return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 })
  }

  const result = await deleteResource(resource, id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
