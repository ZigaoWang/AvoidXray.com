/**
 * Who gets to composite, and in what order.
 *
 * The export semaphore is the only thing standing between this box and two
 * forty-megapixel renders at once, and it has two callers now: a download,
 * which can need every slot, and the dialog, which asks for a preview on every
 * change and a contact sheet on every open. That mix is exactly where a
 * priority bug hides — the light work arrives continuously and the heavy work
 * arrives once, so a heavy caller that yields is a heavy caller that never
 * runs, and nothing about it would be visible except a download that
 * occasionally takes a very long time.
 *
 *   npx tsx scripts/test/renderSlot.test.ts
 */
import { withRenderSlot, Saturated, RENDER_QUEUE_LIMIT } from '../../src/lib/watermark/serverPipeline'
import { RENDER_SLOTS } from '../../src/lib/capacity'

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

/**
 * Occupy every slot, so anything asked for after this has to queue.
 *
 * Counted from the configured slot count rather than written as a literal. The
 * count is derived from the machine now, so it differs between a laptop and the
 * server, and a test that filled exactly two would quietly stop testing a queue
 * at all on anything larger: the callers meant to be waiting would simply run.
 */
function fillEverySlot(gate: { done: Promise<void> }) {
  return Array.from({ length: RENDER_SLOTS }, () =>
    withRenderSlot(false, async () => { await gate.done }),
  )
}

async function main() {
  console.log('a heavy render is not starved by a stream of light ones')
  {
    const order: string[] = []

    // One slot busy. The heavy caller needs all of them, so it parks.
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
    const running = fillEverySlot(gate)
    await settle()

    const queued: Promise<unknown>[] = []
    for (let i = 0; i < RENDER_QUEUE_LIMIT; i++) {
      queued.push(withRenderSlot(false, async () => {}))
      await settle()
    }

    let saturated = false
    try {
      await withRenderSlot(false, async () => {})
    } catch (error) {
      saturated = error instanceof Saturated
    }
    check('the caller past a full queue is turned away', saturated)

    gate.release()
    await Promise.all([...running, ...queued])
  }

  console.log('\nbulk work stands aside for anything somebody is waiting on')
  {
    const order: string[] = []

    // Every slot busy, so everything that follows has to queue.
    const gate = held()
    const running = fillEverySlot(gate)
    await settle()

    // The batch asks first. Arriving first is exactly what makes this worth
    // testing: without a priority it would be served first, and the visitor
    // behind it would wait on work nobody is watching.
    const batch = withRenderSlot(false, async () => { order.push('batch') }, true)
    await settle()
    const visitor = withRenderSlot(false, async () => { order.push('visitor') })
    await settle()

    gate.release()
    await Promise.all([...running, batch, visitor])

    check(
      'a preview that arrived second is composited first',
      order.join(',') === 'visitor,batch',
      `order was ${order.join(', ')}`
    )
  }

  console.log('\na batch does not make the rest of the site wait for it')
  {
    const order: string[] = []

    // One slot busy. A heavy batch frame needs every slot, so it parks, and a
    // heavy caller is the one thing light work yields to. It must not be, here: at
    // full resolution every frame of a batch is heavy, so a batch that claimed
    // that would stop the site compositing for its whole run.
    const holder = held()
    const holding = withRenderSlot(false, async () => { await holder.done })
    await settle()

    const heavyBatch = withRenderSlot(true, async () => { order.push('batch') }, true)
    await settle()
    const preview = withRenderSlot(false, async () => { order.push('preview') })
    await settle()

    holder.release()
    await Promise.all([holding, heavyBatch, preview])

    check(
      'a preview passes a heavy batch frame rather than queueing behind it',
      order[0] === 'preview',
      `order was ${order.join(', ')}`
    )
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
