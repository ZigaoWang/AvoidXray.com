/**
 * The payload NewItemModal produces, and the one place it is turned into a
 * request body.
 *
 * Every caller used to declare its own inline shape and append fields by hand.
 * They drifted: the modal collected manufacturer, process, color balance and
 * aliases for a new film stock and all three call sites silently dropped them,
 * because an omitted optional field is not a type error. Adding a field to the
 * form now means adding it here, and every caller picks it up.
 */

export interface NewItemPayload {
  name: string
  description?: string
  image?: File

  // Camera
  cameraType?: string
  year?: string
  defaultFilmStockId?: string

  // Film stock
  filmType?: string
  iso?: string
  manufacturer?: string
  process?: string
  colorBalance?: string
  /** Comma separated; the API splits and normalizes. */
  aliases?: string
  /** Frames per roll, e.g. "36" or "24, 36". Shown on the film page. */
  exposures?: string

  /** Both kinds carry a format, so it is shared rather than duplicated. */
  format?: string
}

/** Fields sent for each kind, so neither can leak the other's. */
const FIELDS = {
  camera: ['cameraType', 'format', 'year', 'defaultFilmStockId'],
  film: ['filmType', 'format', 'iso', 'exposures', 'manufacturer', 'process', 'colorBalance', 'aliases'],
} as const satisfies Record<'camera' | 'film', readonly (keyof NewItemPayload)[]>

export function buildNewItemFormData(
  type: 'camera' | 'film',
  data: NewItemPayload
): FormData {
  const formData = new FormData()
  formData.append('name', data.name)
  if (data.description) formData.append('description', data.description)
  if (data.image) formData.append('image', data.image)

  for (const field of FIELDS[type]) {
    const value = data[field]
    // Empty strings are "not set" here, same as undefined — the form uses ''
    // for an unselected dropdown.
    if (typeof value === 'string' && value) formData.append(field, value)
  }

  return formData
}

/** The endpoint that creates each kind. */
export const CREATE_ENDPOINT = {
  camera: '/api/cameras',
  film: '/api/filmstocks',
} as const
