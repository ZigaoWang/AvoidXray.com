import { prisma } from '@/lib/db'
import { createImageRouteHandler } from '@/lib/api/createImageRouteHandler'
import { canEditCamera, canDeleteCameraImage } from '@/lib/permissions'
import { validateYear } from '@/lib/validation'
import type { Camera } from '@prisma/client'

const { POST, DELETE } = createImageRouteHandler<Camera>({
  resourceType: 'camera',
  resourceDisplayName: 'Camera',

  findResource: (id: string) =>
    prisma.camera.findUnique({ where: { id } }),

  updateResource: (id: string, data: any) =>
    prisma.camera.update({
      where: { id },
      data
    }),

  canEdit: canEditCamera,
  canDelete: canDeleteCameraImage,

  validators: {
    year: validateYear
  },

  categorizationFields: ['cameraType', 'format', 'mountType', 'year'],

  getResourceName: (camera) => camera.name,
  getResourceBrand: (camera) => camera.brand
})

export { POST, DELETE }
