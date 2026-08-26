import { Prisma } from '@prisma/client'

/**
 * What the admin area can manage, defined once.
 *
 * The admin page previously loaded every user, every published photo and every
 * camera in full on a single request, and could only delete things or rename a
 * camera. Anything else meant opening the database by hand. This describes each
 * resource in one place — what it lists, what can be searched, and crucially
 * which fields may be written — so a new section is a config entry rather than
 * another bespoke page and another bespoke endpoint.
 *
 * The editable allowlist is the security boundary. A generic update endpoint
 * that took whatever JSON it was given would let an admin session write
 * `passwordHash` or flip `userId` on someone else's photo; only the fields
 * named here are ever passed to Prisma.
 */

export type FieldKind =
  | 'text' | 'longtext' | 'number' | 'boolean' | 'date' | 'enum' | 'stringList'
  /** A pointer to another record, chosen by name rather than typed as an id. */
  | 'reference'

/** Which catalogue a `reference` field picks from. */
export type ReferenceSource = 'cameras' | 'films'

export interface FieldSpec {
  kind: FieldKind
  label: string
  /** Allowed values, for `enum`. */
  options?: readonly string[]
  /** Longest accepted string. Unbounded text is how a single row becomes a problem. */
  maxLength?: number
  min?: number
  max?: number
  help?: string
  /** For `reference`: the list to choose from. */
  source?: ReferenceSource
}

export interface ResourceSpec {
  label: string
  /** Plural noun for empty states and counts. */
  plural: string
  /** Columns shown in the table, in order. */
  columns: readonly string[]
  /** Fields matched by the search box, all case-insensitive `contains`. */
  searchFields: readonly string[]
  /** Fields an admin may write, and how each is validated. */
  editable: Record<string, FieldSpec>
  /** Default ordering. */
  orderBy: Record<string, 'asc' | 'desc'>
  /** Whether rows can be removed from this section. */
  deletable: boolean
  /** Shown above the table. */
  description: string
}

const FILM_PROCESS = ['C41', 'E6', 'ECN2', 'BW', 'OTHER'] as const
const COLOR_BALANCE = ['DAYLIGHT', 'TUNGSTEN', 'NA'] as const
const VISIBILITY = ['PUBLIC', 'PRIVATE'] as const
const IMAGE_STATUS = ['none', 'pending', 'approved', 'rejected'] as const

export const ADMIN_RESOURCES = {
  users: {
    label: 'User',
    plural: 'Users',
    description: 'Accounts, their roles and verification state.',
    columns: ['username', 'name', 'email', 'isAdmin', 'emailVerified', 'photoCount', 'createdAt'],
    searchFields: ['username', 'name', 'email'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      username: { kind: 'text', label: 'Username', maxLength: 20, help: 'Letters, numbers, underscore and hyphen only.' },
      name: { kind: 'text', label: 'Display name', maxLength: 80 },
      bio: { kind: 'longtext', label: 'Bio', maxLength: 500 },
      website: { kind: 'text', label: 'Website', maxLength: 200, help: 'Must be http(s); anything else is rejected.' },
      instagram: { kind: 'text', label: 'Instagram', maxLength: 30 },
      twitter: { kind: 'text', label: 'X / Twitter', maxLength: 30 },
      isAdmin: { kind: 'boolean', label: 'Administrator' },
      emailVerified: { kind: 'boolean', label: 'Email verified', help: 'Turn on to let someone in without the email round trip.' },
    },
  },

  photos: {
    label: 'Photo',
    plural: 'Photos',
    description: 'Every uploaded frame, including unpublished drafts.',
    columns: ['thumbnail', 'caption', 'owner', 'camera', 'filmStock', 'visibility', 'published', 'createdAt'],
    searchFields: ['caption'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      caption: { kind: 'longtext', label: 'Caption', maxLength: 2000 },
      // Chosen from a list. These were free-text fields asking for a cuid,
      // which meant looking one up elsewhere and pasting it in to change a
      // photo's camera.
      cameraId: { kind: 'reference', label: 'Camera', source: 'cameras', help: 'Leave blank to unset.' },
      filmStockId: { kind: 'reference', label: 'Film stock', source: 'films', help: 'Leave blank to unset.' },
      takenDate: { kind: 'date', label: 'Date taken' },
      visibility: { kind: 'enum', label: 'Visibility', options: VISIBILITY },
      published: { kind: 'boolean', label: 'Published', help: 'Unpublished photos are deleted an hour after upload.' },
    },
  },

  comments: {
    label: 'Comment',
    plural: 'Comments',
    description: 'Comments left on photos.',
    columns: ['photoThumb', 'content', 'author', 'photo', 'createdAt'],
    searchFields: ['content'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      content: { kind: 'longtext', label: 'Content', maxLength: 2000 },
    },
  },

  cameras: {
    label: 'Camera',
    plural: 'Cameras',
    description: 'The camera catalogue. Edits here apply immediately.',
    columns: ['name', 'brand', 'cameraType', 'format', 'year', 'photoCount', 'imageStatus'],
    searchFields: ['name', 'brand', 'mountType'],
    orderBy: { name: 'asc' },
    deletable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 120 },
      brand: { kind: 'text', label: 'Brand', maxLength: 60 },
      cameraType: { kind: 'text', label: 'Type', maxLength: 60, help: 'SLR, Rangefinder, Point & Shoot…' },
      format: { kind: 'text', label: 'Format', maxLength: 60 },
      mountType: { kind: 'text', label: 'Mount', maxLength: 60 },
      year: { kind: 'number', label: 'Year', min: 1800, max: 2100 },
      description: { kind: 'longtext', label: 'Description', maxLength: 4000 },
      imageStatus: { kind: 'enum', label: 'Image status', options: IMAGE_STATUS },
    },
  },

  films: {
    label: 'Film stock',
    plural: 'Film stocks',
    description: 'The film catalogue. Process is required by the schema.',
    columns: ['name', 'manufacturer', 'iso', 'process', 'colorBalance', 'photoCount', 'imageStatus'],
    searchFields: ['name', 'brand', 'manufacturer'],
    orderBy: { name: 'asc' },
    deletable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 120 },
      manufacturer: { kind: 'text', label: 'Manufacturer', maxLength: 60 },
      brand: { kind: 'text', label: 'Brand (legacy)', maxLength: 60 },
      aliases: { kind: 'stringList', label: 'Aliases', help: 'Comma separated. Product codes and alternate names.' },
      iso: { kind: 'number', label: 'ISO', min: 1, max: 100000 },
      process: { kind: 'enum', label: 'Process', options: FILM_PROCESS },
      colorBalance: { kind: 'enum', label: 'Colour balance', options: COLOR_BALANCE },
      filmType: { kind: 'text', label: 'Type', maxLength: 60 },
      exposures: { kind: 'text', label: 'Exposures', maxLength: 40 },
      description: { kind: 'longtext', label: 'Description', maxLength: 4000 },
      imageStatus: { kind: 'enum', label: 'Image status', options: IMAGE_STATUS },
    },
  },

  albums: {
    label: 'Album',
    plural: 'Albums',
    description: 'Collections. Featured albums surface on the home page.',
    columns: ['name', 'owner', 'public', 'featured', 'photoCount', 'createdAt'],
    searchFields: ['name', 'description'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 120 },
      description: { kind: 'longtext', label: 'Description', maxLength: 2000 },
      public: { kind: 'boolean', label: 'Public' },
      featured: { kind: 'boolean', label: 'Featured' },
    },
  },

  reports: {
    label: 'Report',
    plural: 'Reports',
    description: 'Content flagged by readers. Resolve or dismiss each one.',
    columns: ['target', 'reason', 'summary', 'reporter', 'status', 'createdAt'],
    searchFields: ['detail'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      status: { kind: 'enum', label: 'Status', options: ['OPEN', 'RESOLVED', 'DISMISSED'] },
      reviewNote: { kind: 'longtext', label: 'Review note', maxLength: 1000, help: 'For your own record; the reporter does not see it.' },
    },
  },

  notes: {
    label: 'Community note',
    plural: 'Community notes',
    description: 'Notes left on cameras and film stocks.',
    columns: ['content', 'author', 'about', 'votes', 'createdAt'],
    searchFields: ['content'],
    orderBy: { createdAt: 'desc' },
    deletable: true,
    editable: {
      content: { kind: 'longtext', label: 'Content', maxLength: 2000 },
    },
  },
} as const satisfies Record<string, ResourceSpec>

