import { prisma } from '@/lib/db'
import { Prisma, type EntityType, type ValueSource } from '@prisma/client'
import { ADMIN_RESOURCES, coerceField, type ResourceName, type ResourceSpec } from '@/lib/admin/resources'
import { reslugIfRenamed } from '@/lib/seo/rename'

/**
 * The one door every edit goes through.
 *
 * A contributor, an administrator and an automated writer submit the same shape
 * and differ only in `source`. An administrator's edit is approved in the same
 * transaction that creates it, so it costs no extra step, but it still leaves a
 * diff, a history and provenance rows behind.
 *
 * Applying is deliberately one transaction: the entity write, the provenance
 * rows and the version bump land together or not at all. Provenance written
 * afterwards by a caller is provenance that goes missing the first time
 * something throws, which is how the previous admin path came to have none.
 */

/** The tables a revision can target, and the resource each maps to. */
const ENTITY_RESOURCE: Partial<Record<EntityType, ResourceName>> = {
  FILM_STOCK: 'films',
  CAMERA: 'cameras',
}

export interface RevisionInput {
  entityType: EntityType
  entityId: string
  /** Only the fields being changed. */
  payload: Record<string, unknown>
  /** Per-field citations. Required for every field when the source is a model. */
  sourceUrls?: Record<string, string>
  source: ValueSource
  submittedById?: string | null
}

/** One citation and the passage it stands behind. */
export interface ClaimCitation {
  /** The opening words of the passage, used to detect an edit moving under it. */
  claim: string
  url?: string
  /** House voice: judgment rather than a claim, so it needs no source. */
  editorial?: boolean
}

export interface ReviewDecision {
  /** Fields to apply. Anything omitted is rejected. */
  approve: string[]
  /** Field name to reason, for everything not approved. */
  reject: Record<string, string>
  reviewedById: string
}

/** What a caller needs to know without reading the row back. */
export interface ApplyResult {
  applied: string[]
  rejected: string[]
  /** Fields whose value changed underneath the draft, so were not applied. */
  stale: string[]
  /**
   * Citations dropped because the words they supported are no longer present.
   *
   * Reported rather than silently discarded: losing a manufacturer citation
   * because somebody reworded a sentence is worth knowing about, and the
   * alternative is leaving it attached to text it never stood behind.
   */
  orphanedCitations: Array<{ field: string; claim: string; url: string | null }>
}

/**
 * Turns a payload into values the columns accept, using the same allowlist and
 * coercion the admin table uses. A field the resource does not permit is
 * dropped rather than written, so a revision cannot reach a column no form
 * offers.
 */
function coercePayload(resource: ResourceName, payload: Record<string, unknown>) {
  // Widened from the const-asserted literal, as the admin table does: every
  // resource is treated the same way here and the fields are looked up by name.
  const spec: ResourceSpec = ADMIN_RESOURCES[resource]
  const data: Record<string, unknown> = {}
  const rejected: Record<string, string> = {}

  for (const [field, value] of Object.entries(payload)) {
    const fieldSpec = spec.editable[field]
    if (!fieldSpec) {
      rejected[field] = 'Not an editable field on this record'
      continue
    }
    const result = coerceField(fieldSpec, value)
    if ('error' in result) {
      rejected[field] = result.error
      continue
    }
    data[field] = result.value
  }

  return { data, rejected }
}

/** Records a proposal. Nothing is written to the record itself. */
export async function submitRevision(input: RevisionInput) {
  return prisma.revision.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      baseVersion: await currentVersion(input.entityType, input.entityId),
      payload: input.payload as Prisma.InputJsonValue,
      sourceUrls: (input.sourceUrls ?? {}) as Prisma.InputJsonValue,
      source: input.source,
      submittedById: input.submittedById ?? null,
    },
  })
}

async function currentVersion(entityType: EntityType, entityId: string): Promise<number | null> {
  if (entityType === 'FILM_STOCK') {
    return (await prisma.filmStock.findUnique({ where: { id: entityId }, select: { version: true } }))?.version ?? null
  }
  if (entityType === 'CAMERA') {
    return (await prisma.camera.findUnique({ where: { id: entityId }, select: { version: true } }))?.version ?? null
  }
  return null
}

