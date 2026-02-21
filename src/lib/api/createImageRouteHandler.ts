import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToOSS, deleteFromOSS } from '@/lib/oss'
import { sendAdminModerationNotification } from '@/lib/email'
import { processItemImage } from '@/lib/imageProcessing'
import { sanitizeString, validateFileSize, validateImageType, VALIDATION_LIMITS } from '@/lib/validation'
import { extractKeyFromUrl, generateImageKey } from '@/lib/ossUtils'
import type { Camera, FilmStock } from '@prisma/client'

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
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
  updateResource: (id: string, data: any) => Promise<T>

  /** Permission check function */
  canEdit: (resource: T, userId: string, isAdmin: boolean) => boolean

  /** Permission check for deletion */
  canDelete: (resource: T, userId: string, isAdmin: boolean) => boolean

  /** Field validators */
  validators: Record<string, (value: string) => boolean>

  /** Categorization field names specific to this resource */
  categorizationFields: string[]

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

      // Permission check (always true for edits - community-driven)
      if (!config.canEdit(resource, userId, user?.isAdmin || false)) {
        return NextResponse.json(
          { success: false, error: `You don't have permission to edit this ${config.resourceDisplayName.toLowerCase()}` } as ApiResponse,
          { status: 403 }
        )
      }

      // Parse form data
      const formData = await req.formData()
      const file = formData.get('image') as File | null

      // Get and sanitize all fields
      const rawDescription = formData.get('description') as string | null
      const description = sanitizeString(rawDescription)

      // Get categorization fields
      const categorizationData: Record<string, any> = {}
      for (const field of config.categorizationFields) {
        const rawValue = formData.get(field) as string | null
        const sanitized = sanitizeString(rawValue)

        // Validate if provided and has validator
        if (sanitized && config.validators[field]) {
          if (!config.validators[field](sanitized)) {
            return NextResponse.json(
              { success: false, error: `Invalid ${field} value` } as ApiResponse,
              { status: 400 }
            )
          }
        }

        if (sanitized) {
          // Convert to number if needed
          if (field === 'year' || field === 'iso') {
            categorizationData[field] = parseInt(sanitized)
          } else {
            categorizationData[field] = sanitized
          }
        }
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
        if (!validateImageType(file.type)) {
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
      const proposedData: any = {}
      if (descriptionChanged) proposedData.description = description
      Object.assign(proposedData, categorizationData)

      // Process image if uploaded (to temporary location for non-admins)
      let proposedImageUrl: string | null = null
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

      // Store current state for comparison
      const originalData: any = {}
      for (const field of ['description', ...config.categorizationFields]) {
        if ((resource as any)[field] !== undefined) {
          originalData[field] = (resource as any)[field]
        }
      }

      // If admin: apply changes immediately
      if (user?.isAdmin) {
        const updateData: any = { ...proposedData }

        if (proposedImageUrl) {
          // Delete old image
          if (resource.imageUrl) {
            const oldKey = extractKeyFromUrl(resource.imageUrl)
            if (oldKey) {
              try {
                await deleteFromOSS(oldKey)
              } catch (error) {
                console.error('Failed to delete old image:', error)
              }
            }
          }
          updateData.imageUrl = proposedImageUrl
          updateData.imageUploadedBy = userId
          updateData.imageUploadedAt = new Date()
        }

        updateData.imageStatus = 'approved'

        const updatedResource = await config.updateResource(resourceId, updateData)

        return NextResponse.json({
          success: true,
          message: 'Changes saved and approved.',
          data: updatedResource
        } as ApiResponse<T>)
      }

      // Non-admin: Create moderation submission
      const submission = await prisma.moderationSubmission.create({
        data: {
          resourceType: config.resourceType,
          resourceId: resourceId,
          submittedBy: userId,
          status: 'pending',
          proposedImage: proposedImageUrl,
          proposedData: proposedData,
          originalImage: resource.imageUrl,
          originalData: originalData
        }
      })

      // Send admin notification
      if (user) {
        sendAdminModerationNotification(
          config.resourceType,
          config.getResourceName(resource),
          config.getResourceBrand(resource),
          user.username || user.email || 'Unknown',
          resourceId
        ).catch(err => {
          console.error('Failed to send admin notification:', err)
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Changes submitted successfully. Waiting for admin review.',
        data: { submissionId: submission.id }
      } as ApiResponse)

    } catch (error) {
      console.error(`[${config.resourceDisplayName}] Update error:`, error)
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

      // Delete from OSS
      if (resource.imageUrl) {
        const key = extractKeyFromUrl(resource.imageUrl)
        if (key) {
          try {
            await deleteFromOSS(key)
            console.log(`[${config.resourceDisplayName}] Deleted image:`, key)
          } catch (error) {
            console.error(`[${config.resourceDisplayName}] Failed to delete image from OSS:`, error)
          }
        }
      }

      // Update resource
      const updatedResource = await config.updateResource(resourceId, {
        imageUrl: null,
        imageStatus: 'none',
        imageUploadedBy: null,
        imageUploadedAt: null
      })

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
