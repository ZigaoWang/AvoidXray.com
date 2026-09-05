import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { prisma } from '@/lib/db'
import { ADMIN_RESOURCES, displayValue, type ResourceSpec } from '@/lib/admin/resources'
import type { EntityType } from '@prisma/client'

/**
 * The pending queue, with enough context to decide without opening each record.
 *
 * Every proposal arrives with the current value beside the proposed one, so a
 * reviewer reads a diff rather than a list of assertions. Loading that per row
 * on the client would be one request per field; it is assembled here instead.
 */

const ENTITY_RESOURCE = { FILM_STOCK: 'films', CAMERA: 'cameras' } as const

/** The record a revision targets, by entity type. */
async function loadEntities(entityType: EntityType, ids: string[]) {
  if (ids.length === 0) return new Map<string, Record<string, unknown>>()

  const rows =
    entityType === 'FILM_STOCK'
      ? await prisma.filmStock.findMany({ where: { id: { in: ids } } })
      : await prisma.camera.findMany({ where: { id: { in: ids } } })

  return new Map(rows.map(r => [r.id, r as unknown as Record<string, unknown>]))
}

/** Renders a stored value as the reviewer should read it. */
function readable(column: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.join(', ')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return displayValue(column, value)
  return String(value)
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const revisions = await prisma.revision.findMany({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'asc' },
    include: { submittedBy: { select: { username: true } } },
    take: 100,
  })

  // Grouped so one query per entity type serves the whole page, rather than one
  // per revision. A generated batch is dozens of proposals at once and this
  // screen is what it has to be reviewed through.
  const byType = new Map<EntityType, string[]>()
  for (const r of revisions) {
    if (!r.entityId) continue
    byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r.entityId])
  }
  const entities = new Map<EntityType, Map<string, Record<string, unknown>>>()
  for (const [type, ids] of byType) entities.set(type, await loadEntities(type, ids))

  // Earlier refusals on the same record. A rejection does not block a value
  // being proposed again, so the reviewer needs to see that it was refused
  // before and why, and judge whether anything has changed.
  const priorByEntity = new Map<string, Array<{ field: string; reason: string; at: Date | null }>>()
  const settled = await prisma.revision.findMany({
    where: {
      status: { in: ['REJECTED', 'PARTIAL'] },
      entityId: { in: revisions.map(r => r.entityId).filter((v): v is string => !!v) },
    },
    select: { entityId: true, rejectedFields: true, reviewedAt: true },
    orderBy: { reviewedAt: 'desc' },
    take: 200,
  })
  for (const s of settled) {
    if (!s.entityId || !s.rejectedFields) continue
    const existing = priorByEntity.get(s.entityId) ?? []
    for (const [field, reason] of Object.entries(s.rejectedFields as Record<string, string>)) {
      existing.push({ field, reason, at: s.reviewedAt })
    }
    priorByEntity.set(s.entityId, existing)
  }

  const rows = revisions.map(r => {
    const resource = ENTITY_RESOURCE[r.entityType as keyof typeof ENTITY_RESOURCE]
    const spec: ResourceSpec | undefined = resource ? ADMIN_RESOURCES[resource] : undefined
    const entity = r.entityId ? entities.get(r.entityType)?.get(r.entityId) : undefined
    const payload = r.payload as Record<string, unknown>
    // Either one URL for the whole field, or a citation per claim. The second
    // is what the pass writes now, because a field-level citation puts one URL
    // under two hundred words and the claims underneath inherit a source that
    // may not support them.
    const rawSources = (r.sourceUrls ?? {}) as Record<string, unknown>

    const citationsFor = (field: string): Array<{ claim: string; url?: string; editorial?: boolean }> => {
      const value = rawSources[field]
      if (typeof value === 'string') return [{ claim: '', url: value }]
      if (Array.isArray(value)) return value as Array<{ claim: string; url?: string; editorial?: boolean }>
      return []
    }

    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: (entity?.name as string) ?? '(deleted)',
      source: r.source,
      submittedBy: r.submittedBy?.username ?? null,
      submittedAt: r.submittedAt,
      // The version the draft was made against, so the screen can warn that
      // something changed underneath rather than discovering it on apply.
      stale: r.baseVersion !== null && entity ? entity.version !== r.baseVersion : false,
      fields: Object.entries(payload).map(([field, proposed]) => ({
        field,
        label: spec?.editable[field]?.label ?? field,
        current: readable(field, entity?.[field]),
        proposed: readable(field, proposed),
        citations: citationsFor(field),
        // A model-written value with no citation should not be here at all, but
        // the screen says so rather than assuming the constraint held.
        // Editorial paragraphs are not uncited, they are a different kind of
        // thing. Only a missing source on a claim counts.
        uncited:
          r.source === 'LLM' &&
          citationsFor(field).some(c => !c.editorial && !c.url),
      })),
      priorRejections: (r.entityId ? priorByEntity.get(r.entityId) : undefined) ?? [],
    }
  })

  return NextResponse.json({ revisions: rows })
}
