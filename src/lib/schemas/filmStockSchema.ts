import { z } from 'zod'
import { VALIDATION_LIMITS } from '../validation'

/**
 * Schema for film stock image upload form data
 */
export const filmStockImageUpdateSchema = z.object({
  description: z.string()
    .max(VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH,
      `Description must be ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`)
    .nullable()
    .optional(),
  filmType: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Film type must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  format: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Format must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  process: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Process must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  exposures: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Exposures must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  iso: z.string()
    .regex(/^\d+$/, 'ISO must be a number')
    .refine(
      (val) => {
        const iso = parseInt(val)
        return iso >= VALIDATION_LIMITS.ISO_MIN && iso <= VALIDATION_LIMITS.ISO_MAX
      },
      `ISO must be between ${VALIDATION_LIMITS.ISO_MIN} and ${VALIDATION_LIMITS.ISO_MAX}`
    )
    .nullable()
    .optional()
})

export type FilmStockImageUpdateInput = z.infer<typeof filmStockImageUpdateSchema>
