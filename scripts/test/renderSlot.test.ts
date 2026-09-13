/**
 * Who gets to composite, and in what order.
 *
 * The export semaphore is the only thing standing between this box and two
 * forty-megapixel renders at once, and it has two callers now: a download,
 * which can need both slots, and the dialog, which asks for a preview on every
 * change and a contact sheet on every open. That mix is exactly where a
 * priority bug hides — the light work arrives continuously and the heavy work
 * arrives once, so a heavy caller that yields is a heavy caller that never
 * runs, and nothing about it would be visible except a download that
 * occasionally takes a very long time.
 *
 *   npx tsx scripts/test/renderSlot.test.ts
 */
import { withRenderSlot, Saturated } from '../../src/lib/watermark/serverPipeline'

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

/** A job that finishes when it is told to, so the ordering is deterministic. */
function held() {
  let release!: () => void
  const done = new Promise<void>(resolve => { release = resolve })
  return { done, release }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function main() {
  console.log('a heavy render is not starved by a stream of light ones')
  {
    const order: string[] = []

    // One slot busy, one free. The heavy caller needs both, so it parks.
    const holder = held()
    const holding = withRenderSlot(false, async () => { await holder.done; order.push('holder') })
    await settle()

    const heavy = withRenderSlot(true, async () => { order.push('heavy') })
    await settle()

    // Now the dialog carries on, and this is the shape that starves it: each
    // preview overlaps the last, so there is always one slot taken and never
    // two free at the same instant. Releasing the holder does not help, because
    // the next preview has already taken the slot it freed.
    const light: Promise<void>[] = []
    const gates: { done: Promise<void>; release: () => void }[] = []
    for (let i = 0; i < 6; i++) {
      const gate = held()
      gates.push(gate)
      light.push(withRenderSlot(false, async () => { await gate.done; order.push(`light-${i}`) }))
      await settle()
      // The previous one finishes only after the next has asked for a slot.
      if (i === 0) { holder.release(); await settle() }
      else { gates[i - 1].release(); await settle() }
    }
    gates[gates.length - 1].release()
    await Promise.all([holding, heavy, ...light])

    const heavyAt = order.indexOf('heavy')
    const lightBefore = order.filter((name, at) => name.startsWith('light-') && at < heavyAt).length
    check(
      'the heavy render is not overtaken by previews that arrived after it',
      heavyAt !== -1 && lightBefore === 0,
      `order was ${order.join(', ')}`
    )
  }

  console.log('\nthe queue is still bounded')
  {
    const gate = held()
    const running = [
      withRenderSlot(false, async () => { await gate.done }),
      withRenderSlot(false, async () => { await gate.done }),
    ]
    await settle()

    const queued: Promise<unknown>[] = []
    for (let i = 0; i < 8; i++) {
      queued.push(withRenderSlot(false, async () => {}))
      await settle()
    }

    let saturated = false
    try {
      await withRenderSlot(false, async () => {})
    } catch (error) {
      saturated = error instanceof Saturated
    }
    check('the ninth caller past a full queue is turned away', saturated)

    gate.release()
    await Promise.all([...running, ...queued])
  }

  console.log('\nevery slot is handed back, however the work ends')
  {
    // A throw inside the work must not leak the count, or the semaphore closes
    // permanently and every later export waits forever.
    for (let i = 0; i < 4; i++) {
      await withRenderSlot(i % 2 === 0, async () => { throw new Error('render failed') }).catch(() => {})
    }
    let ran = false
    await withRenderSlot(true, async () => { ran = true })
    check('an exclusive render still runs after four failures', ran)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
