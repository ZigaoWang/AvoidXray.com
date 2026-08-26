/**
 * The duplicate check stands between someone adding a film stock or camera and
 * the catalogue everyone tags their photographs against. Warning about a real
 * product is worse than missing a duplicate: it either sends the contributor
 * away or has them pick the wrong stock.
 *
 *   npx tsx scripts/test/duplicateDetection.test.ts
 */
import { productSimilarity, findPotentialDuplicates, normalizeString } from '../../src/lib/duplicateDetection'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  ${detail}`}`)
}

const same = (a: string, b: string, want: boolean) => {
  const score = productSimilarity(a, b)
  // 0.6 is the threshold the check-duplicates routes pass.
  check(`${want ? 'same' : 'different'}: ${a} / ${b}`, (score >= 0.6) === want, `scored ${(score * 100).toFixed(0)}%`)
}

console.log('duplicate detection')

// Every one of these is a real, separate product in the live catalogue that
// plain edit distance scored 83-93% alike.
same('Kodak Gold 200', 'Kodak Gold 800', false)
same('Lucky Color 200', 'Lucky Color 400', false)
same('Kodak Vision3 500T', 'Kodak Vision3 250D', false)
same('Kodak Portra 400', 'Kodak Portra 800', false)
same('Nikon F2', 'Nikon F3', false)
same('Ilford Delta 100', 'Ilford Delta 3200', false)

// A speed alone still has to separate two otherwise identical names.
same('Portra 400', 'Portra 160', false)

// Duplicates the check still has to catch: the designator agrees and only the
// wording around it differs.
same('Kodak Portra 400', 'Portra 400', true)
same('Fuji Superia 400', 'Fujifilm Superia 400', true)
same('Kodak Ultramax 400', 'Kodak Ultra Max 400', true)
same('Canon AE-1', 'Canon AE1', true)
same('ILFORD HP5', 'ilford hp5', true)

// Names with no digits at all fall through to edit distance as before.
same('Kodak Ektar', 'Kodak Ektarr', true)
same('Leica M', 'Nikon FM', false)

check('identical strings score 1', productSimilarity('Kodak Gold 200', 'Kodak Gold 200') === 1)
check('punctuation and case are ignored', normalizeString('Ilford HP5+') === 'ilford hp5')

// An empty side cannot be a duplicate of anything.
check('empty name matches nothing', productSimilarity('', 'Kodak Gold 200') === 0)

// The route hands in brand and name separately and joins them.
const catalogue = [
  { id: 'a', name: 'Gold 200', brand: 'Kodak' },
  { id: 'b', name: 'Gold 800', brand: 'Kodak' },
  { id: 'c', name: 'Superia 400', brand: 'Fujifilm' },
]

const forGold800 = findPotentialDuplicates({ name: 'Gold 800', brand: 'Kodak' }, catalogue, 5, 0.6)
check('adding a stock that exists is flagged', forGold800.some(d => d.id === 'b'))
check('the other speed is not flagged alongside it', !forGold800.some(d => d.id === 'a'),
  `got ${JSON.stringify(forGold800.map(d => d.id))}`)

const forNewStock = findPotentialDuplicates({ name: 'Gold 400', brand: 'Kodak' }, catalogue, 5, 0.6)
check('a genuinely new speed is not blocked', forNewStock.length === 0,
  `got ${JSON.stringify(forNewStock.map(d => d.id))}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
