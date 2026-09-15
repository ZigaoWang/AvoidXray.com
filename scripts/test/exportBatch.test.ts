/**
 * What a batch export says about an archive that is short of the selection.
 *
 * This is the only account anybody gets. A browser's own download indicator
 * reports that a file arrived and says nothing about what is missing from it,
 * so a batch that drops four frames is otherwise found out about months later.
 *
 * The thing worth testing is the order. More than one of these is true at once
 * routinely — a run that hit its size limit after two failed renders both
 * skipped and filled — and only the cause that actually decided the length of
 * the archive is worth reading. Naming the wrong one is worse than saying
 * nothing, because it sends somebody looking for a fault that is not there.
 *
 *   npx tsx scripts/test/exportBatch.test.ts
 */
import { describeBatch, MAX_BATCH, type BatchOutcome } from '../../src/lib/exportBatch'
import { LIMITS } from '../../src/lib/rateLimitPolicy'

let pass = 0
let fail = 0

function check(name: string, condition: boolean | undefined, detail = '') {
  if (condition) {
    pass++
    console.log(`  PASS ${name}`)
  } else {
    fail++
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const outcome = (over: Partial<BatchOutcome> = {}): BatchOutcome => ({
  built: 24, total: 24, skipped: 0, stopped: false, full: false, refused: null, ...over,
})

function main() {
  console.log('a batch that did what it was asked says nothing')
  {
    check('nothing to explain', describeBatch(outcome()) === null,
      String(describeBatch(outcome())))
    check('one photograph is still nothing to explain',
      describeBatch(outcome({ built: 1, total: 1 })) === null)
  }

  console.log('\nan archive short of the selection explains itself')
  {
    const said = (over: Partial<BatchOutcome>) => describeBatch(outcome(over)) ?? ''
    check('a stop names what was kept',
      said({ built: 7, stopped: true }).includes('7 of 24'), said({ built: 7, stopped: true }))
    check('a stop does not read as a failure',
      !/could not/.test(said({ built: 7, stopped: true })))
    check('the size limit offers the way out',
      said({ built: 9, full: true }).includes('Post'), said({ built: 9, full: true }))
    check('a refusal carries the server\'s own words',
      said({ built: 3, refused: 'Too many exports from this connection.' })
        .startsWith('Too many exports from this connection.'))
    check('and says how much survived it',
      said({ built: 3, refused: 'Too many exports.' }).includes('3'))
  }

  console.log('\na count reads as a count of that many')
  {
    check('one skipped is singular',
      describeBatch(outcome({ built: 23, skipped: 1 }))?.includes('1 of 24 could not be rendered and is'),
      String(describeBatch(outcome({ built: 23, skipped: 1 }))))
    check('four skipped is plural',
      describeBatch(outcome({ built: 20, skipped: 4 }))?.includes('are not in the archive'))
    check('one photograph past the limit is singular',
      describeBatch(outcome({ built: 1, full: true }))?.includes('1 photograph.'),
      String(describeBatch(outcome({ built: 1, full: true }))))
    check('two are photographs',
      describeBatch(outcome({ built: 2, full: true }))?.includes('2 photographs.'))
  }

  console.log('\nwhen several are true, the one that decided the length wins')
  {
    // Every one of these is a real combination. A refused run has usually
    // skipped something first; a run that filled has usually been long enough
    // to lose a frame; a stop after a failure is two true things at once.
    const both = describeBatch(outcome({ built: 5, skipped: 2, full: true, stopped: true, refused: 'Server busy.' }))
    check('a refusal outranks the rest', both?.startsWith('Server busy.'), String(both))

    const filled = describeBatch(outcome({ built: 5, skipped: 2, full: true, stopped: true }))
    check('then the size limit', filled?.includes('size limit'), String(filled))

    const halted = describeBatch(outcome({ built: 5, skipped: 2, stopped: true }))
    check('then the stop', halted?.startsWith('Stopped at 5'), String(halted))

    const dropped = describeBatch(outcome({ built: 22, skipped: 2 }))
    check('and a plain skip last', dropped?.startsWith('2 of 24'), String(dropped))
  }

  console.log('\nnothing built at all still gets an answer')
  {
    check('a refusal is the whole message',
      describeBatch(outcome({ built: 0, refused: 'Too many exports.' })) === 'Too many exports.')
    check('a stop before the first says so',
      describeBatch(outcome({ built: 0, stopped: true }))?.includes('before anything'))
    check('everything failing asks for another go',
      describeBatch(outcome({ built: 0, skipped: 24 }))?.includes('try again'),
      String(describeBatch(outcome({ built: 0, skipped: 24 }))))
    check('and never claims an archive exists',
      !/archive holds/.test(describeBatch(outcome({ built: 0, skipped: 24 })) ?? ''))
  }

  console.log('\nthe batch stays inside what the route will serve')
  {
    // A batch is one request a frame with no pause between them, and the only
    // way to reach one is signed in through the photo manager. Raise the cap
    // past the allowance and a long run spends it partway down and collects
    // refusals for the rest — with room left over here for the previews that
    // went into choosing the look, which are charged to the same account.
    check('one press cannot outrun the allowance it is charged against',
      MAX_BATCH * 2 < LIMITS.watermark.perUser.limit,
      `${MAX_BATCH} against ${LIMITS.watermark.perUser.limit}`)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
