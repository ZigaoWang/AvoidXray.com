import { prisma } from '@/lib/db'
import { createImageRouteHandler } from '@/lib/api/createImageRouteHandler'
import { canEditFilmStock, canDeleteFilmStockImage } from '@/lib/permissions'
import { validateISO } from '@/lib/validation'
import type { FilmStock } from '@prisma/client'

const { POST, DELETE } = createImageRouteHandler<FilmStock>({
  resourceType: 'filmstock',
  resourceDisplayName: 'Film Stock',

  findResource: (id: string) =>
    prisma.filmStock.findUnique({ where: { id } }),

  updateResource: (id: string, data: any) =>
    prisma.filmStock.update({
      where: { id },
      data
    }),

  canEdit: canEditFilmStock,
  canDelete: canDeleteFilmStockImage,

  validators: {
    iso: validateISO
  },

  categorizationFields: ['filmType', 'format', 'process', 'exposures', 'iso'],

  getResourceName: (filmStock) => filmStock.name,
  getResourceBrand: (filmStock) => filmStock.brand
})

export { POST, DELETE }
