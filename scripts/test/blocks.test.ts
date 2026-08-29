/**
 * Guards the shape of the block filter.
 *
 * Blocking was a read-side filter that several pages simply never applied:
 * explore and /api/photos narrowed by it, while the film, camera and search
 * pages did not, so a blocked account stayed visible everywhere except the
 * feed. The fix routes every caller through `hiddenFilter`, and what makes
 * that safe is the fragment composing correctly when it is spread next to
 * PUBLIC_PHOTO — including the common case where it is empty.
 *
 * Kept to the pure shaping function on purpose: the queries around it need a
 * database, this does not, and the shape is where the mistakes were.
 *
 *   npx tsx scripts/test/blocks.test.ts
 */
import { hiddenFilter, blockedFromInteracting } from '../../src/lib/blocks'
import { PUBLIC_PHOTO } from '../../src/lib/photoVisibility'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

console.log('block filter')

// No session, or a viewer who has blocked nobody. This is the overwhelming
// majority of requests, and it must not add a filter for Postgres to evaluate.
check('empty list produces no filter', hiddenFilter([]), {})

check('one id excludes that id', hiddenFilter(['u1']), { userId: { notIn: ['u1'] } })
check('several ids are all excluded', hiddenFilter(['u1', 'u2']), {
  userId: { notIn: ['u1', 'u2'] },
})

// The reason the empty case matters: spreading it must leave the visibility
// rule exactly as it was, with no stray `userId` key.
check(
  'empty filter spreads without disturbing PUBLIC_PHOTO',
  { ...PUBLIC_PHOTO, ...hiddenFilter([]) },
  { published: true, visibility: 'PUBLIC' },
)

// And a populated one must narrow rather than replace: losing `published` or
// `visibility` here would publish every private photo on the page.
check(
  'populated filter narrows PUBLIC_PHOTO rather than replacing it',
  { ...PUBLIC_PHOTO, ...hiddenFilter(['u1']) },
  { published: true, visibility: 'PUBLIC', userId: { notIn: ['u1'] } },
)

// Callers spread this into an object they keep using, so it must not alias the
// array it was handed.
const ids = ['u1']
const filter = hiddenFilter(ids)
ids.push('u2')
check('does not alias the caller array', filter, { userId: { notIn: ['u1'] } })

// Not top-level await: the runner transpiles these to CJS, which rejects it.
async function main() {
  console.log('interaction guard')

  // Reached on every self-directed action — liking your own photo, commenting
  // on it. Answering true would break the site for everyone, and it is the one
  // branch that resolves without touching the database.
  check('you are never blocked from yourself', await blockedFromInteracting('u1', 'u1'), false)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