/**
 * Applies the approved fields and records the rest as refused.
 *
 * A rejection is an event, not a standing judgement. It says this proposal was
 * refused and why; it does not stop the same value being proposed again. A
 * value refused for want of a citation is not a wrong value, and the same value
 * with a source attached has to be able to pass.
 */
export async function reviewRevision(
  revisionId: string,
  decision: ReviewDecision
): Promise<ApplyResult | { error: string }> {
  const revision = await prisma.revision.findUnique({ where: { id: revisionId } })
  if (!revision) return { error: 'That revision no longer exists' }
  if (revision.status !== 'PENDING') return { error: 'That revision has already been reviewed' }
  if (!revision.entityId) return { error: 'Creating new records this way is not supported yet' }

  const resource = ENTITY_RESOURCE[revision.entityType]
  if (!resource) return { error: 'That kind of record cannot be revised yet' }

  const payload = revision.payload as Record<string, unknown>
  const approved = Object.fromEntries(
    Object.entries(payload).filter(([field]) => decision.approve.includes(field))
  )

  const { data, rejected: uncoercible } = coercePayload(resource, approved)
  const rejected: Record<string, string> = { ...decision.reject, ...uncoercible }

  // Optimistic concurrency. A field that changed underneath the draft is held
  // back for another look rather than silently overwriting the newer value.
  const stale: string[] = []
  const live = await currentVersion(revision.entityType, revision.entityId)
  if (revision.baseVersion !== null && live !== null && live !== revision.baseVersion) {
    for (const field of Object.keys(data)) {
      stale.push(field)
      rejected[field] = 'The record changed after this was drafted. Re-check and propose again.'
      delete data[field]
    }
  }

  const appliedFields = Object.keys(data)
  const rawSources = (revision.sourceUrls ?? {}) as Record<string, unknown>

  /** The citations a revision proposes for a field, in either shape. */
  const proposedClaims = (field: string): ClaimCitation[] => {
    const value = rawSources[field]
    if (typeof value === 'string') return [{ claim: '', url: value }]
    if (Array.isArray(value)) return value as ClaimCitation[]
    return []
  }

  // Citations already on the record whose words the new text no longer
  // contains. A citation that outlives the sentence it supported is the same
  // failure as citing a page that does not contain the claim.
  const orphanedCitations: ApplyResult['orphanedCitations'] = []
  const existingProvenance = appliedFields.length
    ? await prisma.fieldProvenance.findMany({
        where: {
          entityType: revision.entityType,
          entityId: revision.entityId,
          fieldName: { in: appliedFields },
        },
        select: { fieldName: true, claims: true },
      })
    : []

  /**
   * Per field, the citations already on the record whose words the new value
   * still contains.
   *
   * These are carried forward when the revision proposes none of its own,
   * which is every edit made through the admin table: applyAdminEdit submits a
   * payload and no citations, so replacing wholesale meant correcting a typo in
   * a description destroyed every source attached to it. The migration that
   * introduced claims states the rule as dropping a claim whose words are no
   * longer present, which only means anything if the rest are kept.
   *
   * A citation carried over from before claims existed has no text to check, so
   * it survives any edit. That is the old field-level behaviour and no worse
   * than it; the alternative here is deleting it.
   */
  const survivingClaims = new Map<string, ClaimCitation[]>()

  for (const row of existingProvenance) {
    const previous = (row.claims ?? []) as unknown as ClaimCitation[]
    const nextText = String(data[row.fieldName] ?? '')
    const survivors: ClaimCitation[] = []
    for (const c of previous) {
      if (c.claim && !nextText.includes(c.claim)) {
        orphanedCitations.push({ field: row.fieldName, claim: c.claim, url: c.url ?? null })
      } else {
        survivors.push(c)
      }
    }
    survivingClaims.set(row.fieldName, survivors)
  }

  await prisma.$transaction(async tx => {
    if (appliedFields.length > 0) {
      const write = { ...data, version: { increment: 1 } }
      if (revision.entityType === 'FILM_STOCK') {
        await tx.filmStock.update({ where: { id: revision.entityId! }, data: write })
      } else {
        await tx.camera.update({ where: { id: revision.entityId! }, data: write })
      }

      // In the same transaction, not afterwards and not best effort. Provenance
      // written by a separate call is provenance that disappears the first time
      // something throws between the two.
      for (const field of appliedFields) {
        // A revision that cites its own claims is authoritative for the field:
        // the rewrite pass proposes the complete set. One that cites nothing is
        // not saying the sources are gone, so what survived the edit stands.
        const proposed = proposedClaims(field)
        const claims = proposed.length > 0 ? proposed : (survivingClaims.get(field) ?? [])
        // The field-level URL stays the strongest citation the field carries,
        // for callers that only need one. The claim list is the real record.
        const url = claims.find(c => !c.editorial && c.url)?.url ?? null
        await tx.fieldProvenance.upsert({
          where: {
            entityType_entityId_fieldName: {
              entityType: revision.entityType,
              entityId: revision.entityId!,
              fieldName: field,
            },
          },
          create: {
            entityType: revision.entityType,
            entityId: revision.entityId!,
            fieldName: field,
            source: revision.source,
            sourceUrl: url,
            claims: claims as unknown as Prisma.InputJsonValue,
            // An administrator applying their own edit has verified it by
            // definition. Anything else waits for someone to check it.
            verifiedById: revision.source === 'ADMIN' ? decision.reviewedById : null,
            verifiedAt: revision.source === 'ADMIN' ? new Date() : null,
          },
          update: {
            source: revision.source,
            sourceUrl: url,
            // Replaced wholesale, not merged. A claim from the previous text
            // that survived into the new one is re-proposed by this revision;
            // one that did not is reported as orphaned and does not linger.
            claims: claims as unknown as Prisma.InputJsonValue,
            verifiedById: revision.source === 'ADMIN' ? decision.reviewedById : null,
            verifiedAt: revision.source === 'ADMIN' ? new Date() : null,
          },
        })
      }
    }

    const rejectedFields = Object.keys(rejected)
    await tx.revision.update({
      where: { id: revisionId },
      data: {
        status:
          rejectedFields.length === 0 ? 'APPROVED'
          : appliedFields.length === 0 ? 'REJECTED'
          : 'PARTIAL',
        reviewedById: decision.reviewedById,
        reviewedAt: new Date(),
        appliedFields: appliedFields.length ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
        rejectedFields: rejectedFields.length ? (rejected as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
  })

  // The slug is built from the name, so an applied rename moves the page. Done
  // here rather than at each caller because this is the one place every applied
  // change passes through, and the previous arrangement had it at two call
  // sites and missing from a third.
  //
  // After the transaction: retireSlug runs its own, and the rename has to be
  // committed before a slug is computed from it.
  if (appliedFields.includes('name') || appliedFields.includes('brand')) {
    const kind = revision.entityType === 'FILM_STOCK' ? 'film' : 'camera'
    await reslugIfRenamed(kind, revision.entityId, data)
  }

  return { applied: appliedFields, rejected: Object.keys(rejected), stale, orphanedCitations }
}

/**
 * An administrator's edit: proposed and approved together.
 *
 * One action, no intermediate state and no second click. If applying your own
 * edit ever costs an extra step, the immediate path comes back and the history
 * stops being written, which is the outcome this exists to prevent.
 */
export async function applyAdminEdit(
  entityType: EntityType,
  entityId: string,
  payload: Record<string, unknown>,
  adminId: string
): Promise<ApplyResult | { error: string }> {
  const revision = await submitRevision({
    entityType,
    entityId,
    payload,
    source: 'ADMIN',
    submittedById: adminId,
  })

  return reviewRevision(revision.id, {
    approve: Object.keys(payload),
    reject: {},
    reviewedById: adminId,
  })
}

/**
 * Earlier decisions on the same field, so a reviewer can see that something was
 * refused before and why.
 *
 * The escape hatch that makes rejection-as-event workable: rather than blocking
 * a re-proposal, show the reviewer the history and let them judge. A value
 * refused for lacking a citation and re-proposed with one is the system working.
 */
export async function priorDecisions(entityType: EntityType, entityId: string) {
  return prisma.revision.findMany({
    where: { entityType, entityId, status: { in: ['REJECTED', 'PARTIAL'] } },
    select: { id: true, rejectedFields: true, reviewedAt: true, source: true },
    orderBy: { reviewedAt: 'desc' },
    take: 10,
  })
}
