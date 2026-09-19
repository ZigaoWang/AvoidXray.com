/**
 * What the server decided about the machine, said once at startup.
 *
 * This exists because of a failure that took a while to see: the box was
 * resized from three cores to six, nothing got faster, and there was no way to
 * tell from outside whether the new cores had been picked up or whether the
 * work was simply somewhere else. The numbers in src/lib/capacity.ts are
 * derived now, which makes them correct and also makes them invisible, so they
 * are printed where a deploy log will keep them.
 *
 * Imported dynamically and only under the Node runtime. capacity.ts reads
 * node:os, which does not exist on the edge, and a static import would pull it
 * into that bundle whether or not this branch ever runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { describeCapacity } = await import('./lib/capacity')
  console.log(describeCapacity())
}
