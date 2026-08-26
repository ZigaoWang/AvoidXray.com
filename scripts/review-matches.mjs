/**
 * Builds a side-by-side review page for scan matches that need human eyes.
 *
 * The matcher settles most cases on its own, but two kinds it should not:
 * a hash that agrees on shape without being emphatic, and a roll containing
 * near-identical frames one exposure apart, where the runner-up is nearly as
 * close as the winner. Deciding those from numbers is guesswork; deciding them
 * by looking takes a second each.
 *
 * Output is a single self-contained HTML file with the images inlined as
 * base64. That matters: a page referencing local files by path is blocked or
 * broken depending on the browser, and one referencing the live site would
 * show a picture that is about to be replaced.
 *
 *   node scripts/review-matches.mjs --report=/tmp/match-final.json --out=review.html
 *   node scripts/review-matches.mjs --report=... --include=no-match   # also show misses
 */
import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

/** Wide enough to judge a frame, small enough that 12 fit in one file. */
const PANEL_WIDTH = 460

function arg(name, fallback = null) {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

/** A base64 data URL for a panel, from a local path or a remote URL. */
async function panel(source) {
  try {
    const input = /^https?:\/\//.test(source)
      ? Buffer.from(await fetch(source).then((r) => r.arrayBuffer()))
      : source

    const buffer = await sharp(input, { limitInputPixels: 300_000_000 })
      .rotate()
      .resize(PANEL_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()

    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch (error) {
    console.error(`[review] could not render ${source}: ${error.message}`)
    return null
  }
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function cell(title, subtitle, dataUrl, tone = '') {
  const img = dataUrl
    ? `<img src="${dataUrl}" alt="${escapeHtml(title)}">`
    : `<div class="missing">could not load</div>`
  return `<figure class="${tone}">
      <figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></figcaption>
      ${img}
    </figure>`
}

async function main() {
  const reportPath = arg('report', 'match-report.json')
  const outPath = arg('out', 'review.html')
  const extra = (arg('include', '') || '').split(',').filter(Boolean)

  const statuses = new Set(['needs-review', 'ambiguous', ...extra])
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const rows = report.filter((r) => statuses.has(r.status))

  console.log(`[review] rendering ${rows.length} cases (${[...statuses].join(', ')})`)

  const sections = []
  for (const [index, row] of rows.entries()) {
    const candidate = row.match ?? row.bestCandidate
    const [stored, bestImg, runnerImg] = await Promise.all([
      panel(row.url),
      candidate ? panel(candidate.file) : null,
      row.runnerUp ? panel(row.runnerUp.file) : null,
    ])

    const shortPath = (p) => p.split('/').slice(-2).join('/')

    sections.push(`<section>
      <h2>${index + 1}. <span class="status ${row.status}">${row.status}</span> <code>${escapeHtml(row.photoId)}</code></h2>
      <div class="row">
        ${cell('Currently on the site', row.storedSize, stored, 'current')}
        ${candidate ? cell('Best candidate', `${shortPath(candidate.file)} · ${candidate.size} · distance ${candidate.distance}`, bestImg, 'best') : ''}
        ${row.runnerUp ? cell('Runner-up', `${shortPath(row.runnerUp.file)} · distance ${row.runnerUp.distance}`, runnerImg, 'runner') : ''}
      </div>
      <p class="paths">best: <code>${escapeHtml(candidate ? candidate.file : 'none')}</code></p>
    </section>`)
  }

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Scan match review</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0a0a0a; color:#e5e5e5; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin:0; padding:32px; }
  h1 { font-size:26px; margin:0 0 4px; }
  .lede { color:#888; margin:0 0 28px; max-width:60ch; }
  section { border-top:1px solid #262626; padding:24px 0; }
  h2 { font-size:15px; font-weight:600; margin:0 0 14px; display:flex; align-items:center; gap:10px; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; color:#9a9a9a; }
  .status { font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding:3px 8px; border-radius:3px; }
  .status.ambiguous { background:#7c4a00; color:#ffd8a8; }
  .status.needs-review { background:#0b4f6c; color:#b3e5fc; }
  .status.no-match { background:#5a1e1e; color:#ffc9c9; }
  .row { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
  figure { margin:0; max-width:${PANEL_WIDTH}px; }
  figure img { width:100%; height:auto; display:block; border:1px solid #333; }
  figure.current img { border-color:#555; }
  figure.best img { border-color:#2e7d32; }
  figure.runner img { border-color:#8a6d3b; }
  figcaption { display:flex; flex-direction:column; gap:2px; margin-bottom:6px; }
  figcaption strong { font-size:12px; font-weight:600; }
  figcaption span { font-size:11px; color:#8a8a8a; font-family:ui-monospace,monospace; }
  .missing { padding:40px; text-align:center; color:#777; border:1px dashed #444; }
  .paths { margin:10px 0 0; font-size:11px; color:#666; word-break:break-all; }
</style>
<h1>Scan match review</h1>
<p class="lede">The left frame is what the site serves now. Compare it with the candidate original.
<strong>Ambiguous</strong> means the runner-up was nearly as close — check whether the best or the runner-up is the same frame.
<strong>Needs review</strong> means proportions agree but the hash was not emphatic.</p>
${sections.join('\n')}
`

  await writeFile(outPath, html)
  console.log(`[review] wrote ${outPath}`)
}

main().catch((error) => {
  console.error('[review] failed:', error)
  process.exit(1)
})
