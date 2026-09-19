/**
 * How the render limits are derived from the machine.
 *
 * These numbers were literals for a long time, and the bug they caused was a
 * silent one: the box went from three cores to six, every limit stayed where it
 * was, and nothing anywhere reported that the new cores were going unused. A
 * wrong answer here looks exactly like the hardware being slow, which is the
 * one failure a test is worth having for.
 *
 * The derivation takes its core count and its environment as arguments, so the
 * cases below run at sizes this machine does not have.
 *
 *   npx tsx scripts/test/capacity.test.ts
 */
import { deriveCapacity, readCores } from '../../src/lib/capacity'

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

/** Derive with no overrides set, whatever this process happens to have. */
const bare = (cores: number) => deriveCapacity(cores, {}, () => {})

function main() {
  console.log('the slot count leaves one core for the rest of the site')
  {
    check('three cores keep the two slots that were there before', bare(3).renderSlots === 2,
      `got ${bare(3).renderSlots}`)
    check('six cores give five', bare(6).renderSlots === 5, `got ${bare(6).renderSlots}`)
    check('twelve cores give eleven', bare(12).renderSlots === 11, `got ${bare(12).renderSlots}`)
  }

  console.log('\nthe floor holds on a machine too small to leave one free')
  {
    // An exclusive render claims every slot, and the priority rules need a
    // second slot to exist before a light caller can yield to it. One core
    // would otherwise derive one slot, and a heavy render would deadlock
    // against the rule meant to let it through.
    check('one core still gets two slots', bare(1).renderSlots === 2, `got ${bare(1).renderSlots}`)
    check('two cores still get two slots', bare(2).renderSlots === 2, `got ${bare(2).renderSlots}`)
  }

  console.log('\nlibvips gets the whole machine for one render')
  {
    check('concurrency is the core count', bare(6).sharpConcurrency === 6)
    check('and follows a smaller box down', bare(2).sharpConcurrency === 2)
  }

  console.log('\nan operator can override either number')
  {
    const pinned = deriveCapacity(6, { RENDER_SLOTS: '3', SHARP_CONCURRENCY: '4' }, () => {})
    check('the slot override is taken', pinned.renderSlots === 3, `got ${pinned.renderSlots}`)
    check('the concurrency override is taken', pinned.sharpConcurrency === 4, `got ${pinned.sharpConcurrency}`)

    const floored = deriveCapacity(6, { RENDER_SLOTS: '1' }, () => {})
    check('the floor still applies to an override', floored.renderSlots === 2, `got ${floored.renderSlots}`)
  }

  console.log('\na bad override is refused out loud rather than obeyed')
  {
    // Silence is the failure worth guarding against. Someone who sets a typo
    // and sees nothing will believe the box is tuned when it is not.
    for (const bad of ['abc', '0', '-2', '2.5']) {
      const warnings: string[] = []
      const got = deriveCapacity(6, { RENDER_SLOTS: bad }, message => warnings.push(message))
      check(
        `RENDER_SLOTS="${bad}" falls back to the derived five and warns`,
        got.renderSlots === 5 && warnings.length === 1 && warnings[0].includes(bad),
        `slots ${got.renderSlots}, ${warnings.length} warnings`,
      )
    }
  }

  console.log('\nan unset override is not a bad one')
  {
    const warnings: string[] = []
    const got = deriveCapacity(6, { RENDER_SLOTS: '', SHARP_CONCURRENCY: '  ' }, m => warnings.push(m))
    check('empty and blank read as absent, with no warning',
      got.renderSlots === 5 && got.sharpConcurrency === 6 && warnings.length === 0,
      `slots ${got.renderSlots}, concurrency ${got.sharpConcurrency}, ${warnings.length} warnings`)
  }

  console.log('\nthe real machine answers')
  {
    const cores = readCores()
    check('readCores returns a positive integer', Number.isInteger(cores) && cores > 0, `got ${cores}`)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
