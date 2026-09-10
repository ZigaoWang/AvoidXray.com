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
ok('Harman color negative', 'chromaticity', 'COLOR', 'a color negative film made in Mobberley')
ok('American color', 'chromaticity', 'COLOR', 'KODAK GOLD 200 Film is a low-speed color negative film')

console.log("a manufacturer's own process name")
ok('Fuji CN-16 is C-41', 'process', 'C41', 'Process the film with CN-16 chemicals')
ok('plain C-41', 'process', 'C41', 'designed for processing in KODAK FLEXICOLOR Chemicals for Process C-41')
ok('B+W as written', 'process', 'BW', 'ISO 80 panchromatic B+W negative film')

console.log('color temperature with a space')
ok('spaced tungsten kelvin', 'colorBalance', 'TUNGSTEN', 'balanced for exposure with tungsten illumination (3200 K)')
ok('slide as positive', 'polarity', 'POSITIVE', 'a color transparency film')

console.log('numbers are bounded')
ok('iso stated plainly', 'iso', 400, 'Film Speed ISO 400')
ok('iso with DIN', 'iso', 400, 'ISO 400/27, BLACK AND WHITE PROFESSIONAL FILM')
no('iso 100 is not 1000', 'iso', 100, 'rated at ISO 1000 for this test')
ok('year', 'year', 1978, 'Introduced in July 1978, it appears to have been sold only to the Asian market')

console.log('a passage that does not carry the claim')
no('35mm camera does not give frame geometry', 'frameFormat', 'FULL_FRAME', 'The Olympus 35 SP is a rangefinder camera made by Olympus')
no('unrelated sentence', 'colorBalance', 'DAYLIGHT', 'The film has wide exposure latitude')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
