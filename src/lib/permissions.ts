import type { Camera, FilmStock } from '@prisma/client'

/**
 * Who may change a camera or film stock.
 *
 * Only deletion is gated. Proposing an edit is open to anyone signed in by
 * design — that is what makes the catalogue community-maintained — and the
 * moderation queue, not a predicate here, is what decides whether a proposal
 * lands. There were once canEditCamera/canEditFilmStock functions expressing
 * that, but they took three arguments, ignored all of them and returned true,
 * which reads like a check while being none.
 */

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
  // Whoever added the camera has no special claim on it: a catalogue entry is
  // shared, and the account that created it is provenance rather than a right.
  // The person who uploaded the image still does, since that is their file.
  return camera.imageUploadedBy === userId || isAdmin
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
