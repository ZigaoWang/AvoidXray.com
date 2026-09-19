/**
 * What this machine can do, read at startup rather than assumed.
 *
 * The render path used to size itself with literals chosen by hand for the box
 * it first ran on: `sharp.concurrency(2)`, `RENDER_SLOTS = 2`, and a set of
 * memory ceilings argued out in prose. Those numbers were right for the 3-core,
 * 2GB machine they were written against. That machine became a 6-core, 8GB one,
 * none of the literals moved, and so the resize bought nothing: libvips went on
 * splitting each render across two threads of six, and the semaphore went on
 * admitting two renders at a time on a box with room for more.
 *
 * Reading the hardware here makes the next resize a restart rather than a hunt
 * through every comment that mentions 2GB.
 *
 * Only the CPU-bound limits live here. The memory ceilings in sharpConfig.ts
 * and serverPipeline.ts cite peaks measured against real scans, and they stay
 * where they are until someone measures them again on the larger box.
 *
 * Server only. It reads node:os, which means nothing in a browser.
 */

import os from 'node:os'

export type Capacity = {
  /** Cores the process may use. */
  cores: number
  /** Renders admitted at once. */
  renderSlots: number
  /** libvips threads within a single render. */
  sharpConcurrency: number
}

/**
 * Cores this process may actually use.
 *
 * `availableParallelism` rather than `cpus().length`, because the first honors
 * a cgroup quota or a CPU affinity mask and the second reports what the host
 * has whatever the process was given. The two agree on a plain VPS and diverge
 * under a container, where trusting the wrong one oversubscribes the box
 * quietly and looks like the machine being slow.
 *
 * Falls back to one rather than to a guess. A machine that cannot say how many
 * cores it has should get the conservative answer, and RENDER_SLOTS has a floor
 * under it regardless.
 */
export function readCores(): number {
  const parallelism =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length

  return Number.isInteger(parallelism) && parallelism > 0 ? parallelism : 1
}

/**
 * The limits, from a core count and an environment.
 *
 * Pure, and takes both of its inputs, so the derivation can be tested at core
 * counts this machine does not have. The module constants below are the only
 * place the real ones are read.
 */
export function deriveCapacity(
  cores: number,
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn,
): Capacity {
  /**
   * An operator's override for a derived value.
   *
   * Two callers want this. The tests pin the numbers so that they assert the
   * same thing on a laptop and on the server, and an operator can retune a box
   * without waiting for a deploy. A value that is set but unusable is worth
   * complaining about: falling back in silence would leave someone certain they
   * had changed something when they had not.
   */
  const override = (name: string, derived: number): number => {
    const raw = env[name]
    if (raw === undefined || raw.trim() === '') return derived

    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1) {
      warn(`[capacity] ignoring ${name}="${raw}": expected a positive integer. Using ${derived}.`)
      return derived
    }
    return value
  }

  return {
    cores,

    /**
     * libvips threads per render.
     *
     * Parallelism inside one image operation, not across several: libvips
     * splits a resize, a composite or an encode across this many threads, so it
     * is what decides how long a single export takes. sharp's own default is
     * the core count. The 2 that stood here was a memory decision rather than a
     * CPU one, on a box where each extra thread's working set mattered more
     * than the seconds it saved.
     */
    sharpConcurrency: override('SHARP_CONCURRENCY', cores),

    /**
     * Renders admitted at once.
     *
     * One core is left for the rest of the site, which still has pages to serve
     * while somebody is exporting. That was the reasoning behind two slots on
     * three cores, and it is unchanged here. Only the number it counts from has
     * moved.
     *
     * Never below two whatever the machine reports, because an exclusive render
     * claims every slot at once and the priority rules in serverPipeline.ts
     * need a second slot to exist before a light caller can be said to yield
     * to it.
     */
    renderSlots: Math.max(2, override('RENDER_SLOTS', cores - 1)),
  }
}

const capacity = deriveCapacity(readCores())

export const CORES = capacity.cores
export const RENDER_SLOTS = capacity.renderSlots
export const SHARP_CONCURRENCY = capacity.sharpConcurrency

export const TOTAL_MEMORY_MB = Math.round(os.totalmem() / 1024 / 1024)

/**
 * One line for the log at startup, so a resize can be confirmed from outside.
 *
 * The failure this exists for is the one that prompted the whole module: a box
 * is resized, nothing appears to change, and there is no way to tell from the
 * running process whether the new cores were picked up or whether the work was
 * simply elsewhere.
 */
export function describeCapacity(): string {
  return `[capacity] ${CORES} cores, ${TOTAL_MEMORY_MB}MB total, ${RENDER_SLOTS} render slots, libvips concurrency ${SHARP_CONCURRENCY}`
}
