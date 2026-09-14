/**
 * How the photo manager asks for somebody's own photos.
 *
 * Two things here are easy to get quietly wrong, and neither fails loudly.
 *
 * A search that matches fewer columns than the box promises: it matched
 * captions alone, and 206 of the library's 1076 photographs have one, so for
 * four frames in five the box could not find anything at all — which reads as
 * "I have no photos of that" rather than as a broken filter.
 *
 * And an order with no unique tiebreak. `createdAt` is shared across a bulk
 * upload and `takenDate` by every frame on a roll, so paging on either alone
 * lets one row appear on two pages while another appears on none. That looks
 * like losing photographs and is not.
 *
 *   npx tsx scripts/test/myPhotos.test.ts
 */
import {
  myPhotosOrder,
  myPhotosWhere,
  parseMyPhotosQuery,
  type MyPhotosSort,
} from '../../src/lib/myPhotos'

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

const query = (over: Partial<ReturnType<typeof parseMyPhotosQuery>> = {}) => ({
  search: '', filter: '', cameraId: '', filmStockId: '', year: 0, sort: 'uploaded' as MyPhotosSort, ...over,
})

/** Every leaf key mentioned anywhere in a where clause, however nested. */
function keysIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) { node.forEach(n => keysIn(n, found)); return found }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key)
      keysIn(value, found)
    }
  }
  return found
}

function main() {
  console.log('the search reaches what the box offers to search')
  {
    const where = myPhotosWhere('u1', query({ search: 'portra' }))
    const keys = keysIn(where)
    for (const column of ['caption', 'camera', 'filmStock']) {
      check(`matches ${column}`, keys.has(column))
    }
    check('every branch is case insensitive',
      JSON.stringify(where).split('contains').length - 1 === JSON.stringify(where).split('insensitive').length - 1)
  }

  console.log('\nnarrowings combine rather than replace each other')
  {
    // Both of these are themselves an OR. Spread onto one object the second
    // key silently wins, so searching with Missing gear lit returned everything
    // missing gear whether or not it matched the search.
    const where = myPhotosWhere('u1', query({ search: 'portra', filter: 'untagged' }))
    const and = (where as { AND?: unknown[] }).AND
    check('both survive as separate clauses', Array.isArray(and) && and.length === 2,
      JSON.stringify(where))
    check('the search is still in there', keysIn(where).has('caption'))
    check('so is the missing gear', JSON.stringify(where).includes('cameraId'))
  }

  console.log('\nevery narrowing is actually applied')
  {
    const cases: [string, Partial<ReturnType<typeof parseMyPhotosQuery>>, string][] = [
      ['camera', { cameraId: 'cam_1' }, 'cam_1'],
      ['film', { filmStockId: 'film_1' }, 'film_1'],
      ['year', { year: 2026 }, 'takenDate'],
      ['drafts', { filter: 'drafts' }, 'published'],
      ['private', { filter: 'private' }, 'PRIVATE'],
    ]
    for (const [name, part, needle] of cases) {
      check(`${name} narrows the query`, JSON.stringify(myPhotosWhere('u1', query(part))).includes(needle))
    }
    check('nothing selected narrows nothing',
      JSON.stringify(myPhotosWhere('u1', query())) === JSON.stringify({ userId: 'u1' }))
  }

  console.log('\na year is a half open range, so it cannot take the next one')
  {
    const where = JSON.stringify(myPhotosWhere('u1', query({ year: 2026 })))
    check('starts on the first of January', where.includes('2026-01-01T00:00:00.000Z'))
    check('stops before the next first of January', where.includes('2027-01-01T00:00:00.000Z'))
  }

  console.log('\nevery order ends in something unique')
  {
    for (const sort of ['uploaded', 'taken', 'oldest'] as MyPhotosSort[]) {
      const order = myPhotosOrder(sort)
      const last = order[order.length - 1]
      check(`${sort} breaks its ties on the id`, 'id' in last, JSON.stringify(order))
      check(`${sort} is not ordered by the id alone`, order.length > 1)
    }
    check('date taken puts the undated last',
      JSON.stringify(myPhotosOrder('taken')).includes('"nulls":"last"'))
  }

  console.log('\nthe query is read from the URL as it is written to it')
  {
    const parsed = parseMyPhotosQuery(new URLSearchParams(
      'search=%20portra%20&filter=drafts&cameraId=c1&filmStockId=f1&year=2026&sort=taken'
    ))
    check('the search is trimmed', parsed.search === 'portra', JSON.stringify(parsed.search))
    check('the year is a number', parsed.year === 2026)
    check('the sort is carried', parsed.sort === 'taken')

    const junk = parseMyPhotosQuery(new URLSearchParams('year=banana&sort=sideways'))
    check('a year that is not one means any year', junk.year === 0)
    check('a sort that is not one falls back', junk.sort === 'uploaded')
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
