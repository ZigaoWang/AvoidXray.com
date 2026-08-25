import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createImageRouteHandler, type ResourceUpdate } from '@/lib/api/createImageRouteHandler'
import { canDeleteCameraImage } from '@/lib/permissions'
import { validateYear } from '@/lib/validation'
import type { Camera } from '@prisma/client'

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

  validators: {
    year: validateYear
  },

  categorizationFields: ['cameraType', 'format', 'mountType', 'year', 'defaultFilmStockId'],

  getResourceName: (camera) => camera.name,
  getResourceBrand: (camera) => camera.brand
})

export { POST, DELETE }
