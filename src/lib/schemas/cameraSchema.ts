import { z } from 'zod'
import { VALIDATION_LIMITS } from '../validation'

/**
 * Schema for camera image upload form data
 */
export const cameraImageUpdateSchema = z.object({
  description: z.string()
    .max(VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH,
      `Description must be ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`)
    .nullable()
    .optional(),
  cameraType: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Camera type must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  format: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Format must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  mountType: z.string()
    .max(VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH,
      `Mount type must be ${VALIDATION_LIMITS.MAX_CUSTOM_FIELD_LENGTH} characters or less`)
    .nullable()
    .optional(),
  year: z.string()
    .regex(/^\d+$/, 'Year must be a number')
    .refine(
      (val) => {
        const year = parseInt(val)
        return year >= VALIDATION_LIMITS.YEAR_MIN && year <= VALIDATION_LIMITS.YEAR_MAX
      },
      `Year must be between ${VALIDATION_LIMITS.YEAR_MIN} and ${VALIDATION_LIMITS.YEAR_MAX}`
    )
    .nullable()
    .optional()
})

export type CameraImageUpdateInput = z.infer<typeof cameraImageUpdateSchema>
