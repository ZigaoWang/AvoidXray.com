/**
 * Guards that a source is checked in the manufacturer's words, not in ours.
 *
 * A datasheet states a fact the way its author writes it. `format` was checked
 * against the literal string "35mm" while Kodak writes "Negative Size: 24 x 36
 * mm (135-size standard format)", so six correctly researched films were
 * refused. The cases below are the wordings that actually appear on the pages
 * this catalog cites, and every one of them must be accepted.
 *
 *   npx tsx scripts/test/passageSupports.test.ts
 */
import { passageSupports } from '../load-research'

let pass = 0
let fail = 0

function ok(name: string, field: string, value: unknown, passage: string) {
  const got = passageSupports(field, value, passage)
  if (got) pass++
  else { fail++; console.log(`  FAIL  ${name}`); return }
  console.log(`  PASS  ${name}`)
}

function no(name: string, field: string, value: unknown, passage: string) {
  const got = passageSupports(field, value, passage)
  if (!got) pass++
  else { fail++; console.log(`  FAIL  ${name} (accepted, should refuse)`); return }
  console.log(`  PASS  ${name}`)
}

console.log('format, as datasheets state it')
ok('Kodak negative size', 'format', '35mm', 'Negative size: 24 x 36 mm (135-size standard format)')
ok('Portra size 135', 'format', '35mm', 'Negative Size: 24 x 36 mm (Size 135)')
ok('Kodak product code', 'format', '35mm', 'product code numbers 5219 (35 mm), 7219 (16 mm)')
ok('Lomography spacing', 'format', '35mm', 'LomoChrome Color 92 Sun-kissed 35 mm ISO 400')
ok('Ilford cassettes', 'format', '35mm', 'HP5 Plus 35mm film is coated on 0.125mm/5-mil acetate base')

console.log('British spelling on a British manufacturer')
ok('Harman colour negative', 'chromaticity', 'COLOR', 'a colour negative film made in Mobberley')
ok('American color', 'chromaticity', 'COLOR', 'KODAK GOLD 200 Film is a low-speed color negative film')

console.log("a manufacturer's own process name")
ok('Fuji CN-16 is C-41', 'process', 'C41', 'Process the film with CN-16 chemicals')
ok('plain C-41', 'process', 'C41', 'designed for processing in KODAK FLEXICOLOR Chemicals for Process C-41')
ok('B+W as written', 'process', 'BW', 'ISO 80 panchromatic B+W negative film')

console.log('color temperature with a space')
ok('spaced tungsten kelvin', 'colorBalance', 'TUNGSTEN', 'balanced for exposure with tungsten illumination (3200 K)')
ok('slide as positive', 'polarity', 'POSITIVE', 'a color transparency film')

console.log('camera values, as manuals word them')
ok('center-weighted', 'meteringPattern', 'CENTER_WEIGHTED', 'TTL center-weighted average metering')
ok('British centre', 'meteringPattern', 'CENTER_WEIGHTED', 'centre-weighted metering at full aperture')
ok('built-in flash', 'flash', 'BUILT_IN', 'Flash: Built-in.')
ok('camera-wiki integral flash', 'flash', 'BUILT_IN', 'Integral flash.')
ok('hot shoe', 'flash', 'HOT_SHOE', 'X-synchro. with hot shoe')
ok('Canon lens shutter', 'shutterType', 'LEAF', 'Shutter: Programmed electronically controlled Lens-Shutter')
ok('focal plane', 'shutterType', 'FOCAL_PLANE', 'Cloth focal-plane shutter, 1 to 1/1000 sec')
no('metering not stated', 'meteringPattern', 'CENTER_WEIGHTED', 'Exposure is fully automatic')

console.log('short battery codes')
ok('CR2', 'batteryType', 'CR2', 'Power source: one 3V lithium battery (CR2)')
ok('AAA pair', 'batteryType', '2x AAA', 'Uses two AAA batteries')
no('AA is not AAA', 'batteryType', 'AA', 'Uses two AAA batteries')

console.log('a frame size with a multiplication sign')
ok('Canon 24×36', 'frameFormat', 'FULL_FRAME', 'Image size: 24×36 mm')

console.log('a yes or no')
ok('Vision3 has remjet', 'hasRemjet', true, 'have an acetate safety base with rem-jet backing')
ok('CineStill removes it', 'hasRemjet', false, 'with the remjet layer removed for C-41 processing')
no('remjet not mentioned', 'hasRemjet', false, 'a color negative film for general use')

console.log('numbers are bounded')
ok('iso stated plainly', 'iso', 400, 'Film Speed ISO 400')
ok('iso with DIN', 'iso', 400, 'ISO 400/27, BLACK AND WHITE PROFESSIONAL FILM')
no('iso 100 is not 1000', 'iso', 100, 'rated at ISO 1000 for this test')
ok('year', 'year', 1978, 'Introduced in July 1978, it appears to have been sold only to the Asian market')

console.log('numbers in the unit the source uses')
ok('close focus in meters', 'closeFocusMm', 600, 'Closest focusing distance: 0.6m')
ok('close focus in whole meters', 'closeFocusMm', 1000, 'Focus range: 1.0 m to infinity')
ok('close focus spelled out', 'closeFocusMm', 1000, 'Focus range: 1 meter to infinity')
ok('close focus in centimeters', 'closeFocusMm', 350, 'focuses down to 35 cm')
no('meters are not millimeters', 'closeFocusMm', 600, 'filter thread 0.6mm pitch')
ok('shutter as a fraction', 'shutterFastestSec', 1 / 1200, 'Shutter speeds: 4 to 1/1200 sec')
ok('rounded decimal', 'shutterFastestSec', 0.000833, 'Shutter speeds: 4 to 1/1200 sec')
no('1/100 is not 1/1000', 'shutterFastestSec', 0.01, 'Shutter speeds: 1 to 1/1000 sec')
ok('weight with unit', 'weightGrams', 135, 'Weight: 135g (without battery)')
no('5 is not read out of 3.5', 'apertureMaxWide', 5, 'Lens: 35mm f/3.5')

console.log('a passage that does not carry the claim')
no('35mm camera does not give frame geometry', 'frameFormat', 'FULL_FRAME', 'The Olympus 35 SP is a rangefinder camera made by Olympus')
no('unrelated sentence', 'colorBalance', 'DAYLIGHT', 'The film has wide exposure latitude')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
