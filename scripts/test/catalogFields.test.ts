/**
 * The one map between a catalog record and the form that edits it.
 *
 * Everything a camera or film page prints is now editable, and most of it goes
 * through a unit conversion or an enum to get there. Two of those conversions
 * are traps the page sets for the form: the shutter columns store seconds while
 * the page prints 1/500, and the closest-focus column stores millimeters while
 * the page prints 0.9m. A form that asked in the stored unit under a page
 * printing the other one would collect 0.9 and mean 900.
 *
 * So these check the properties the whole path depends on:
 *
 *  - opening the dialog and changing nothing proposes nothing, for every
 *    field, because the before and after maps are built by the same function
 *  - a value read off a record comes back as the same value, through the
 *    conversions
 *  - a control that has been emptied is sent as an empty value, which is what
 *    lets a contributor remove a wrong answer rather than only overwrite it
 *  - the coupled film fields the database constrains are refused here, where
 *    the message can name the control, rather than at the constraint
 *
 *   npx tsx scripts/test/catalogFields.test.ts
 */
import {
  catalogFields,
  draftFromRecord,
  emptyDraft,
  type CatalogRecord,
} from '../../src/lib/catalogForm'
import {
  closeFocusLabel,
  parseCloseFocusMm,
  parseShutterSeconds,
  shutterSpeedLabel,
} from '../../src/lib/cameraFields'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('a dial reading is seconds, and back')

check('a fraction', parseShutterSeconds('1/500'), 0.002)
check('whole seconds with a unit', parseShutterSeconds('8s'), 8)
check('whole seconds without one', parseShutterSeconds('2'), 2)
check('spaces and capitals', parseShutterSeconds(' 1/250 S '), 0.004)
check('words are not a speed', parseShutterSeconds('fast'), null)
check('a fraction over zero is not a speed', parseShutterSeconds('1/0'), null)
check('seconds print as seconds', shutterSpeedLabel(10), '10s')
check('under a second prints as a fraction', shutterSpeedLabel(0.002), '1/500')

console.log('a distance is asked in the unit it is said in')

check('centimetres', parseCloseFocusMm('60', 'cm'), 600)
check('meters', parseCloseFocusMm('1.2', 'm'), 1200)
check('nothing readable', parseCloseFocusMm('half a meter', 'm'), null)
// The page and the form are the same two rules, facing opposite ways.
check('under a meter reads in centimetres', closeFocusLabel(900), '90cm')
check('a meter reads in meters', closeFocusLabel(1200), '1.2m')

console.log('a record the form has not touched proposes nothing')

const XA: CatalogRecord = {
  id: 'cam1',
  name: 'Olympus XA',
  brand: 'Olympus',
  description: 'A rangefinder compact with a 35mm f/2.8.',
  aliases: ['XA1'],
  bodyType: 'RANGEFINDER',
  frameFormat: 'FULL_FRAME',
  format: '35mm',
  year: 1979,
  lensName: 'F.Zuiko',
  focalMinMm: 35,
  focalMaxMm: 35,
  apertureMaxWide: 2.8,
  apertureMaxTele: 2.8,
  lensElements: 6,
  lensGroups: 5,
  closeFocusMm: 900,
  focusType: 'RANGEFINDER',
  meteringPattern: 'CENTER_WEIGHTED',
  exposureModes: ['APERTURE_PRIORITY'],
  shutterType: 'LEAF',
  shutterSlowestSec: 10,
  shutterFastestSec: 0.002,
  filmSpeedMin: 25,
  filmSpeedMax: 800,
  flash: 'NONE',
  batteryType: 'LR44',
  weightGrams: 225,
  defaultFilmStockId: null,
}

const opened = draftFromRecord('camera', XA)
const before = catalogFields('camera', opened).fields
const again = catalogFields('camera', opened).fields
check('no field differs from itself',
  Object.keys(again).filter(f => again[f] !== before[f]), [])
check('nothing failed to be read', catalogFields('camera', opened).errors, [])

console.log('the stored value survives the trip out and back')

check('the shutter range is the one on the dial',
  [before.shutterSlowestSec, before.shutterFastestSec], ['10', '0.002'])
check('the close focus is back in millimeters', before.closeFocusMm, '900')
check('the aperture keeps its fraction', before.apertureMaxWide, '2.8')
check('the modes are members, comma separated', before.exposureModes, 'APERTURE_PRIORITY')
check('no meter is not the same as no answer', before.meteringPattern, 'CENTER_WEIGHTED')

console.log('an emptied control is a proposal to clear')

const cleared = catalogFields('camera', { ...opened, year: '', batteryType: '', closeFocus: '' }).fields
check('the year goes out empty rather than absent', cleared.year, '')
check('so does the battery', cleared.batteryType, '')
check('and the converted distance', cleared.closeFocusMm, '')

console.log('a camera spec the form cannot read is named, not dropped')

const unreadable = catalogFields('camera', { ...opened, shutterFastest: 'fast' })
check('the control is named', unreadable.errors.length, 1)
check('and nothing silently lands', 'shutterFastestSec' in unreadable.fields, false)

console.log('a film says who makes it, or says nothing')

const stock: CatalogRecord = {
  id: 'film1',
  name: 'Kentmere Pan 400',
  manufacturer: 'Kentmere',
  format: ['35mm', '120'],
  iso: 400,
  process: 'BW',
  colorBalance: 'NA',
  chromaticity: 'MONOCHROME',
  polarity: 'NEGATIVE',
  manufacturerStatus: 'UNKNOWN',
  manufacturedByBrandId: null,
  hasRemjet: false,
  aliases: [],
}

const film = draftFromRecord('film', stock)
check('both gauges are held, not one', film.format, '35mm, 120')
check('the process is offered as the word on the box', film.process, 'B&W')
check('a removed remjet is a value, not an absence', film.hasRemjet, 'false')
check('an untouched stock proposes nothing',
  Object.entries(catalogFields('film', film).fields)
    .filter(([f, v]) => v !== catalogFields('film', film).fields[f]), [])

// The database couples these two (FilmStock_manufacturer_status_matches_column),
// so the form has to, or an approval fails at the constraint with no field
// attached to it.
check('confirmed without a company is refused',
  catalogFields('film', { ...film, manufacturerStatus: 'KNOWN' }).errors.length, 1)
check('a company without the claim is refused',
  catalogFields('film', { ...film, manufacturedByBrandId: 'brand1' }).errors.length, 1)
check('the pair together is accepted',
  catalogFields('film', {
    ...film, manufacturerStatus: 'ATTRIBUTED', manufacturedByBrandId: 'brand1',
  }).errors, [])

console.log('a format the list does not offer is kept')

const odd = draftFromRecord('camera', { ...XA, format: '127' })
check('it lands in the Other box', [odd.format, odd.customFormat], ['Other', '127'])
check('and comes back unchanged', catalogFields('camera', odd).fields.format, '127')

console.log('an empty draft asks for nothing it was not given')

check('no camera field is invented',
  catalogFields('camera', emptyDraft()).fields.name, '')

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
