/**
 * Reading Library of Congress item JSON into an archive record.
 *
 * The fixture is a trimmed copy of a real FSA/OWI color item. What matters:
 * the master is the TIFF beside the 1024px service JPEG and never the JPEG
 * itself, only "no known restrictions" items are imported, and every text
 * field arrives as the archive wrote it.
 *
 *   npx tsx scripts/test/archiveLoc.test.ts
 */
import {
  creditLineFromRights,
  itemFromCollectionResult,
  masterUrlFromImageUrl,
  publicDomainStatement,
  readLocItem,
  subjectHeadingsOf,
  type LocItemJson,
} from '../../src/lib/archive/loc'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const SERVICE = 'https://tile.loc.gov/storage-services/service/pnp/fsac/1a33000/1a33800/1a33849'
const RIGHTS = [
  '<p>The contents of the Library of Congress Farm Security Administration/Office of War Information Color Photographs are in the public domain and are free to use and reuse.</p>\r\n<p>\tCredit Line: Library of Congress, Prints &amp; Photographs Division, Farm Security Administration/Office of War Information Color Photographs.</p>\r\n<p>For information about reproducing, see the guide.</p>',
]

const item = (overrides: Partial<NonNullable<LocItemJson['item']>> = {}, files = ['_150px.jpg', 't.gif', 'r.jpg', 'v.jpg']): LocItemJson => ({
  item: {
    library_of_congress_control_number: '2017877351',
    title: 'Commuters, who have just come off the train, waiting for the bus to go home, Lowell, Mass.',
    rights_advisory: 'No known restrictions on publication.',
    rights: RIGHTS,
    medium: ['1 slide : color.'],
    contributor_names: ['Delano, Jack, 1914-1997, photographer'],
    created_published: ['1941 Jan.'],
    notes: ['11671-1.', 'Transfer from U.S. Office of War Information, 1944.'],
    digital_id: ['fsac 1a33849 https://hdl.loc.gov/loc.pnp/fsac.1a33849'],
    subject_headings: ['Commuters', 'Bus stops', 'United States--Massachusetts--Lowell'],
    ...overrides,
  },
  resources: [{ files: [files.map(f => ({ url: `${SERVICE}${f}` }))] }],
})

console.log('master URL')
check('v.jpg becomes the u.tif master', masterUrlFromImageUrl(`${SERVICE}v.jpg#h=715&w=1024`),
  'https://tile.loc.gov/storage-services/master/pnp/fsac/1a33000/1a33800/1a33849u.tif')
check('a smaller rendition is not mistaken for the master', masterUrlFromImageUrl(`${SERVICE}r.jpg`), null)
check('a IIIF URL is not turned into a master', masterUrlFromImageUrl('https://tile.loc.gov/image-services/iiif/service:pnp:fsac:1a33000:1a33800:1a33849/full/pct:100/0/default.jpg'), null)

console.log('reading an item')
const reading = readLocItem(item())
check('an unrestricted single-image item is importable', reading.ok, true)
if (reading.ok) {
  const r = reading.record
  check('external id is the control number', r.externalId, '2017877351')
  check('source URL is the item page', r.sourceUrl, 'https://www.loc.gov/item/2017877351/')
  check('handle comes from the digital id', r.sourceHandleUrl, 'https://hdl.loc.gov/loc.pnp/fsac.1a33849')
  check('master is derived from the largest JPEG', r.sourceMasterUrl.endsWith('/master/pnp/fsac/1a33000/1a33800/1a33849u.tif'), true)
  check('photographer is copied as written', r.photographer, 'Delano, Jack, 1914-1997, photographer')
  check('date is kept as given', r.takenAt, '1941 Jan.')
  check('medium is copied verbatim', r.medium, '1 slide : color.')
  check('every note is kept, one per line', r.notes, '11671-1.\nTransfer from U.S. Office of War Information, 1944.')
  check('rights advisory is kept', r.rightsNote, 'No known restrictions on publication.')
  check('subject headings are kept in order and as written', r.subjectHeadings, ['Commuters', 'Bus stops', 'United States--Massachusetts--Lowell'])
}
check('a record without subject headings has none', subjectHeadingsOf(item({ subject_headings: undefined })), [])

console.log('skipping')
const restricted = readLocItem(item({ rights_advisory: 'Rights status not evaluated.' }))
check('anything but "no known restrictions" is skipped with the advisory as the reason',
  restricted.ok ? null : restricted.reason, 'rights advisory: Rights status not evaluated.')
const missing = readLocItem(item({ rights_advisory: undefined }))
check('no advisory at all is skipped', missing.ok, false)
const twoImages = readLocItem({ ...item(), resources: [{ files: [[{ url: `${SERVICE}v.jpg` }]] }, { files: [[{ url: `${SERVICE.replace('849', '850')}v.jpg` }]] }] })
check('a record with two images is skipped rather than guessed at', twoImages.ok ? null : twoImages.reason, '2 images in one record')
const noImage = readLocItem(item({}, ['_150px.jpg']))
check('a record with no full image is skipped', noImage.ok ? null : noImage.reason, 'no image files')

console.log('source')
check('credit line is read from the rights statement', creditLineFromRights(RIGHTS),
  'Library of Congress, Prints & Photographs Division, Farm Security Administration/Office of War Information Color Photographs.')
check('license is the public domain sentence', publicDomainStatement(RIGHTS),
  'The contents of the Library of Congress Farm Security Administration/Office of War Information Color Photographs are in the public domain and are free to use and reuse.')

console.log('collection listing')
const fromListing = readLocItem(itemFromCollectionResult({
  id: 'http://www.loc.gov/item/2017877351/',
  image_url: [`${SERVICE}r.jpg#h=447&w=640`, `${SERVICE}v.jpg#h=715&w=1024`],
  resources: [{ files: 1, url: 'https://www.loc.gov/resource/fsac.1a33849/' }],
  item: {
    id: '2017877351',
    title: 'Commuters',
    rights_advisory: 'No known restrictions on publication.',
    medium: ['1 slide : color.'],
    contributors: ['Delano, Jack, 1914-1997, photographer'],
    created_published: '1941 Jan.',
    digital_id: ['fsac 1a33849 https://hdl.loc.gov/loc.pnp/fsac.1a33849'],
  },
}))
check('a listing entry reads the same as its item page',
  fromListing.ok && [fromListing.record.externalId, fromListing.record.photographer, fromListing.record.takenAt, fromListing.record.sourceMasterUrl.endsWith('1a33849u.tif')],
  ['2017877351', 'Delano, Jack, 1914-1997, photographer', '1941 Jan.', true])
const twoInListing = readLocItem(itemFromCollectionResult({
  image_url: [`${SERVICE}v.jpg`], resources: [{ files: 1 }, { files: 1 }],
  item: { id: '1', rights_advisory: 'No known restrictions on publication.' },
}))
check('a listing entry with two resources is skipped', twoInListing.ok ? null : twoInListing.reason, '2 images in one record')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
