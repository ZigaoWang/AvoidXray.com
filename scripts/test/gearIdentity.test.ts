/**
 * A camera or a film reads the same way whoever typed its name.
 *
 * The catalog stores one idea two ways: "Canon AE-1 Program" with brand Canon,
 * and "F4" with brand Nikon. The display layer used to pass that difference
 * straight through, so a grid came out with a brand line over some cards and
 * not others, and with the brand inside some titles and not others.
 *
 * `brandLine` and `modelName` are the pair that ends it, and the guards are
 * what make them safe on real records: a brand that is the start of a longer
 * word must not cut into it, matching is case insensitive, and a name that is
 * nothing but its brand still has to print something.
 *
 * `displayName` composes the full name for alt text, feeds, chips and the
 * document title, and is checked here too because it is the thing that must
 * NOT have changed.
 *
 *   npx tsx scripts/test/gearIdentity.test.ts
 */
import { brandLine, displayName, modelName } from '../../src/lib/seo/alt'

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

console.log('both spellings of the same idea come out as one shape')
{
  const withBrandInName = { name: 'Canon AE-1 Program', brand: 'Canon' }
  const withoutBrandInName = { name: 'F4', brand: 'Nikon' }

  check('a name carrying its brand loses it', modelName(withBrandInName) === 'AE-1 Program', modelName(withBrandInName))
  check('a name without it is left alone', modelName(withoutBrandInName) === 'F4', modelName(withoutBrandInName))
  check('both get a brand line', brandLine(withBrandInName) === 'Canon' && brandLine(withoutBrandInName) === 'Nikon')
}

console.log('the guards')
{
  // "Canon" must not leave "et QL17".
  check(
    'a brand that starts a longer word does not cut into it',
    modelName({ name: 'Canonet QL17', brand: 'Canon' }) === 'Canonet QL17'
  )
  check(
    'case does not decide it',
    modelName({ name: 'KODAK Gold 200', brand: 'Kodak' }) === 'Gold 200'
  )
  check(
    'punctuation in a brand is matched, not read as a pattern',
    modelName({ name: 'Yes!Star 400', brand: 'Yes!Star' }) === '400'
  )
  check(
    'a name that is its own brand keeps its name',
    modelName({ name: 'Lomography', brand: 'Lomography' }) === 'Lomography'
  )
  check(
    'and prints one line rather than the word twice',
    brandLine({ name: 'Lomography', brand: 'Lomography' }) === null
  )
  check('an unattributed record has no line', brandLine({ name: 'F4' }) === null)
  check('and keeps its whole name', modelName({ name: 'F4' }) === 'F4')
}

console.log('the brand, not whoever coats it')
{
  // Harman coats Kentmere. The eyebrow and the title disagreeing about whose
  // film it is was the bug; the film page states the coater in its own row.
  const kentmere = { name: 'Kentmere 400', brand: 'Kentmere', manufacturer: 'Harman' }
  check('the box name leads', brandLine(kentmere) === 'Kentmere')
  check('and the model follows it', modelName(kentmere) === '400')
  check(
    'manufacturer still answers when nothing else does',
    brandLine({ name: 'Gold 200', manufacturer: 'Kodak' }) === 'Kodak'
  )
}

console.log('displayName still composes the full name')
{
  check('a name carrying its brand is not doubled', displayName({ name: 'Canon AE-1 Program', brand: 'Canon' }) === 'Canon AE-1 Program')
  check('a name missing it gets it', displayName({ name: 'F4', brand: 'Nikon' }) === 'Nikon F4')
  check('the manufacturer still wins there', displayName({ name: 'Kentmere 400', manufacturer: 'Harman', brand: 'Kentmere' }) === 'Harman Kentmere 400')
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
