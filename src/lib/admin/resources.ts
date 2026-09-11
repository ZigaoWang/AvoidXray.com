import type { Prisma } from '@prisma/client'
import {
  BODY_TYPE_LABELS,
  EXPOSURE_MODE_LABELS,
  FLASH_LABELS,
  FOCUS_TYPE_LABELS,
  FRAME_FORMAT_LABELS,
  METERING_LABELS,
  SHUTTER_TYPE_LABELS,
} from '@/lib/cameraFields'
import { BALANCE_TO_LABEL, BASE_LABELS, PROCESS_TO_LABEL } from '@/lib/filmFields'

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
  /** Several members of an enum at once, as `exposureModes` needs. */
  | 'enumList'
  /** A pointer to another record, chosen by name rather than typed as an id. */
  | 'reference'

/** Which catalog a `reference` field picks from. */
export type ReferenceSource = 'cameras' | 'films' | 'brands'

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
  /**
   * Keep the fractional part.
   *
   * `number` truncates, which is right for a year and an ISO and silently
   * wrong for an aperture: f/3.6 would be stored as f/3, and 1/1200 of a
   * second as zero.
   */
  decimal?: boolean
  help?: string
  /** For `reference`: the list to choose from. */
  source?: ReferenceSource
  /** Only enforced when creating a record. An edit may leave it as it was. */
  required?: boolean
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
  /** Whether a new row can be added from the table, not just edited. */
  creatable?: boolean
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
  // Imported, not re-typed. These were written out a second time here and had
  // already drifted: admin called FilmProcess.BW "Black & white" while the film
  // page and the picker called it "B&W", so two screens disagreed about the
  // same stored value. Adding a member to the schema is now a type error here
  // rather than a dropdown that prints the identifier.
  process: PROCESS_TO_LABEL,
  colorBalance: BALANCE_TO_LABEL,
  bodyType: BODY_TYPE_LABELS,
  frameFormat: FRAME_FORMAT_LABELS,
  focusType: FOCUS_TYPE_LABELS,
  meteringPattern: METERING_LABELS,
  exposureModes: EXPOSURE_MODE_LABELS,
  shutterType: SHUTTER_TYPE_LABELS,
  flash: FLASH_LABELS,
  baseMaterial: BASE_LABELS,
  chromaticity: { COLOR: 'Color', MONOCHROME: 'Monochrome' },
  polarity: { NEGATIVE: 'Negative', POSITIVE: 'Positive', DIRECT_POSITIVE: 'Direct positive' },
  manufacturerStatus: {
    SAME_AS_BRAND: 'The brand itself', KNOWN: 'Confirmed', ATTRIBUTED: 'Reported', UNKNOWN: 'Not established',
  },
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
// The members themselves, from the label maps, so a dropdown cannot offer a
// value the labels do not cover or omit one they do.
const CAMERA_BODY_TYPES = Object.keys(BODY_TYPE_LABELS)
const FRAME_FORMAT_VALUES = Object.keys(FRAME_FORMAT_LABELS)
const FOCUS_TYPES = Object.keys(FOCUS_TYPE_LABELS)
const METERING_PATTERNS = Object.keys(METERING_LABELS)
const EXPOSURE_MODES = Object.keys(EXPOSURE_MODE_LABELS)
const SHUTTER_TYPES = Object.keys(SHUTTER_TYPE_LABELS)
const FLASH_FITTINGS = Object.keys(FLASH_LABELS)
const FILM_BASES = Object.keys(BASE_LABELS)
const CHROMATICITY = ['COLOR', 'MONOCHROME'] as const
const POLARITY = ['NEGATIVE', 'POSITIVE', 'DIRECT_POSITIVE'] as const
const MANUFACTURER_STATUS = ['SAME_AS_BRAND', 'KNOWN', 'ATTRIBUTED', 'UNKNOWN'] as const

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
    description: 'The camera catalog. Edits here apply immediately.',
    columns: ['name', 'brand', 'bodyType', 'format', 'year', 'photoCount', 'imageStatus'],
    searchFields: ['name', 'brand'],
    orderBy: { name: 'asc' },
    deletable: true,
    editable: {
      // Required, so an emptied name is refused rather than written: it is
      // what the record is called and what its URL is built from. Both write
      // paths read this flag, which is why it is here and not in either of
      // them.
      name: { kind: 'text', label: 'Name', maxLength: 120, required: true },
      brand: { kind: 'text', label: 'Brand', maxLength: 60, help: 'Who made the body. This is what the catalog groups and filters by.' },
      bodyType: { kind: 'enum', label: 'Body type', options: CAMERA_BODY_TYPES, help: 'The mechanism. Leave unset if none of these fit.' },
      frameFormat: { kind: 'enum', label: 'Frame format', options: FRAME_FORMAT_VALUES, help: 'Native frame geometry. Almost every 35mm camera is full frame; a panorama switch is a mask over one, not a wider frame.' },
      format: { kind: 'text', label: 'Format', maxLength: 60 },
      aliases: { kind: 'stringList', label: 'Also known as', help: 'Comma separated. Names this body is sold under in other markets.' },
      year: { kind: 'number', label: 'Year', min: 1800, max: 2100 },
      lensName: { kind: 'text', label: 'Lens name', maxLength: 60, help: 'The name on the barrel: G.Zuiko, Hexanon, Fujinon.' },
      focalMinMm: { kind: 'number', label: 'Focal length, wide', min: 6, max: 2000, help: 'In millimetres. A prime takes the same number in both.' },
      focalMaxMm: { kind: 'number', label: 'Focal length, long', min: 6, max: 2000 },
      apertureMaxWide: { kind: 'number', label: 'Max aperture, wide', min: 0.7, max: 45, decimal: true, help: 'The f-number, so 2.8 for f/2.8.' },
      apertureMaxTele: { kind: 'number', label: 'Max aperture, long', min: 0.7, max: 45, decimal: true },
      lensElements: { kind: 'number', label: 'Elements', min: 1, max: 30 },
      lensGroups: { kind: 'number', label: 'Groups', min: 1, max: 30 },
      closeFocusMm: { kind: 'number', label: 'Closest focus', min: 10, max: 20000, help: 'In millimetres, so 600 for 0.6m.' },
      focusType: { kind: 'enum', label: 'Focusing', options: FOCUS_TYPES },
      // "No meter" is a recorded answer and unset is not, so the two must not
      // read alike wherever this is offered.
      meteringPattern: { kind: 'enum', label: 'Metering', options: METERING_PATTERNS, help: 'No meter is an answer about the body. Leave it unset if you do not know.' },
      exposureModes: { kind: 'enumList', label: 'Exposure modes', options: EXPOSURE_MODES, help: 'Everything the body offers, not just the one you use.' },
      shutterType: { kind: 'enum', label: 'Shutter', options: SHUTTER_TYPES },
      shutterSlowestSec: { kind: 'number', label: 'Slowest shutter', min: 0.000001, max: 3600, decimal: true, help: 'In seconds. 8 for eight seconds.' },
      shutterFastestSec: { kind: 'number', label: 'Fastest shutter', min: 0.000001, max: 3600, decimal: true, help: 'In seconds. 1/1200 is 0.000833.' },
      filmSpeedMin: { kind: 'number', label: 'Film speed, min', min: 1, max: 100000, help: 'The range the meter can be set to. The page prints it only when both ends are recorded.' },
      filmSpeedMax: { kind: 'number', label: 'Film speed, max', min: 1, max: 100000 },
      flash: { kind: 'enum', label: 'Flash', options: FLASH_FITTINGS, help: 'None means the body has neither a flash nor a shoe to put one on.' },
      batteryType: { kind: 'text', label: 'Battery', maxLength: 40, help: 'As it is sold: CR123A, PX625, AA.' },
      weightGrams: { kind: 'number', label: 'Weight', min: 1, max: 20000, help: 'In grams, without film or battery where that is what the maker quotes.' },
      // Offered by the suggest-edit form, so it has to be writable here: this
      // list is the allowlist every write path checks against, and a field
      // missing from it is discarded without a word.
      defaultFilmStockId: { kind: 'reference', label: 'Default film stock', source: 'films', help: 'For fixed-stock bodies such as disposables. Leave blank otherwise.' },
      description: { kind: 'longtext', label: 'Description', maxLength: 4000 },
      imageStatus: { kind: 'enum', label: 'Image status', options: IMAGE_STATUS },
    },
  },

  films: {
    label: 'Film stock',
    plural: 'Film stocks',
    description: 'The film catalog. Process is required by the schema.',
    columns: ['name', 'madeBy', 'iso', 'process', 'colorBalance', 'sources', 'photoCount', 'imageStatus'],
    searchFields: ['name', 'brand', 'manufacturer'],
    orderBy: { name: 'asc' },
    deletable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 120, required: true },
      /*
        The name on the box, not the coater.

        This column feeds `displayName`, so it is what titles the page, and
        the create route resolves `brandId` from it — the relation the whole
        manufacturer row is compared against. Approving an edit to it now does
        the same, so the two can no longer disagree. It was labeled
        "Manufacturer" here and in the contributor form while the page's own
        Manufacturer row was built from the two fields below, which meant
        somebody correctly naming the coater retitled the stock after it.
      */
      manufacturer: { kind: 'text', label: 'Brand on the box', maxLength: 60, help: 'The name the stock is sold under, which is what titles the page. Who coats it goes under Maker is / Made by.' },
      brand: { kind: 'text', label: 'Brand (legacy)', maxLength: 60 },
      aliases: { kind: 'stringList', label: 'Aliases', help: 'Comma separated. Product codes and alternate names.' },
      iso: { kind: 'number', label: 'ISO', min: 1, max: 100000 },
      rmsGranularity: { kind: 'number', label: 'RMS granularity', min: 1, max: 100, help: 'The grain figure from the datasheet. Lower is finer.' },
      resolvingPowerLpmm: { kind: 'number', label: 'Resolving power', min: 1, max: 1000, help: 'Lines per millimetre, at the contrast the maker quotes.' },
      baseMaterial: { kind: 'enum', label: 'Base', options: FILM_BASES },
      hasRemjet: { kind: 'boolean', label: 'Remjet backing', help: 'A stock with remjet cannot go through an ordinary C-41 lab. Leave it unset rather than guessing.' },
      parentStockId: { kind: 'reference', label: 'Respooled from', source: 'films', help: 'The stock this is repackaged from, e.g. CineStill 800T from Kodak Vision3 500T. Leave blank for an original stock.' },
      respoolNotes: { kind: 'longtext', label: 'Respool notes', maxLength: 300, help: 'What changed in the respool, in a sentence or two. Shown under "Respooled from" on the public page.' },
      latitudeUnderStops: { kind: 'number', label: 'Latitude under', min: 0, max: 10, help: 'Stops of underexposure the maker claims it tolerates.' },
      latitudeOverStops: { kind: 'number', label: 'Latitude over', min: 0, max: 10, help: 'Stops of overexposure, the other way.' },
      process: { kind: 'enum', label: 'Process', options: FILM_PROCESS, help: 'How it is developed. It is on the box.' },
      colorBalance: { kind: 'enum', label: 'Color balance', options: COLOR_BALANCE },
      chromaticity: { kind: 'enum', label: 'Color or mono', options: CHROMATICITY, help: 'Independent of process: XP2 Super is black and white developed in C-41.' },
      polarity: { kind: 'enum', label: 'Negative or positive', options: POLARITY, help: 'Slide film is positive. Instant film is direct positive.' },
      // What the page actually renders for "made by". The legacy `manufacturer`
      // text column above is not it, so without these two the displayed claim
      // was the one field an admin could not correct.
      manufacturerStatus: { kind: 'enum', label: 'Maker is', options: MANUFACTURER_STATUS, help: 'Confirmed needs a source stating it outright. Reported is widely said but unconfirmed, and is the honest answer more often. If the brand coats its own film, say so and leave Made by empty.' },
      manufacturedByBrandId: { kind: 'reference', label: 'Made by', source: 'brands', help: 'The company that coats it, which is never the brand on the box — that is what "The brand itself" means. Needed for Confirmed and Reported, empty for the other two.' },
      // A stock can be sold in more than one gauge, so this column is a list.
      format: { kind: 'stringList', label: 'Format', help: 'Comma separated. 35mm, 120, sheet sizes.' },
      // Frames per roll is deliberately absent. It belongs to a format, not to
      // a stock, and FilmVariant already carries it and renders it as the
      // "Sold in" line. See FilmDetailSource in src/lib/filmFields.ts.
      description: { kind: 'longtext', label: 'Description', maxLength: 4000 },
      imageStatus: { kind: 'enum', label: 'Image status', options: IMAGE_STATUS },
    },
  },

  brands: {
    label: 'Brand',
    plural: 'Brands',
    description:
      'The makers a camera or film stock can point at. One list, because a company like Kodak really does make both. ' +
      'Films sold is what carries the name on the box; films made is what it coats for somebody else.',
    columns: ['name', 'aliases', 'cameras', 'filmsSold', 'filmsMade'],
    searchFields: ['name'],
    orderBy: { name: 'asc' },
    deletable: true,
    creatable: true,
    editable: {
      name: { kind: 'text', label: 'Name', maxLength: 60, required: true },
      aliases: { kind: 'stringList', label: 'Also known as', help: 'Comma separated. Other spellings and corporate names, e.g. "Yestar" for Yes!Star.' },
      description: { kind: 'longtext', label: 'Description', maxLength: 500 },
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
 * How a resource's editable fields are grouped in the edit form.
 *
 * Cameras and films are the only sections with enough fields to need this —
 * everything else has three or four and reads fine as one block. The titles
 * here are the same ones `specs.ts` uses for the public spec table, on
 * purpose: the "Lens" section you'd open here is the "Lens" group you just
 * read on the live page.
 *
 * A field on the resource but missing from every group here still renders —
 * `EditRecordModal` collects the leftovers into a final unlabeled group
 * rather than dropping them, so forgetting to place a newly added field loses
 * nothing, it just shows up unsorted until placed.
 */
export const FIELD_GROUPS: Partial<Record<ResourceName, readonly { title: string; fields: readonly string[] }[]>> = {
  cameras: [
    { title: 'Identity', fields: ['name', 'brand', 'aliases', 'bodyType', 'frameFormat', 'format', 'year'] },
    { title: 'Lens', fields: ['lensName', 'focalMinMm', 'focalMaxMm', 'apertureMaxWide', 'apertureMaxTele', 'lensElements', 'lensGroups', 'closeFocusMm'] },
    { title: 'Exposure', fields: ['focusType', 'meteringPattern', 'exposureModes', 'shutterType', 'shutterSlowestSec', 'shutterFastestSec', 'filmSpeedMin', 'filmSpeedMax'] },
    { title: 'Body', fields: ['flash', 'batteryType', 'weightGrams'] },
    { title: 'Media & status', fields: ['defaultFilmStockId', 'description', 'imageStatus'] },
  ],
  films: [
    { title: 'Identity', fields: ['name', 'manufacturer', 'brand', 'aliases', 'iso', 'format'] },
    { title: 'Classification', fields: ['process', 'colorBalance', 'chromaticity', 'polarity', 'manufacturerStatus', 'manufacturedByBrandId'] },
    { title: 'Measured', fields: ['rmsGranularity', 'resolvingPowerLpmm', 'latitudeUnderStops', 'latitudeOverStops'] },
    { title: 'Stock', fields: ['baseMaterial', 'hasRemjet', 'parentStockId', 'respoolNotes'] },
    { title: 'Media & status', fields: ['description', 'imageStatus'] },
  ],
}

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
  brands: ['name'],
}

export function isResourceName(value: string): value is ResourceName {
  return Object.prototype.hasOwnProperty.call(ADMIN_RESOURCES, value)
}

export const RESOURCE_ORDER: readonly ResourceName[] = [
  'reports', 'photos', 'users', 'comments', 'cameras', 'films', 'brands', 'albums', 'notes',
]

/** The resource behind each catalog record a contributor can edit or add. */
export const CATALOG_RESOURCE = {
  camera: 'cameras',
  filmstock: 'films',
  film: 'films',
} as const satisfies Record<string, ResourceName>

/**
 * The fields a contributor's form may send, derived rather than listed again.
 *
 * The suggest-edit route kept its own `categorizationFields` array, and a key
 * missing from it was read by nobody: the value left the browser, the person
 * was told "submitted successfully", and it was gone. Ten camera specs sat on
 * the far side of that gap. Deriving the list cannot widen what gets written,
 * because `coercePayload` checks every key against this same allowlist again
 * at approval — it only stops the silent drop.
 *
 * Two are held back. The description is collected on every submission and
 * handled on its own, and an image's moderation state is not a contributor's
 * call.
 */
export function contributorFields(resource: ResourceName): string[] {
  return Object.keys(ADMIN_RESOURCES[resource].editable)
    .filter(field => field !== 'description' && field !== 'imageStatus')
}

/**
 * Reduces a submitted object to the fields a resource permits, coercing each.
 *
 * The editable allowlist is only a boundary if every write goes through it.
 * The moderation queue did not: it merged the reviewer's overrides into the
 * proposal and handed the result straight to Prisma, so an approve could write
 * any column on the record.
 *
 * A field the resource does not list is named back rather than dropped. An
 * approval that reports success over fields it silently discarded is a failure
 * this codebase has already had once, and the reviewer is the one person who
 * can still do something about it.
 */
export function coerceEditableFields(
  resource: ResourceName,
  submitted: Record<string, unknown>
): { data: Record<string, unknown> } | { error: string } {
  const spec: ResourceSpec = ADMIN_RESOURCES[resource]
  const data: Record<string, unknown> = {}
  const refused: string[] = []

  for (const [field, value] of Object.entries(submitted)) {
    const fieldSpec = spec.editable[field]
    if (!fieldSpec) {
      refused.push(field)
      continue
    }
    const result = coerceField(fieldSpec, value)
    if ('error' in result) return { error: result.error }
    data[field] = result.value
  }

  if (refused.length > 0) {
    return { error: `Not an editable field on this record: ${refused.join(', ')}` }
  }

  return { data }
}

/**
 * Turns one submitted value into something the column accepts, or reports why
 * it cannot. Returning a message rather than throwing keeps the failure
 * attached to the field the admin actually typed in.
 */
export function coerceField(spec: FieldSpec, raw: unknown): { value: Prisma.InputJsonValue | string | number | boolean | Date | string[] | null } | { error: string } {
  if (raw === null || raw === undefined || raw === '') {
    // A list column empties to an empty list. Postgres holds no null there and
    // Prisma refuses one, so clearing the aliases used to fail at the database
    // with nothing naming the field — and now that a contributor can clear a
    // value at all, it is reachable from the public form too.
    const list = spec.kind === 'stringList' || spec.kind === 'enumList'
    return { value: list ? [] : null }
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
      return { value: spec.decimal ? n : Math.trunc(n) }
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

    case 'enumList': {
      const items = Array.isArray(raw)
        ? raw.map(String)
        : String(raw).split(',').map(t => t.trim()).filter(Boolean)
      const bad = items.filter(t => !spec.options?.includes(t))
      if (bad.length > 0) {
        return { error: `${spec.label} must be chosen from: ${spec.options?.join(', ')}` }
      }
      // Deduplicated: the column is a set in meaning even though Postgres
      // stores it as an array, and "Manual, Manual" is not two modes.
      return { value: [...new Set(items)] }
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
