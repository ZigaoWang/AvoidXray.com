import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createImageRouteHandler, type ResourceUpdate } from '@/lib/api/createImageRouteHandler'
import { canDeleteCameraImage } from '@/lib/permissions'
import { validateYear } from '@/lib/validation'
import type { Camera } from '@prisma/client'
import { toBodyType, bodyTypeLabel } from '@/lib/cameraFields'

const { POST, DELETE } = createImageRouteHandler<Camera>({
  resourceType: 'camera',
  resourceDisplayName: 'Camera',

  findResource: (id: string) =>
    prisma.camera.findUnique({ where: { id } }),

  // The shared handler works in field/value pairs, since it cannot know any one
  // resource's shape. Narrowing happens here, at the single boundary where the
  // concrete model is known, rather than by widening the handler to `any`.
  updateResource: (id: string, data: ResourceUpdate) =>
    prisma.camera.update({
      where: { id },
      data: data as Prisma.CameraUpdateInput,
    }),

  canDelete: canDeleteCameraImage,

  slugKind: 'camera',

  validators: {
    year: validateYear,
    // A name is what the record is called and what its URL is built from, so an
    // empty or absurd one is refused rather than stored.
    name: (value) => value.trim().length > 0 && value.trim().length <= 120,
    brand: (value) => value.trim().length <= 60,
  },

  // name and brand are editable here now. Correcting a misspelt camera used to
  // require an administrator opening the database, because the only fields the
  // suggest-edit form could reach were the description and the categorisation.
  categorizationFields: ['name', 'brand', 'bodyType', 'format', 'mountType', 'year', 'defaultFilmStockId'],

  // A form field arrives as text and `year` is an Int column, so without this
  // the update reached Prisma as year: "1998" and threw. It only showed on the
  // admin path, which writes the record directly — a submission from anyone
  // else goes to the moderation queue, whose approval step parses the year
  // itself on the way out.
  coerce: {
    // Null for an unrecognised value would read as "clear this field", so the
    // handler's own rule applies instead: a coercion returning null on
    // non-empty input is a 400. An unclassified body is submitted as an absent
    // field, not as an unknown string.
    bodyType: (value) => toBodyType(value),
    year: (value) => {
      const parsed = parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : null
    },
  },

  // The moderation diff is text, so the member is rendered as its label.
  formatForDisplay: {
    bodyType: (value) => bodyTypeLabel(value as never) ?? '',
  },

  getResourceName: (camera) => camera.name,
  getResourceBrand: (camera) => camera.brand
})

export { POST, DELETE }
