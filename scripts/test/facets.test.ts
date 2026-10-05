/**
 * Guards that a filter chip's count is what pressing it would show.
 *
 * The indexes counted every chip against the whole catalog, so with B&W
 * applied, Tungsten still showed a count and led to an empty page.
 *
 *   npx tsx scripts/test/facets.test.ts
 */
import { applyFacets, type Facet } from '../../src/lib/facets'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

interface Film { name: string; process: string; balance: string | null }

const films: Film[] = [
  { name: 'Gold', process: 'C-41', balance: 'Daylight' },
  { name: 'Portra', process: 'C-41', balance: 'Daylight' },
  { name: '800T', process: 'C-41', balance: 'Tungsten' },
  { name: '500T', process: 'ECN-2', balance: 'Tungsten' },
  { name: 'HP5', process: 'B&W', balance: null },
]

const facets = (process?: string, balance?: string): Facet<Film>[] => [
  { key: 'process', active: process, valueOf: f => f.process },
  { key: 'balance', active: balance, valueOf: f => f.balance },
]

const none = applyFacets(films, facets())
check('nothing applied matches everything', none.matches.length, 5)
check('counts against the whole catalog', none.counts.balance, { Daylight: 2, Tungsten: 2 })
check('present values, most common first', none.present.process, ['C-41', 'ECN-2', 'B&W'])
check('a record with no value is not counted', none.present.balance, ['Daylight', 'Tungsten'])

const bw = applyFacets(films, facets('B&W'))
check('B&W leaves one match', bw.matches.map(f => f.name), ['HP5'])
check('with B&W applied, no balance would match', bw.counts.balance, {})
check('a group ignores its own filter', bw.counts.process, { 'C-41': 3, 'ECN-2': 1, 'B&W': 1 })
check('present values do not narrow', bw.present.balance, ['Daylight', 'Tungsten'])

const tungsten = applyFacets(films, facets(undefined, 'Tungsten'))
check('Tungsten narrows process counts', tungsten.counts.process, { 'C-41': 1, 'ECN-2': 1 })

const both = applyFacets(films, facets('C-41', 'Tungsten'))
check('two filters intersect', both.matches.map(f => f.name), ['800T'])

interface Stock { name: string; formats: string[] }
const stocks: Stock[] = [
  { name: 'Gold', formats: ['35mm', '120'] },
  { name: 'UltraMax', formats: ['35mm'] },
  { name: 'HP5', formats: ['35mm', '120', '4x5'] },
]
const byFormat = (active?: string) => applyFacets(stocks, [{ key: 'format', active, valueOf: s => s.formats }])
check('a record counts under each of its values', byFormat().counts.format, { '35mm': 3, '120': 2, '4x5': 1 })
check('a multi-valued record matches any of them', byFormat('120').matches.map(s => s.name), ['Gold', 'HP5'])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
