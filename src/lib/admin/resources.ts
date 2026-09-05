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
  /**
   * Shortest accepted string, for the columns the database also constrains.
   *
   * Without it a value the column refuses passes the form, reaches Postgres and
   * comes back as a constraint violation rather than as a message against the
   * field somebody typed in.
   */
  minLength?: number
  min?: number
  max?: number
  help?: string
  /** For `reference`: the list to choose from. */
  source?: ReferenceSource
}

/** A one-click action offered on a row, applied as a normal field update. */
export interface QuickAction {
  label: string
  /** The change this applies. */
  patch: Record<string, unknown>
  /** Only offered when the row matches; keeps "Resolve" off a resolved row. */
  when?: (row: Record<string, unknown>) => boolean
  tone?: 'primary' | 'muted'
}

/**
 * A one-click action applied to every selected row at once.
 *
 * Separate from QuickAction because a selection has no single row to test, so
 * `when` has nothing to run against: a bulk action is always offered and the
 * rows it would not change simply do not change.
 */
export interface BulkAction {
  label: string
  patch: Record<string, unknown>
  tone?: 'primary' | 'muted'
  /** Asked before it runs, for the ones that are hard to undo by hand. */
  confirm?: string
}

/**
 * A link offered on a row, for the things that are a navigation rather than a
 * field change — which QuickAction, being a patch, cannot express.
 */
export interface RowLink {
  label: string
  /** Built from the row, e.g. `row => \`/upload?asUserId=${row.id}\`` */
  href: (row: Record<string, unknown>) => string
  /** Spelled out for the tooltip and the accessible name. */
  title: string
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
  /**
   * Actions worth doing without opening the record.
   *
   * A queue is triage: the common case is one decision per row, and making
   * that a modal and a dropdown turns a minute of work into several.
   */
  quickActions?: readonly QuickAction[]
  /**
   * Presets offered on a selection, alongside the always-available bulk edit
   * and bulk delete. A roll is thirty-six frames that get published together;
   * the one-at-a-time table made that thirty-six round trips through a modal.
   */
  bulkActions?: readonly BulkAction[]
  /** Links offered on a row, shown before the quick actions. */
  rowLinks?: readonly RowLink[]
}

/**
 * How a stored code should read to a person.
 *
 * The database keeps enum members like `C41` and `NOT_FILM` because that is
 * what the column accepts, but a table that prints them raw makes an
 * administrator translate on every glance. Keyed by column so the table and
 * the edit form show the same words.
 */
