/**
 * Reading Library of Congress JSON into what an archive import stores.
 *
 * Pure: no network, no database, no image work, so the importer and its tests
 * share one reading of a record. Text is copied as the record gives it. LOC
 * fields are arrays even when they hold one value, and are joined rather than
 * reduced to their first entry, so nothing the archive wrote is dropped.
 */

/** The fields of an item's `item` object this importer reads. */
export interface LocItemJson {
  item?: {
    id?: string
    library_of_congress_control_number?: string
    title?: string
    rights_advisory?: string | string[]
    rights?: string[]
    medium?: string[]
    contributor_names?: string[]
    created_published?: string | string[]
    notes?: string[]
    digital_id?: string[]
    image_url?: string[]
    link?: string
    subject_headings?: string[]
  }
  /** On an item page, `files` lists each image's renditions; in a collection listing it is only a count. */
  resources?: Array<{ files?: number | Array<Array<{ url?: string; mimetype?: string; width?: number }>>; url?: string }>
}

/** One entry of a collection listing's `results`. */
export interface LocCollectionResult {
  id?: string
  image_url?: string[]
  resources?: LocItemJson['resources']
  item?: NonNullable<LocItemJson['item']> & { contributors?: string[] }
}

/**
 * A collection listing's entry in the shape of an item page, so a dry run can
 * read the whole collection from its listing pages. The listing carries the
 * same rights advisory, medium, notes, date and digital id as the item page,
 * and names the photographer `contributors` rather than `contributor_names`.
 * The import itself still reads each item page.
 */
export function itemFromCollectionResult(result: LocCollectionResult): LocItemJson {
  const item = result.item ?? {}
  return {
    item: {
      ...item,
      library_of_congress_control_number: item.library_of_congress_control_number ?? item.id,
      contributor_names: item.contributor_names ?? item.contributors,
      image_url: result.image_url,
    },
    resources: result.resources,
  }
}

/** A record ready to import, before its master has been fetched. */
export interface LocRecord {
  externalId: string
  sourceUrl: string
  sourceHandleUrl: string | null
  /** The TIFF master, derived from the largest service JPEG. Not yet verified. */
  sourceMasterUrl: string
  photographer: string | null
  takenAt: string | null
  originalTitle: string | null
  medium: string | null
  notes: string | null
  rightsNote: string | null
  subjectHeadings: string[]
}

export type LocReading = { ok: true; record: LocRecord } | { ok: false; externalId: string | null; reason: string }

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const joined = (values: string[] | undefined, separator: string): string | null => {
  const kept = (values ?? []).map(v => v.trim()).filter(Boolean)
  return kept.length ? kept.join(separator) : null
}

/** The phrase LOC uses for items that may be published freely. */
export function hasNoKnownRestrictions(rightsAdvisory: string | string[] | undefined): boolean {
  return asArray(rightsAdvisory).some(text => /no known restrictions/i.test(text))
}

/**
 * The master TIFF behind a service JPEG.
 *
 * The JPEGs in the JSON stop at 1024px, and the IIIF service scales up from
 * that same file rather than from the master. The master sits beside them on
 * the storage service with `/master/` for `/service/` and `u.tif` for `v.jpg`.
 */
export function masterUrlFromImageUrl(imageUrl: string): string | null {
  const url = imageUrl.split('#')[0]
  if (!/\/storage-services\/service\//.test(url) || !/v\.jpg$/.test(url)) return null
  return url.replace('/storage-services/service/', '/storage-services/master/').replace(/v\.jpg$/, 'u.tif')
}

/** The service JPEG URLs among an item's files, `v.jpg` (the largest) first. */
function serviceJpegs(json: LocItemJson): string[] {
  const fromResources = (json.resources ?? []).flatMap(r => (Array.isArray(r.files) ? r.files.flat() : []).map(f => f.url ?? ''))
  const all = [...fromResources, ...(json.item?.image_url ?? [])].map(u => u.split('#')[0])
  return [...new Set(all.filter(u => /v\.jpg$/.test(u)))]
}

/** The `hdl.loc.gov` link in the digital id, e.g. "fsac 1a33849 https://hdl.loc.gov/loc.pnp/fsac.1a33849". */
function handleUrl(digitalIds: string[] | undefined): string | null {
  for (const id of digitalIds ?? []) {
    const match = id.match(/https?:\/\/hdl\.loc\.gov\/\S+/)
    if (match) return match[0].replace(/^http:/, 'https:')
  }
  return null
}

/**
 * The "Credit Line:" sentence from a collection's rights statement, which is
 * HTML in the JSON.
 */
export function creditLineFromRights(rights: string[] | undefined): string | null {
  const text = stripHtml((rights ?? []).join(' '))
  const match = text.match(/Credit Line:\s*(.+?\.)(?:\s|$)/)
  return match ? match[1].trim() : null
}

/** The sentence of a rights statement that says the material is in the public domain. */
export function publicDomainStatement(rights: string[] | undefined): string | null {
  const text = stripHtml((rights ?? []).join(' '))
  const sentence = text.split(/(?<=\.)\s+/).find(s => /public domain/i.test(s))
  return sentence?.trim() ?? null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The item's subject headings, in the record's order and spelling. The item
 * JSON also carries lowercased and linked copies (`subject`, `subjects`);
 * `subject_headings` is the one that reads as the catalog wrote it.
 */
export function subjectHeadingsOf(json: LocItemJson): string[] {
  return (json.item?.subject_headings ?? []).filter((heading): heading is string => typeof heading === 'string')
}

/** An item's JSON, read into a record to import or a reason to skip it. */
export function readLocItem(json: LocItemJson): LocReading {
  const item = json.item
  const externalId = item?.library_of_congress_control_number ?? item?.id ?? null
  if (!item || !externalId) return { ok: false, externalId, reason: 'no item record' }

  if (!hasNoKnownRestrictions(item.rights_advisory)) {
    const stated = asArray(item.rights_advisory).join(' ').trim()
    return { ok: false, externalId, reason: `rights advisory: ${stated || 'none given'}` }
  }

  const jpegs = serviceJpegs(json)
  if (jpegs.length === 0) return { ok: false, externalId, reason: 'no image files' }
  // Each resource is one image; a listing names only the first one's files.
  const images = Math.max(jpegs.length, json.resources?.length ?? 0)
  if (images > 1) return { ok: false, externalId, reason: `${images} images in one record` }

  const sourceMasterUrl = masterUrlFromImageUrl(jpegs[0])
  if (!sourceMasterUrl) return { ok: false, externalId, reason: `unrecognized image URL ${jpegs[0]}` }

  return {
    ok: true,
    record: {
      externalId,
      sourceUrl: `https://www.loc.gov/item/${externalId}/`,
      sourceHandleUrl: handleUrl(item.digital_id),
      sourceMasterUrl,
      photographer: joined(item.contributor_names, '; '),
      takenAt: joined(asArray(item.created_published), '; '),
      originalTitle: item.title?.trim() || null,
      medium: joined(item.medium, '; '),
      notes: joined(item.notes, '\n'),
      rightsNote: joined(asArray(item.rights_advisory), ' '),
      subjectHeadings: subjectHeadingsOf(json),
    },
  }
}