export type ResourceName = keyof typeof ADMIN_RESOURCES

export function isResourceName(value: string): value is ResourceName {
  return Object.prototype.hasOwnProperty.call(ADMIN_RESOURCES, value)
}

export const RESOURCE_ORDER: readonly ResourceName[] = [
  'reports', 'photos', 'users', 'comments', 'cameras', 'films', 'albums', 'notes',
]

/**
 * Turns one submitted value into something the column accepts, or reports why
 * it cannot. Returning a message rather than throwing keeps the failure
 * attached to the field the admin actually typed in.
 */
export function coerceField(spec: FieldSpec, raw: unknown): { value: Prisma.InputJsonValue | string | number | boolean | Date | string[] | null } | { error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null }
  }

  switch (spec.kind) {
    case 'boolean':
      if (typeof raw !== 'boolean') return { error: `${spec.label} must be true or false` }
      return { value: raw }

    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(n)) return { error: `${spec.label} must be a number` }
      if (spec.min !== undefined && n < spec.min) return { error: `${spec.label} must be at least ${spec.min}` }
      if (spec.max !== undefined && n > spec.max) return { error: `${spec.label} must be at most ${spec.max}` }
      return { value: Math.trunc(n) }
    }

    case 'date': {
      const text = String(raw).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: `${spec.label} must be YYYY-MM-DD` }
      const date = new Date(`${text}T00:00:00.000Z`)
      if (Number.isNaN(date.getTime())) return { error: `${spec.label} is not a real date` }
      return { value: date }
    }

    case 'enum': {
      const text = String(raw)
      if (!spec.options?.includes(text)) {
        return { error: `${spec.label} must be one of: ${spec.options?.join(', ')}` }
      }
      return { value: text }
    }

    case 'stringList': {
      const items = String(raw).split(',').map(s => s.trim()).filter(Boolean)
      if (items.some(s => s.length > 80)) return { error: `${spec.label} entries must be under 80 characters` }
      return { value: items }
    }

    case 'reference': {
      // Stored as an id; the form supplies one from a list, and the repository
      // verifies it exists before writing.
      const id = String(raw).trim()
      return { value: id || null }
    }

    case 'text':
    case 'longtext':
    default: {
      const text = String(raw).trim()
      if (spec.maxLength && text.length > spec.maxLength) {
        return { error: `${spec.label} must be ${spec.maxLength} characters or fewer` }
      }
      return { value: text.length > 0 ? text : null }
    }
  }
}
