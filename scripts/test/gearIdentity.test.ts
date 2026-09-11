/**
 * What a camera or a film is called, from either way the catalog stores it.
 *
 * Half the records carry the maker in the name ("Canon AE-1 Program") and half
 * do not ("F4" with brand Nikon). Both are legitimate — people typed what the
 * form asked for at the time — and both must come out as the name people say.
 * Whether a page composed it used to depend on which way the record happened
 * to be typed, which is what put a brand line over some cards and not others.
 *
 * displayName is the one place that decides, so these are its cases.
 */

import { displayName } from '../../src/lib/seo/alt'
import { usefulAliases } from '../../src/lib/aliases'

let failures = 0
function check(what: string, ok: boolean, saw?: unknown) {
  if (ok) {
    console.log(`  PASS ${what}`)
  } else {
    failures++
    console.log(`  FAIL ${what}${saw === undefined ? '' : ` — saw ${JSON.stringify(saw)}`}`)
  }
}

console.log('a camera or film is named the way it is spoken')

// The two storage conventions, side by side in the real catalog.
check(
  'a name carrying its maker is left alone',
  displayName({ name: 'Canon AE-1 Program', brand: 'Canon' }) === 'Canon AE-1 Program',
  displayName({ name: 'Canon AE-1 Program', brand: 'Canon' })
)
check(
  'a bare model gets its maker in front',
  displayName({ name: 'F4', brand: 'Nikon' }) === 'Nikon F4',
  displayName({ name: 'F4', brand: 'Nikon' })
)
check(
  'a bare speed is never shown alone',
  displayName({ name: '400', brand: 'Fujifilm' }) === 'Fujifilm 400',
  displayName({ name: '400', brand: 'Fujifilm' })
)

// Prefix matching is case-insensitive, or a shouted name doubles its maker.
check(
  'case does not make it repeat',
  displayName({ name: 'KODAK Gold 200', brand: 'Kodak' }) === 'KODAK Gold 200',
  displayName({ name: 'KODAK Gold 200', brand: 'Kodak' })
)

// A maker named in a longer form than the one the product leads with. Comparing
// the leading word catches it; a plain prefix test does not.
check(
  'a longer maker form does not double up',
  displayName({ name: 'Lucky Color 400', manufacturer: 'Lucky Film (乐凯)' }) === 'Lucky Color 400',
  displayName({ name: 'Lucky Color 400', manufacturer: 'Lucky Film (乐凯)' })
)

// A genuinely different maker still gets prepended: Harman coats Kentmere.
check(
  'a different maker is still named',
  displayName({ name: 'Kentmere 400', manufacturer: 'Harman' }) === 'Harman Kentmere 400',
  displayName({ name: 'Kentmere 400', manufacturer: 'Harman' })
)

// A house film whose name is the maker, and a record with no maker at all.
check(
  'a name that is its own maker stays once',
  displayName({ name: 'Lomography', brand: 'Lomography' }) === 'Lomography',
  displayName({ name: 'Lomography', brand: 'Lomography' })
)
check(
  'no maker recorded leaves the name as it is',
  displayName({ name: 'Widelux F7' }) === 'Widelux F7',
  displayName({ name: 'Widelux F7' })
)
check('nothing to name is null', displayName(null) === null)

console.log('\nthe other names a thing is sold under')

// The bug this pins: the old filter kept only [a-z0-9], so an alias written
// wholly in another script became the empty string — and every name contains
// the empty string, so it was dropped as a duplicate of the name. Every
// Chinese, Japanese and Cyrillic alias in the catalog was invisible.
check(
  'a Chinese alias survives',
  usefulAliases('Lucky Color 400', ['乐凯']).length === 1,
  usefulAliases('Lucky Color 400', ['乐凯'])
)
check(
  'a Japanese alias survives',
  usefulAliases('Fujifilm Natura 1600', ['ナチュラ1600']).length === 1,
  usefulAliases('Fujifilm Natura 1600', ['ナチュラ1600'])
)
check(
  'a Cyrillic alias survives',
  usefulAliases('Svema Foto 200', ['Свема']).length === 1,
  usefulAliases('Svema Foto 200', ['Свема'])
)

// And it still drops what it is there to drop.
check(
  'an alias the name already says is dropped',
  usefulAliases('Canon AE-1 Program', ['canon ae-1 program']).length === 0
)
check(
  'a punctuation-only alias is dropped',
  usefulAliases('Any Film 400', ['---']).length === 0
)
check(
  'a distinct alias is kept',
  usefulAliases('Kodak Vision3 500T', ['5219']).length === 1
)

console.log(`\n  ${15 - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
