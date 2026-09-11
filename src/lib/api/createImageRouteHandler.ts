import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToOSS, discardStoredImage } from '@/lib/oss'
import { sendAdminModerationNotification } from '@/lib/email'
import { processItemImage } from '@/lib/imageProcessing'
import { sanitizeString, validateFileSize, validateImageType, VALIDATION_LIMITS } from '@/lib/validation'
import { refuseOversizedBody } from '@/lib/requestBody'
import { generateImageKey } from '@/lib/ossUtils'
import { enforceLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/rateLimitPolicy'
import { type SlugKind } from '@/lib/seo/rename'
import { applyAdminEdit, submitRevision } from '@/lib/revisions'
import {
  ADMIN_RESOURCES,
  CATALOG_RESOURCE,
  contributorFields,
  type FieldSpec,
} from '@/lib/admin/resources'
import { fromFormWording } from '@/lib/catalogWire'
import type { Camera, FilmStock } from '@prisma/client'

/**
 * Standard API response format
 */
/**
 * A value that can be written to a resource column: scalars, the string arrays
 * used for multi-valued fields, and the string form of an enum.
 */
export type FieldValue = string | number | boolean | string[] | Date | null

/** Field name to value, as assembled from a submitted form. */
export type ResourceUpdate = Record<string, FieldValue>

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

/**
 * Configuration for image route handler
 */
export interface ImageRouteConfig<T extends Camera | FilmStock> {
  /** Resource type name for logging and keys */
  resourceType: 'camera' | 'filmstock'

  /** Display name for notifications */
  resourceDisplayName: string

  /** Function to find the resource by ID */
  findResource: (id: string) => Promise<T | null>

  /** Function to update the resource */
  /**
   * Applies an update. The handler works in field/value pairs because it does
   * not know any resource's concrete shape, so implementations narrow to their
   * own Prisma input type at this boundary.
   */
  updateResource: (id: string, data: ResourceUpdate) => Promise<T>

  /** Permission check for deletion */
  canDelete: (resource: T, userId: string, isAdmin: boolean) => boolean

  /**
   * Field validators, for the two rules the FieldSpec cannot express: a year
   * in the future and an ISO that is not a speed. Everything a spec already
   * says — a length, a range, an enum member — is checked by `coerceField`
   * on the way out of the queue, and was being restated here.
   */
  validators: Record<string, (value: string) => boolean>

  /** Renders a stored value for the moderation diff, which is text. */
  formatForDisplay?: Record<string, (value: FieldValue) => string>

  /**
   * The slug namespace this resource lives in.
   *
   * Set when renaming the resource moves its public URL, which is the case for
   * both of them — an approved rename has to retire the old slug as a redirect
   * or every link to the page 404s.
   */
  slugKind?: SlugKind

  /** Extract resource name for notifications */
  getResourceName: (resource: T) => string

  /** Extract resource brand for notifications */
  getResourceBrand: (resource: T) => string | null
}

/**
 * Create a generic image route handler for cameras or film stocks
 */
export function createImageRouteHandler<T extends Camera | FilmStock>(
  config: ImageRouteConfig<T>
) {
  /**
   * POST handler - Submit edit for moderation or apply immediately if admin
   */
  const POST = async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    /**
     * What this request put in the bucket, hoisted above the try so the catch
     * can take it back out.
     *
     * The image is uploaded before the row that accounts for it exists -- a
     * Revision and, for an image, a ModerationSubmission -- and nothing
     * between those steps is atomic. A failure in between used to answer 500
     * and leave the object behind with nothing referencing it, waiting for an
     * administrator to run the orphan sweep.
     */
    let proposedImageUrl: string | null = null

    try {
      // Auth check
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' } as ApiResponse,
          { status: 401 }
        )
      }

      const userId = (session.user as { id: string }).id
      const { id: resourceId } = await params

      // Every submission is text and an image entering a human review queue,
      // and the image is processed and stored before an admin ever sees it.
      const limited = enforceLimit(
        'resource-edit', userId, LIMITS.contentWrite.perUser,
        'You are submitting edits very quickly. Please wait a moment.'
      )
      if (limited) return limited

      // Get resource and user in parallel
      const [resource, user] = await Promise.all([
        config.findResource(resourceId),
        prisma.user.findUnique({ where: { id: userId } })
      ])

      if (!resource) {
        return NextResponse.json(
          { success: false, error: `${config.resourceDisplayName} not found` } as ApiResponse,
          { status: 404 }
        )
      }

      // Anyone signed in may propose a change. A contributor's edit becomes a
      // revision and is worked in /admin/revisions, the same screen that
      // reviews an administrator's own edits and anything generated.

      // The per-file check further down runs after the body has already been
      // buffered into memory, so it bounds what is stored rather than what is
      // accepted. This bounds the accepting.
      const oversized = refuseOversizedBody(
        req,
        (VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB + 2) * 1024 * 1024,
        `Please choose an image under ${VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB}MB.`
      )
      if (oversized) return oversized

      // Parse form data
      const formData = await req.formData()
      const file = formData.get('image') as File | null

      // Get and sanitize all fields
      const rawDescription = formData.get('description') as string | null
      const description = sanitizeString(rawDescription)

      /**
       * The fields the form sent, out of the ones this record permits.
       *
       * The permitted list is derived from ADMIN_RESOURCES rather than kept
       * beside it. A second copy lived here and was the narrowest point in
       * the whole path: a key it did not name was never read, the value went
       * nowhere, and the submitter was told "submitted successfully". Ten
       * camera specs sat on the far side of it. Deriving it cannot widen what
       * gets written — `coercePayload` checks every key against the same
       * allowlist again before anything is applied.
       *
       * A key that is present and empty is a proposal to clear the field.
       * Skipping falsy values instead meant an emptied control and an
       * untouched one were indistinguishable, so a contributor could set a
       * wrong year and never remove it, while an administrator editing the
       * same record could. The form sends only what changed, so presence is
       * the signal and nothing has to be invented to carry it.
       */
      const resourceName = CATALOG_RESOURCE[config.resourceType]
      const editable: Record<string, FieldSpec> = ADMIN_RESOURCES[resourceName].editable
      const permitted = contributorFields(resourceName)

      const categorizationData: ResourceUpdate = {}
      for (const field of permitted) {
        if (!formData.has(field)) continue
        const sanitized = sanitizeString(formData.get(field) as string | null)

        if (!sanitized) {
          // A record still has to be called something and live somewhere.
          if (editable[field].required) {
            return NextResponse.json(
              { success: false, error: `${editable[field].label} cannot be emptied` } as ApiResponse,
              { status: 400 }
            )
          }
          categorizationData[field] = null
          continue
        }

        if (config.validators[field] && !config.validators[field](sanitized)) {
          return NextResponse.json(
            { success: false, error: `Invalid ${field} value` } as ApiResponse,
            { status: 400 }
          )
        }

        // Words to members, for the handful of fields the public form asks
        // for in the vocabulary printed on the thing itself. Everything else
        // travels as text and is parsed from its FieldSpec at approval.
        const value = fromFormWording(field, sanitized)
        if (value === null || value === undefined) {
          return NextResponse.json(
            { success: false, error: `Invalid ${field} value` } as ApiResponse,
            { status: 400 }
          )
        }

        categorizationData[field] = value as FieldValue
      }

      // Check if any changes were made
      const descriptionChanged = description !== null && description !== resource.description
      const hasCategorizationChanges = Object.keys(categorizationData).length > 0

      if (!file && !descriptionChanged && !hasCategorizationChanges) {
        return NextResponse.json(
          { success: false, error: 'No changes detected. Please modify at least one field.' } as ApiResponse,
          { status: 400 }
        )
      }

      // Validate file if provided
      if (file) {
        // A type that is present and wrong is refused early; an absent one —
        // which is common for HEIC out of a file picker — falls through to
        // processItemImage below, which converts HEIC and is what actually
        // establishes whether the bytes are an image.
        if (file.type && !validateImageType(file.type)) {
          return NextResponse.json(
            { success: false, error: 'File must be an image' } as ApiResponse,
            { status: 400 }
          )
        }

        if (!validateFileSize(file.size, VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB)) {
          return NextResponse.json(
            { success: false, error: `Image must be smaller than ${VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB}MB` } as ApiResponse,
            { status: 400 }
          )
        }
      }

      // Prepare proposed data
      const proposedData: ResourceUpdate = {}
      if (descriptionChanged) proposedData.description = description
      Object.assign(proposedData, categorizationData)

      // Process image if uploaded (to temporary location for non-admins)
      if (file) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer())
          const processedBuffer = await processItemImage(buffer)

          // Upload to temporary location for moderation
          const key = user?.isAdmin
            ? generateImageKey(config.resourceType, resourceId)
            : `moderation/${config.resourceType}/${resourceId}-${Date.now()}.webp`

          proposedImageUrl = await uploadToOSS(processedBuffer, key)
        } catch (error) {
          console.error(`[${config.resourceDisplayName}] Image processing error:`, error)
          return NextResponse.json(
            { success: false, error: 'Failed to process image' } as ApiResponse,
            { status: 500 }
          )
        }
      }

      // Current state, for the moderation diff. Values are rendered through the
      // resource's formatters so an array or an enum reads as text rather than
      // as its raw shape.
      // Prisma's Json column will not accept `unknown`; everything stored for
      // review is either a formatted string or a plain scalar.
      const display = (field: string, value: unknown): string | number | boolean | null => {
        if (value === null || value === undefined) return null
        // Values read off a resource are not statically known; narrowing here
        // keeps the formatter contract honest rather than widening it to unknown.
        const formatter = config.formatForDisplay?.[field]
        if (formatter) return formatter(value as FieldValue)
        if (Array.isArray(value)) return value.join(', ')
        if (value instanceof Date) return value.toISOString()
        if (typeof value === 'object') return String(value)
        return value as string | number | boolean
      }

      const originalData: Record<string, string | number | boolean | null> = {}
      for (const field of ['description', ...permitted]) {
        const value = (resource as Record<string, unknown>)[field]
        if (value !== undefined) originalData[field] = display(field, value)
      }

      // An admin's edit goes through the revision pipeline like everyone
      // else's, approved in the same transaction so it is still one action.
      // This was the last direct write path: the admin table was unified
      // earlier and this form was not, which is how a rename applied here
      // skipped the reslug that the pipeline now performs.
      if (user?.isAdmin) {
        const entityType = config.resourceType === 'filmstock' ? 'FILM_STOCK' : 'CAMERA'

        let refused: string[] = []
        if (Object.keys(proposedData).length > 0) {
          const applied = await applyAdminEdit(entityType, resourceId, proposedData, userId)
          if ('error' in applied) {
            return NextResponse.json(
              { success: false, error: applied.error } as ApiResponse,
              { status: 400 }
            )
          }
          // A field the pipeline refused is not an error — the rest of the
          // edit landed — but reporting "Changes saved and approved" over the
          // top of it is how a value can be typed, saved and silently not
          // stored, with nothing on screen to say so.
          refused = applied.rejected
        }

        // The image is a file, not a field value, so it is not part of the
        // revision payload and is written separately. Its moderation state
        // belongs to the asset rather than to any column a revision can reach.
        if (proposedImageUrl) {
          const replaced = resource.imageUrl
          await config.updateResource(resourceId, {
            imageUrl: proposedImageUrl,
            imageUploadedBy: userId,
            imageUploadedAt: new Date(),
            imageStatus: 'approved',
          })
          // Only now that the record names the new file.
          await discardStoredImage(replaced)
        }

        const updatedResource = await config.findResource(resourceId)

        return NextResponse.json({
          success: true,
          message: refused.length
            ? `Saved. ${refused.join(', ')} could not be applied and ${refused.length === 1 ? 'was' : 'were'} left unchanged.`
            : 'Changes saved and approved.',
          data: updatedResource
        } as ApiResponse<T>)
      }

      // A contributor's field edit becomes a revision, the same shape an
      // administrator's and an automated writer's take. ModerationSubmission is
      // read-only from here: nothing new lands in it, so the overlap between the
      // two queues ends rather than refilling indefinitely. Its remaining items
      // are resolved by hand and the table is dropped on the date recorded in
      // docs/db-objects.md.
      //
      // Guarded, because an image on its own changes no field. Filing a
      // revision for it put an empty payload in the review queue, which a
      // reviewer could only dismiss.
      let filedId: string | null = null
      if (Object.keys(proposedData).length > 0) {
        const revision = await submitRevision({
          entityType: config.resourceType === 'filmstock' ? 'FILM_STOCK' : 'CAMERA',
          entityId: resourceId,
          // The coerced values, not the display-formatted ones. A revision
          // payload is what gets written to the column if it is approved, and
          // the reviewer's coercion checks it against the same allowlist the
          // admin form uses. Sending the labels meant a contributor proposing
          // "C-41" or "Point & shoot" filed a revision that could never be
          // approved, because the column takes C41 and COMPACT. The admin branch
          // above already submits proposedData; the two now agree.
          payload: proposedData,
          source: 'USER',
          submittedById: userId,
        })
        filedId = revision.id
      }

      // The proposed image is not part of the revision payload, which carries
      // field values. It stays where the review screen already looks for it.
      if (proposedImageUrl) {
        const submission = await prisma.moderationSubmission.create({
          data: {
            resourceType: config.resourceType,
            resourceId,
            submittedBy: userId,
            status: 'pending',
            proposedImage: proposedImageUrl,
            proposedData: {},
            originalImage: resource.imageUrl,
            originalData: originalData,
          },
        })
        filedId ??= submission.id
      }

      // Send admin notification
      if (user) {
        sendAdminModerationNotification(
          config.resourceType,
          config.getResourceName(resource),
          config.getResourceBrand(resource),
          user.username || 'Unknown',
          resourceId
        ).catch(err => {
          console.error('Failed to send admin notification:', err)
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Changes submitted successfully. Waiting for admin review.',
        data: { submissionId: filedId }
      } as ApiResponse)

    } catch (error) {
      console.error(`[${config.resourceDisplayName}] Update error:`, error)

      // Best effort, and swallowed on purpose: this runs while the request is
      // already failing, and a delete that cannot find its object has nothing
      // to report. The point is not to add storage nobody can account for on
      // top of the error being returned.
      await discardStoredImage(proposedImageUrl)

      return NextResponse.json(
        { success: false, error: 'Failed to save changes. Please try again.' } as ApiResponse,
        { status: 500 }
      )
    }
  }

  /**
   * DELETE handler - Remove image
   */
  const DELETE = async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      // Auth check
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' } as ApiResponse,
          { status: 401 }
        )
      }

      const userId = (session.user as { id: string }).id
      const { id: resourceId } = await params

      // Get resource and user in parallel
      const [resource, user] = await Promise.all([
        config.findResource(resourceId),
        prisma.user.findUnique({ where: { id: userId } })
      ])

      if (!resource) {
        return NextResponse.json(
          { success: false, error: `${config.resourceDisplayName} not found` } as ApiResponse,
          { status: 404 }
        )
      }

      // Permission check
      if (!config.canDelete(resource, userId, user?.isAdmin || false)) {
        return NextResponse.json(
          { success: false, error: `You don't have permission to delete this image` } as ApiResponse,
          { status: 403 }
        )
      }

      const removed = resource.imageUrl

      const updatedResource = await config.updateResource(resourceId, {
        imageUrl: null,
        imageStatus: 'none',
        imageUploadedBy: null,
        imageUploadedAt: null
      })

      // Only now that the record has stopped naming the file.
      await discardStoredImage(removed)

      return NextResponse.json({
        success: true,
        message: 'Image deleted successfully',
        data: updatedResource
      } as ApiResponse<T>)

    } catch (error) {
      console.error(`[${config.resourceDisplayName}] Delete error:`, error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete image' } as ApiResponse,
        { status: 500 }
      )
    }
  }

  return { POST, DELETE }
}
