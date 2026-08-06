/**
 * schema.org JSON-LD builders.
 *
 * Every builder returns a plain object; render it with the <JsonLd> component so
 * the serialisation and XSS escaping stay in one place.
 */

import { SITE_NAME, SITE_URL, absoluteUrl } from './site'
import { displayName, photographerName, photoAlt, photoDescription, type NamedEntity } from './alt'

type Json = Record<string, unknown>

/** Site-level identity. Rendered once, in the root layout. */
export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description:
      'A community archive of film photography, organised by film stock, camera, and photographer.',
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/logo.svg'),
    },
  }
}

export interface BreadcrumbItem {
  name: string
  path: string
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export interface PhotoJsonLdSource {
  id: string
  caption?: string | null
  width: number
  height: number
  mediumPath: string
  originalPath?: string | null
  thumbnailPath?: string | null
  createdAt: Date
  takenDate?: Date | null
  filmStock?: (NamedEntity & { slug?: string | null }) | null
  camera?: (NamedEntity & { slug?: string | null }) | null
  user?: { name?: string | null; username: string } | null
  likeCount?: number
}

/**
 * ImageObject is what makes a photo eligible for rich results in Google Images.
 * `contentUrl` must point at the actual image file, not the page.
 */
export function photoJsonLd(photo: PhotoJsonLdSource): Json {
  const photographer = photographerName(photo.user)
  const film = displayName(photo.filmStock)
  const camera = displayName(photo.camera)

  // "about" is how we tell Google this image is genuinely a depiction of/related
  // to a specific film stock and camera — the queries we want to rank for.
  const about: Json[] = []
  if (film) {
    about.push({
      '@type': 'Product',
      name: film,
      category: 'Photographic film',
      ...(photo.filmStock?.slug && { url: absoluteUrl(`/films/${photo.filmStock.slug}`) }),
    })
  }
  if (camera) {
    about.push({
      '@type': 'Product',
      name: camera,
      category: 'Film camera',
      ...(photo.camera?.slug && { url: absoluteUrl(`/cameras/${photo.camera.slug}`) }),
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    '@id': `${absoluteUrl(`/photos/${photo.id}`)}#image`,
    contentUrl: photo.mediumPath,
    thumbnailUrl: photo.thumbnailPath ?? photo.mediumPath,
    url: absoluteUrl(`/photos/${photo.id}`),
    name: photoAlt(photo),
    description: photoDescription(photo),
    caption: photo.caption || photoAlt(photo),
    width: { '@type': 'QuantitativeValue', value: photo.width, unitCode: 'E37' },
    height: { '@type': 'QuantitativeValue', value: photo.height, unitCode: 'E37' },
    uploadDate: photo.createdAt.toISOString(),
    ...(photo.takenDate && { dateCreated: photo.takenDate.toISOString() }),
    ...(photographer && {
      creator: {
        '@type': 'Person',
        name: photographer,
        ...(photo.user && { url: absoluteUrl(`/${photo.user.username}`) }),
      },
      copyrightHolder: { '@type': 'Person', name: photographer },
      creditText: photographer,
    }),
    ...(about.length > 0 && { about }),
    isPartOf: { '@id': `${SITE_URL}/#website` },
    ...(typeof photo.likeCount === 'number' &&
      photo.likeCount > 0 && {
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/LikeAction',
          userInteractionCount: photo.likeCount,
        },
      }),
  }
}

export interface CollectionJsonLdSource {
  name: string
  description: string
  path: string
  photos: Array<{ id: string; thumbnailPath: string }>
  totalPhotos: number
}

/**
 * CollectionPage + ItemList for film/camera hub pages. The ItemList gives Google
 * an explicit, ordered inventory of the images on the page rather than making it
 * infer one from the DOM.
 */
export function collectionJsonLd(source: CollectionJsonLdSource): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl(source.path)}#collection`,
    url: absoluteUrl(source.path),
    name: source.name,
    description: source.description,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: source.totalPhotos,
      itemListElement: source.photos.slice(0, 50).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: absoluteUrl(`/photos/${p.id}`),
      })),
    },
  }
}

export interface GearJsonLdSource {
  name: string
  description: string
  path: string
  imageUrl?: string | null
  brand?: string | null
  photoCount: number
  category: string
  /** Extra schema.org additionalProperty rows, e.g. ISO / format / process. */
  properties?: Array<{ name: string; value: string | number }>
}

/** Product schema for a film stock or camera, describing the gear itself. */
export function gearJsonLd(source: GearJsonLdSource): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${absoluteUrl(source.path)}#product`,
    name: source.name,
    description: source.description,
    url: absoluteUrl(source.path),
    category: source.category,
    ...(source.imageUrl && { image: source.imageUrl }),
    ...(source.brand && { brand: { '@type': 'Brand', name: source.brand } }),
    ...(source.properties?.length && {
      additionalProperty: source.properties.map((p) => ({
        '@type': 'PropertyValue',
        name: p.name,
        value: String(p.value),
      })),
    }),
  }
}

export interface ProfileJsonLdSource {
  username: string
  name?: string | null
  bio?: string | null
  avatar?: string | null
  website?: string | null
  instagram?: string | null
  twitter?: string | null
  photoCount: number
}

export function profileJsonLd(source: ProfileJsonLdSource): Json {
  const sameAs = [
    source.website,
    source.instagram && `https://instagram.com/${source.instagram.replace(/^@/, '')}`,
    source.twitter && `https://x.com/${source.twitter.replace(/^@/, '')}`,
  ].filter(Boolean)

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${absoluteUrl(`/${source.username}`)}#profile`,
    url: absoluteUrl(`/${source.username}`),
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'Person',
      name: source.name || source.username,
      alternateName: source.username,
      url: absoluteUrl(`/${source.username}`),
      ...(source.bio && { description: source.bio }),
      ...(source.avatar && { image: source.avatar }),
      ...(sameAs.length > 0 && { sameAs }),
    },
  }
}
