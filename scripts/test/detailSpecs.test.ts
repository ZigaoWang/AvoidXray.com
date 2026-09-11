/**
 * The labeled specs on a camera's or a film's own page.
 *
 * Twenty-one camera columns and six film columns were written by the admin
 * form, the revision pipeline and scripts/load-specs.ts, and four of them
 * were rendered anywhere. The data was in Postgres and unreachable from the
 * site, so filling it in bought nothing.
 *
 * These check the properties that keep the list honest rather than the exact
 * strings, which are a design decision and may change:
 *
 *  - nothing absent produces a row, because the data is sparse and a column of
 *    dashes says less than a short list
 *  - the stored unit is converted to the one a photographer says out loud:
 *    seconds to a shutter fraction, millimeters to centimetres
 *  - a range collapses to one value when both ends agree, so a prime does not
 *    advertise itself as a zoom
 *  - false is a value, not an absence: "remjet removed" is the whole reason
 *    Cinestill exists and must not be dropped as falsy
 *
 *   npx tsx scripts/test/detailSpecs.test.ts
 */
import { cameraDetailSpecs } from '../../src/lib/cameraFields'
import { filmDetailSpecs } from '../../src/lib/filmFields'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    pass++
    console.log(`  PASS ${name}`)
  } else {
    fail++
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const valueOf = (specs: Array<{ label: string; value: string }>, label: string) =>
  specs.find((s) => s.label === label)?.value

console.log('an empty record produces no rows')
check('camera', cameraDetailSpecs({}).length === 0)
check('film', filmDetailSpecs({}).length === 0)

console.log('stored units become the ones people say')
const xa = cameraDetailSpecs({
  lensName: 'F.Zuiko',
  focalMinMm: 35,
  apertureMaxWide: 2.8,
  shutterSlowestSec: 10,
  shutterFastestSec: 0.002,
  closeFocusMm: 900,
  filmSpeedMin: 25,
  filmSpeedMax: 800,
  weightGrams: 225,
})
check('a prime is one focal length and one aperture', valueOf(xa, 'Lens') === 'F.Zuiko 35mm f/2.8', valueOf(xa, 'Lens'))
check('seconds become a fraction', valueOf(xa, 'Shutter') === '10s to 1/500', valueOf(xa, 'Shutter'))
check('millimeters become centimetres', valueOf(xa, 'Close focus') === '90cm', valueOf(xa, 'Close focus'))
check('film speed is a range', valueOf(xa, 'Film speed') === 'ISO 25-800', valueOf(xa, 'Film speed'))
check('weight carries its unit', valueOf(xa, 'Weight') === '225g', valueOf(xa, 'Weight'))

const zoom = cameraDetailSpecs({
  focalMinMm: 35,
  focalMaxMm: 70,
  apertureMaxWide: 3.5,
  apertureMaxTele: 5.6,
  closeFocusMm: 1200,
})
check('a zoom shows both ends', valueOf(zoom, 'Lens') === '35-70mm f/3.5-5.6', valueOf(zoom, 'Lens'))
check('a meter is a meter', valueOf(zoom, 'Close focus') === '1.2m', valueOf(zoom, 'Close focus'))

const prime = cameraDetailSpecs({ focalMinMm: 40, focalMaxMm: 40, apertureMaxWide: 1.7, apertureMaxTele: 1.7 })
check('matching ends do not read as a range', valueOf(prime, 'Lens') === '40mm f/1.7', valueOf(prime, 'Lens'))

console.log('enums arrive as words')
const words = cameraDetailSpecs({
  focusType: 'ZONE',
  meteringPattern: 'CENTER_WEIGHTED',
  exposureModes: ['APERTURE_PRIORITY', 'MANUAL'],
  shutterType: 'LEAF',
  flash: 'BUILT_IN_AND_HOT_SHOE',
})
for (const [label, expected] of [
  ['Focus', 'Zone focus'],
  ['Metering', 'Center-weighted'],
  ['Exposure', 'Aperture priority, Manual'],
  ['Flash', 'Built in and hot shoe'],
] as const) {
  check(`${label} is readable`, valueOf(words, label) === expected, valueOf(words, label))
}
check('shutter type shows without a range', valueOf(words, 'Shutter') === 'Leaf', valueOf(words, 'Shutter'))

console.log('a film says what a lab needs to know')
const cinestill = filmDetailSpecs({ hasRemjet: false, process: 'ECN2', latitudeOverStops: 2, latitudeUnderStops: 1 })
check('remjet removed is not dropped as falsy', valueOf(cinestill, 'Remjet')?.includes('Removed') === true, String(valueOf(cinestill, 'Remjet')))
check('latitude reads as push and pull', valueOf(cinestill, 'Latitude') === '+2 / -1 stops', valueOf(cinestill, 'Latitude'))

const vision3 = filmDetailSpecs({ hasRemjet: true, rmsGranularity: 12, resolvingPowerLpmm: 100, baseMaterial: 'POLYESTER' })
check('remjet present says so', valueOf(vision3, 'Remjet')?.includes('Present') === true, String(valueOf(vision3, 'Remjet')))
check('grain carries its scale', valueOf(vision3, 'Grain') === 'RMS 12', valueOf(vision3, 'Grain'))
check('resolving power carries its unit', valueOf(vision3, 'Resolving power') === '100 lp/mm', valueOf(vision3, 'Resolving power'))

check('an unrecorded remjet produces no row', filmDetailSpecs({ rmsGranularity: 5 }).some((s) => s.label === 'Remjet') === false)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
