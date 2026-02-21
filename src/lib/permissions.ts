import type { Camera, FilmStock } from '@prisma/client'

/**
 * Check if user can edit a camera
 * Permission model: Owner or Admin
 *
 * @param camera - Camera object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to edit
 */
export function canEditCamera(
  camera: Camera,
  userId: string,
  isAdmin: boolean
): boolean {
  return camera.userId === userId || isAdmin
}

/**
 * Check if user can edit a film stock
 * Permission model: Admin OR first uploader (no imageUploadedBy yet) OR current uploader
 *
 * @param filmStock - FilmStock object
 * @param userId - Current user ID
 * @param isAdmin - Whether current user is admin
 * @returns True if user has permission to edit
 */
export function canEditFilmStock(
  filmStock: FilmStock,
  userId: string,
  isAdmin: boolean
): boolean {
  return (
    isAdmin ||
    !filmStock.imageUploadedBy ||
    filmStock.imageUploadedBy === userId
  )
}

/**
 * Check if user can delete an image from a camera
 * Same as edit permission
 */
export function canDeleteCameraImage(
  camera: Camera,
  userId: string,
  isAdmin: boolean
): boolean {
  return canEditCamera(camera, userId, isAdmin)
}

/**
 * Check if user can delete an image from a film stock
 * Permission model: Admin OR original uploader
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
