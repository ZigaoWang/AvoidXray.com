/**
 * What NewItemModal produces, and the one place it is turned into a request
 * body.
 *
 * Every caller used to declare its own inline shape and append fields by hand.
 * They drifted: the modal collected manufacturer, process, color balance and
 * aliases for a new film stock and all three call sites silently dropped them,
 * because an omitted optional field is not a type error. The replacement for
 * that was a list of permitted keys here, and it drifted in its turn — the
 * frame format the form has always asked for was never in it, so no camera
 * added through the site ever carried one.
 *
 * So there is no list. The fields are whatever `catalogFields` produced from
 * the draft, keyed by the column names the create routes check against
 * ADMIN_RESOURCES. A control the form grows reaches the endpoint with nothing
 * edited here.
 */

export interface NewItemPayload {
  name: string
  description?: string
  image?: File
  /** Column name to value, from `catalogFields` in src/lib/catalogForm.ts. */
  fields: Record<string, string>
}

/**
 * No `type` argument: the fields are already the ones the draft produced for
 * that kind, so neither can leak the other's and there is nothing left to
 * switch on.
 */
export function buildNewItemFormData(data: NewItemPayload): FormData {
  const formData = new FormData()
  formData.append('name', data.name)
  if (data.description) formData.append('description', data.description)
  if (data.image) formData.append('image', data.image)

  for (const [field, value] of Object.entries(data.fields)) {
    // Empty is "not set" on a record that does not exist yet: there is nothing
    // to clear. The edit path treats an empty value differently, and on
    // purpose — see createImageRouteHandler.
    if (value && field !== 'name') formData.append(field, value)
  }

  return formData
}

/** The endpoint that creates each kind. */
export const CREATE_ENDPOINT = {
  camera: '/api/cameras',
  film: '/api/filmstocks',
} as const
