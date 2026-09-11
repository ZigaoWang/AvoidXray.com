import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createImageRouteHandler, type ResourceUpdate } from '@/lib/api/createImageRouteHandler'
import { canDeleteCameraImage } from '@/lib/permissions'
import { validateYear } from '@/lib/validation'
import type { Camera } from '@prisma/client'
import { bodyTypeLabel } from '@/lib/cameraFields'

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

  // The two rules a FieldSpec cannot state. A year inside 1800-2100 can still
  // be in the future, which is the one thing this catches that the range on
  // the spec does not; lengths, ranges and enum members are checked against
  // the declaration itself, and were restated here until they drifted.
  validators: {
    year: validateYear,
  },

  // The moderation diff is text, so the member is rendered as its label.
  formatForDisplay: {
    aliases: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
    bodyType: (value) => bodyTypeLabel(value as never) ?? '',
  },

  getResourceName: (camera) => camera.name,
  getResourceBrand: (camera) => camera.brand
})

export { POST, DELETE }
