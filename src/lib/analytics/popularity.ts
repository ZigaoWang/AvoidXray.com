/**
 * The most-read pages, as counted from the access log by
 * scripts/build-popularity.ts.
 *
 * A file rather than a table, deliberately. This is a derived report that can
 * be regenerated from the log at any time, it is read by exactly one admin
 * screen, and it would otherwise be a schema migration and a nightly write of
 * rows nothing joins against. Deleting the file loses nothing.
 *
 * Server only; it reads the filesystem.
 */

import fs from 'node:fs/promises'

export type Ranked = {
  key: string
  label: string
  sublabel: string | null
  href: string
  views: number
  visitors: number
}

export type PopularityReport = {
  generatedAt: string
  source: string
  from: string | null
  to: string | null
  totals: { lines: number; people: number }
  photos: Ranked[]
  films: Ranked[]
  cameras: Ranked[]
  users: Ranked[]
}

const FILE = process.env.POPULARITY_FILE || '/var/lib/avoidxray/popularity.json'

/**
 * Null when the report has never been generated, which is the normal state on
 * a laptop and on a fresh deploy. The page says so rather than erroring: a
 * missing derived file is a thing to go and generate, not a fault.
 */
export async function readPopularity(): Promise<PopularityReport | null> {
  try {
    // turbopackIgnore tells the bundler not to trace this read.
    //
    // The path is an absolute location outside the repository, resolved at
    // runtime. Without the hint, static analysis cannot prove that, assumes the
    // read might reach a project file, and traces the entire project — public/
    // included — into the server output. That is several hundred megabytes of
    // photographs and fonts copied into the build to satisfy one JSON read of a
    // file that is not in the project at all.
    return JSON.parse(
      await fs.readFile(/* turbopackIgnore: true */ FILE, 'utf8'),
    ) as PopularityReport
  } catch {
    return null
  }
}

export const popularityPath = FILE
