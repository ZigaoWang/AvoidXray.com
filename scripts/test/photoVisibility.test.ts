/**
 * Guards who can see a photo while the automatic check has not cleared it.
 *
 * A new upload is public only once screening is CLEAR. Getting this wrong in
 * one direction shows a flagged photo to everyone; in the other it hides a
 * photographer's own upload from them while it waits.
 *
 *   npx tsx scripts/test/photoVisibility.test.ts
 */
import { canOpenPhotoPage, canViewPhoto } from '../../src/lib/photoVisibility'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const photo = (screening: string, visibility = 'PUBLIC') => ({ kind: 'COMMUNITY', userId: 'owner' as string | null, published: true, visibility, screening })

console.log('screening')
check('a cleared public photo is visible to a stranger', canViewPhoto(photo('CLEAR'), null), true)
for (const state of ['PENDING', 'HELD', 'REJECTED']) {
  check(`${state.toLowerCase()} is hidden from a stranger`, canViewPhoto(photo(state), 'someone'), false)
  check(`${state.toLowerCase()} is hidden when signed out`, canViewPhoto(photo(state), null), false)
  check(`${state.toLowerCase()} is visible to its owner`, canViewPhoto(photo(state), 'owner'), true)
  check(`${state.toLowerCase()} opens for an admin`, canOpenPhotoPage(photo(state), { id: 'admin', isAdmin: true }), true)
}
check('a private photo stays private once cleared', canViewPhoto(photo('CLEAR', 'PRIVATE'), 'someone'), false)

console.log('archive photos')
const archive = { ...photo('CLEAR'), kind: 'ARCHIVE', userId: null }
check('an archive photo is not a community photo to anyone', [null, 'someone'].map(v => canViewPhoto(archive, v)), [false, false])
check('a signed-out viewer never matches an ownerless photo', canViewPhoto({ ...photo('HELD'), userId: null }, null), false)
check('a published archive photo has a public page', canOpenPhotoPage(archive, null), true)
check('an unpublished archive photo opens for an admin only',
  [canOpenPhotoPage({ ...archive, published: false }, null), canOpenPhotoPage({ ...archive, published: false }, { id: 'admin', isAdmin: true })],
  [false, true])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