export const VALUE_LABELS: Record<string, Record<string, string>> = {
  process: { C41: 'C-41', E6: 'E-6', ECN2: 'ECN-2', BW: 'Black & white', OTHER: 'Other' },
  colorBalance: { DAYLIGHT: 'Daylight', TUNGSTEN: 'Tungsten', NA: 'N/A' },
  visibility: { PUBLIC: 'Public', PRIVATE: 'Private' },
  imageStatus: { none: 'No image', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' },
  status: { OPEN: 'Open', RESOLVED: 'Resolved', DISMISSED: 'Dismissed' },
  reason: {
    SPAM: 'Spam or advertising',
    NOT_FILM: 'Not a film photograph',
    INAPPROPRIATE: 'Inappropriate content',
    HARASSMENT: 'Harassment or abuse',
    COPYRIGHT: "Someone else's work",
    OTHER: 'Something else',
  },
  target: { photo: 'Photo', comment: 'Comment', user: 'User', note: 'Community note' },
  bodyType: {
    SLR: 'SLR', RANGEFINDER: 'Rangefinder', COMPACT: 'Point & shoot', TLR: 'TLR',
    FOLDING: 'Folding', VIEW: 'View camera', INSTANT: 'Instant', DISPOSABLE: 'Disposable',
  },
  frameFormat: {
    FULL_FRAME: 'Full frame', HALF_FRAME: 'Half-frame',
    PANORAMIC: 'Panoramic', SPROCKET_HOLE: 'Sprocket hole',
  },
  targetType: { camera: 'Camera', filmstock: 'Film stock' },
}

/** The readable form of a stored value, or the value itself. */
export function displayValue(column: string, value: unknown): string {
  if (typeof value !== 'string') return String(value)
  return VALUE_LABELS[column]?.[value] ?? value
}

const FILM_PROCESS = ['C41', 'E6', 'ECN2', 'BW', 'OTHER'] as const
const COLOR_BALANCE = ['DAYLIGHT', 'TUNGSTEN', 'NA'] as const
const VISIBILITY = ['PUBLIC', 'PRIVATE'] as const
const IMAGE_STATUS = ['none', 'pending', 'approved', 'rejected'] as const
const CAMERA_BODY_TYPES = ['SLR', 'RANGEFINDER', 'COMPACT', 'TLR', 'FOLDING', 'VIEW', 'INSTANT', 'DISPOSABLE'] as const
const FRAME_FORMAT_VALUES = ['FULL_FRAME', 'HALF_FRAME', 'PANORAMIC', 'SPROCKET_HOLE'] as const

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
    /*
      Uploading into someone else's account.

      /api/upload has always accepted asUserId from an administrator, and the
      upload page has always read it, but the only way in was a per-row link on
      the old bespoke user table. Rebuilding this section on the generic
      ResourceTable dropped that link and left the feature reachable only by
      typing the URL.
    */
    rowLinks: [
      {
        label: 'Upload',
        href: (row) => `/upload?asUserId=${row.id}`,
        title: 'Upload photos into this account',
      },
    ],
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
    bulkActions: [
      { label: 'Publish', patch: { published: true }, tone: 'primary' },
      {
        label: 'Unpublish',
        patch: { published: false },
        // Worth stopping for: the hourly cleanup deletes unpublished photos and
        // their files, so this is a delayed delete rather than a hidden state.
        confirm: 'Unpublished photos are deleted an hour after they were uploaded. Continue?',
      },
      { label: 'Make public', patch: { visibility: 'PUBLIC' } },
      { label: 'Make private', patch: { visibility: 'PRIVATE' } },
    ],
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
    columns: ['name', 'brand', 'bodyType', 'format', 'year', 'photoCount', 'imageStatus'],
    searchFields: ['name', 'brand', 'mountType'],
    orderBy: { name: 'asc' },
    deletable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 120 },
      brand: { kind: 'text', label: 'Brand', maxLength: 60 },
      bodyType: { kind: 'enum', label: 'Body type', options: CAMERA_BODY_TYPES, help: 'The mechanism. Leave unset if none of these fit.' },
      frameFormat: { kind: 'enum', label: 'Frame format', options: FRAME_FORMAT_VALUES, help: 'Native frame geometry. Unset until checked.' },
      format: { kind: 'text', label: 'Format', maxLength: 60 },
      mountType: { kind: 'text', label: 'Mount', maxLength: 60 },
      aliases: { kind: 'stringList', label: 'Also known as', help: 'Comma separated. Names this body is sold under in other markets.' },
      year: { kind: 'number', label: 'Year', min: 1800, max: 2100 },
      // Offered by the suggest-edit form, so it has to be writable here: this
      // list is the allowlist every write path checks against, and a field
      // missing from it is discarded without a word.
      defaultFilmStockId: { kind: 'reference', label: 'Default film stock', source: 'films', help: 'For fixed-stock bodies such as disposables. Leave blank otherwise.' },
      summary: { kind: 'longtext', label: 'Summary', minLength: 20, maxLength: 200, help: 'One or two sentences answering what this is. Between 20 and 200 characters.' },
      description: { kind: 'longtext', label: 'Description', maxLength: 4000 },
      imageStatus: { kind: 'enum', label: 'Image status', options: IMAGE_STATUS },
    },
  },

  films: {
    label: 'Film stock',
    plural: 'Film stocks',
    description: 'The film catalogue. Process is required by the schema.',
    columns: ['name', 'madeBy', 'iso', 'process', 'colorBalance', 'sources', 'photoCount', 'imageStatus'],
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
      // A stock can be sold in more than one gauge, so this column is a list.
      format: { kind: 'stringList', label: 'Format', help: 'Comma separated. 35mm, 120, sheet sizes.' },
      exposures: { kind: 'text', label: 'Exposures', maxLength: 40 },
      summary: { kind: 'longtext', label: 'Summary', minLength: 20, maxLength: 200, help: 'One or two sentences answering what this is. Between 20 and 200 characters.' },
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
    bulkActions: [
      { label: 'Feature', patch: { featured: true }, tone: 'primary' },
      { label: 'Unfeature', patch: { featured: false } },
      { label: 'Make public', patch: { public: true } },
      { label: 'Make private', patch: { public: false } },
    ],
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
    quickActions: [
      { label: 'Resolve', patch: { status: 'RESOLVED' }, when: r => r.status === 'OPEN', tone: 'primary' },
      { label: 'Dismiss', patch: { status: 'DISMISSED' }, when: r => r.status === 'OPEN', tone: 'muted' },
      { label: 'Reopen', patch: { status: 'OPEN' }, when: r => r.status !== 'OPEN', tone: 'muted' },
    ],
    bulkActions: [
      { label: 'Resolve', patch: { status: 'RESOLVED' }, tone: 'primary' },
      { label: 'Dismiss', patch: { status: 'DISMISSED' } },
      { label: 'Reopen', patch: { status: 'OPEN' } },
    ],
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

/**
 * Fields that are unique per record, and so cannot be written across a
 * selection: `updateMany` would give every row the same value and fail on the
 * index partway through.
 *
 * Declared here rather than in the repository so the bulk form does not offer a
 * field the server is going to refuse.
 */
export const UNIQUE_FIELDS: Partial<Record<ResourceName, readonly string[]>> = {
  users: ['username'],
  // A stock's name is unique and a camera's is unique per owner, and both
  // derive the URL — so a batch rename is either a constraint violation or a
  // pile of records all trying to move to the same slug.
  films: ['name'],
  cameras: ['name'],
}

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
      // Checked here so the column's own CHECK is never what refuses it. A
      // constraint violation surfaces as a failed request with no field
      // attached, which reads as the site being broken rather than as the
      // value being too short.
      if (spec.minLength && text.length > 0 && text.length < spec.minLength) {
        return { error: `${spec.label} must be at least ${spec.minLength} characters` }
      }
      return { value: text.length > 0 ? text : null }
    }
  }
}
