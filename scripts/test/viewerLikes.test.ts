/**
 * Whether the viewer has liked a photograph travels with it.
 *
 * This is two guarantees that failed together.
 *
 * The first is a shape. Seven places hand photographs to the grid, and each
 * one had its own copy of "which of these did this account like" — a findMany
 * on Like, a Set of ids, a map over the page. Six of them had it. The seventh
 * was /api/photos, which is the endpoint every one of those six pages scrolls
 * through, so the first screen of a wall drew its hearts correctly and every
 * photograph below it came back unliked whatever the table said. That reads as
 * a like that did not save, which is the worst way for it to fail: the reader
 * presses it again, and the second press takes the like away.
 *
 * It is invisible to review, because the missing line is missing. So this
 * asserts the coupling directly: a file that asks for like counts is a file
 * handing photographs to a grid, and it must say whether they are liked too.
 *
 * The second is the arithmetic that reconciles a like made in this tab against
 * a page rendered before it. That one is testable directly.
 *
 *   npx tsx scripts/test/viewerLikes.test.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { likeTally } from '../../src/lib/likeState'

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

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.tsx?$/.test(entry)) found.push(path)
  }
  return found
}

function main() {
  console.log('a page that counts likes also says which are the viewer\'s')
  {
    const counting = sourceFiles('src')
      .map(path => ({ path, body: readFileSync(path, 'utf8') }))
      // The module where both live is the definition, not a caller.
      .filter(({ path, body }) => body.includes('withLikeCounts(') && !path.endsWith('lib/counts.ts'))

    check('the call sites were found at all', counting.length >= 6, String(counting.length))

    for (const { path, body } of counting) {
      // Either the shared helper, or the older hand-rolled form that sets the
      // field directly. Both put `liked` on the photograph; neither leaves it
      // to whatever the client happens to default to.
      const says = body.includes('withViewerLikes(') || /\bliked:\s/.test(body)
      check(`${path.replace('src/', '')} attaches liked`, says)
    }
  }

  console.log('\nthe grid falls back to unliked, so a missing field is silent')
  {
    // Why the check above has to exist rather than being caught at runtime.
    const grid = readFileSync('src/components/MasonryGrid.tsx', 'utf8')
    check('a photo without the field renders as unliked',
      /initialLiked=\{photo\.liked \|\| false\}/.test(grid))
  }

  console.log('\na like made in this tab survives a page rendered before it')
  {
    // The ordinary case: this tab has not touched the photograph, so the page
    // is taken exactly as it came.
    check('an untouched photo is left alone',
      likeTally(false, 12, undefined).liked === false && likeTally(false, 12, undefined).count === 12)
    check('an untouched liked photo is left alone',
      likeTally(true, 12, undefined).liked === true && likeTally(true, 12, undefined).count === 12)

    // A stale render: the page was built before the like, so the total has to
    // move by the one this tab added.
    const added = likeTally(false, 12, true)
    check('a like the render predates counts', added.liked === true && added.count === 13,
      JSON.stringify(added))
    const removed = likeTally(true, 12, false)
    check('an unlike the render predates discounts', removed.liked === false && removed.count === 11,
      JSON.stringify(removed))

    // A fresh render: the server already counted it, so shifting again would
    // show a photograph with one more like than it has.
    const fresh = likeTally(true, 13, true)
    check('a render that already counts it is not counted twice',
      fresh.liked === true && fresh.count === 13, JSON.stringify(fresh))
    const gone = likeTally(false, 12, false)
    check('a render that already dropped it is not dropped twice',
      gone.liked === false && gone.count === 12, JSON.stringify(gone))
  }

  console.log('\na count never reads below nothing')
  {
    // Reachable: a photograph with one like, rendered into a payload, unliked
    // in another tab, then unliked here from the stale page.
    check('unliking a zero does not go negative', likeTally(true, 0, false).count === 0,
      String(likeTally(true, 0, false).count))
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
