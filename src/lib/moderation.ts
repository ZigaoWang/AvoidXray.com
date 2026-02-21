/**
 * Image status values used in moderation workflow
 */
export type ImageStatus = 'none' | 'pending' | 'approved' | 'rejected'

/**
 * Determine moderation status for an update
 *
 * @param isAdmin - Whether the user is an admin
 * @param hasChanges - Whether there are actual changes being made
 * @returns Image status for the update
 */
export function determineModerationStatus(
  isAdmin: boolean,
  hasChanges: boolean
): ImageStatus {
  if (!hasChanges) return 'none'
  return isAdmin ? 'approved' : 'pending'
}

/**
 * Check if admins should be notified about this change
 *
 * @param isAdmin - Whether the user is an admin
 * @returns True if notification should be sent
 */
export function shouldNotifyAdmins(isAdmin: boolean): boolean {
  return !isAdmin
}

/**
 * Build moderation-related update data for image upload
 *
 * @param userId - User making the change
 * @param isAdmin - Whether user is admin
 * @param hasImageUpload - Whether a new image is being uploaded
 * @returns Partial update data with moderation fields
 */
export function buildModerationUpdateData(
  userId: string,
  isAdmin: boolean,
  hasImageUpload: boolean
): {
  imageStatus: ImageStatus
  imageUploadedBy?: string
  imageUploadedAt?: Date
} {
  const updateData: {
    imageStatus: ImageStatus
    imageUploadedBy?: string
    imageUploadedAt?: Date
  } = {
    imageStatus: isAdmin ? 'approved' : 'pending'
  }

  // Always update upload metadata when there are changes
  if (!isAdmin || hasImageUpload) {
    updateData.imageUploadedBy = userId
    updateData.imageUploadedAt = new Date()
  }

  return updateData
}

/**
 * Get user-facing message based on moderation status
 *
 * @param isAdmin - Whether the user is an admin
 * @returns Success message for the user
 */
export function getModerationMessage(isAdmin: boolean): string {
  return isAdmin
    ? 'Changes saved and approved.'
    : 'Changes submitted successfully. Waiting for admin review.'
}
