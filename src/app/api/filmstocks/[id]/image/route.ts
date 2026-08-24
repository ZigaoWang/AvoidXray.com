import { prisma } from '@/lib/db'
import { createImageRouteHandler } from '@/lib/api/createImageRouteHandler'
import { canEditFilmStock, canDeleteFilmStockImage } from '@/lib/permissions'
import { validateISO } from '@/lib/validation'
import {
  colorBalanceLabel,
  filmProcessLabel,
  normalizeAliases,
  normalizeManufacturer,
  toColorBalance,
  toFilmProcess,
} from '@/lib/filmFields'
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

  categorizationFields: [
    'filmType',
    'format',
    'process',
    'colorBalance',
    'manufacturer',
    'aliases',
    'exposures',
    'iso',
  ],

  coerce: {
    iso: (value) => {
      const parsed = parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : null
    },
    // The form is single-select; the column is multi-valued.
    format: (value) => [value],
    // Return null for anything not in the enum, which the handler turns into a
    // 400 rather than letting Prisma reject it as a 500.
    process: (value) => toFilmProcess(value),
    colorBalance: (value) => toColorBalance(value),
    manufacturer: (value) => normalizeManufacturer(value) || null,
    aliases: (value) => normalizeAliases(value.split(',')),
  },

  formatForDisplay: {
    format: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
    aliases: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
    process: (value) => filmProcessLabel(value as never) ?? '',
    colorBalance: (value) => colorBalanceLabel(value as never) ?? '',
  },

  getResourceName: (filmStock) => filmStock.name,
  getResourceBrand: (filmStock) => filmStock.brand
})

export { POST, DELETE }
