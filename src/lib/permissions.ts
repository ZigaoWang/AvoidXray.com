import type { Camera, FilmStock } from '@prisma/client'

/**
 * Check if user can suggest edits to a camera
 * Permission model: ANYONE can suggest edits (community-driven)
 * All edits go through moderation unless user is admin
 *
 * @param camera - Camera object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to suggest edits
 */
export function canEditCamera(
  camera: Camera,
  userId: string,
  isAdmin: boolean
): boolean {
  // Anyone can suggest edits - this is a community feature
  return true
}

/**
 * Check if user can suggest edits to a film stock
 * Permission model: ANYONE can suggest edits (community-driven)
 * All edits go through moderation unless user is admin
 *
 * @param filmStock - FilmStock object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to suggest edits
 */
export function canEditFilmStock(
  filmStock: FilmStock,
  userId: string,
  isAdmin: boolean
): boolean {
  // Anyone can suggest edits - this is a community feature
  return true
}

/**
 * Check if user can delete an image from a camera
 * Permission model: Owner OR Admin only
 * Deletion is more sensitive than editing
 *
 * @param camera - Camera object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to delete
 */
export function canDeleteCameraImage(
  camera: Camera,
  userId: string,
  isAdmin: boolean
): boolean {
  return camera.userId === userId || isAdmin
}

/**
 * Check if user can delete an image from a film stock
 * Permission model: Admin OR original uploader
 * Deletion is more sensitive than editing
 *
 * @param filmStock - FilmStock object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to delete
 */
export function canDeleteFilmStockImage(
  filmStock: FilmStock,
  userId: string,
  isAdmin: boolean
): boolean {
  return isAdmin || filmStock.imageUploadedBy === userId
}
