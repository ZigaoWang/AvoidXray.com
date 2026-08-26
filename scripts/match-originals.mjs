/**
 * Matches local scan files to the photo records they were uploaded as.
 *
 * The old upload pipeline resized originals to a 2000px long edge, so 259
 * photos on the site are stored at a fraction of the quality that was scanned.
 * Replacing them means knowing which file on disk corresponds to which row —
 * and the schema never stored the uploaded filename, so there is no direct
 * link to follow.
 *
 * What does link them is the picture itself. The stored copy is a downscale of
 * the local file, so a perceptual hash of both lands in the same place: dHash
 * reduces each image to a 64-bit signature of relative brightness, which
 * survives rescaling and re-encoding but differs sharply between photographs.
 *
 * This script only reads. It downloads stored thumbnails, hashes both sides,
 * and writes a report for review. Nothing is uploaded and no row is touched.
 *
 *   node scripts/match-originals.mjs --scans="/path/to/Desktop" --out=report.json
 *   node scripts/match-originals.mjs --scans=... --limit=20   # sample first
 */
import { readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Hamming distance below which two images are considered the same picture.
 *
 * A dHash of the same photograph at different resolutions typically lands
 * within a handful of bits; unrelated photographs sit near 32, which is what
 * random chance gives you on 64 bits. Ten is comfortably inside that gap.
 */
const MATCH_THRESHOLD = 10

/**
 * How far the best match must beat the runner-up to be trusted automatically.
 *
 * Rolls contain near-identical frames — the same scene one exposure apart — so
 * a close second is a genuine signal that a human should look, not noise.
 */
const AMBIGUITY_MARGIN = 4

/**
 * Difference hash.
 *
 * Grayscale, downsampled to 9x8, then each pixel compared with its right-hand
 * neighbour: 8 comparisons per row over 8 rows is 64 bits. Encodes structure
 * rather than absolute colour, so exposure and compression differences do not
 * move it much.
 */
async function dHash(input) {
  const { data } = await sharp(input, { limitInputPixels: 300_000_000 })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bits = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i = row * 9 + col
      bits.push(data[i] > data[i + 1] ? 1 : 0)
    }
  }
  return bits
}

function hamming(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

function arg(name, fallback = null) {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

const IMAGE_EXTENSIONS = /\.(jpe?g|tiff?|png|heic)$/i

/**
 * Every image file under `root`, recursively, ignoring junk.
 *
 * Symlinks are resolved rather than skipped: a dirent for a link reports as
 * neither file nor directory, so relying on the dirent type alone silently
 * walks straight past a folder of scans that happens to be linked in.
 * `visited` guards against a link that points back up its own tree.
 */
async function findImages(root, visited = new Set()) {
  const out = []

  async function walk(dir) {
    const real = await stat(dir).then((s) => s, () => null)
    if (!real) return
    const key = `${real.dev}:${real.ino}`
    if (visited.has(key)) return
    visited.add(key)

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)

      let isDir = entry.isDirectory()
      if (entry.isSymbolicLink()) {
        const target = await stat(full).catch(() => null)
        if (!target) continue
        isDir = target.isDirectory()
      }

      if (isDir) await walk(full)
      else if (IMAGE_EXTENSIONS.test(entry.name)) out.push(full)
    }
  }

  await walk(root)
  return out
}

async function main() {
  const scansRoot = arg('scans')
  const outPath = arg('out', 'match-report.json')
  const limit = Number(arg('limit', '0')) || 0
  const targetsPath = arg('targets', 'targets.json')

  if (!scansRoot) throw new Error('--scans=<folder of local originals> is required')

  // targets.json is produced on the server: the photos needing replacement,
  // each with the URL of the copy currently being served.
  const targets = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(targetsPath, 'utf8')))
  const chosen = limit ? targets.slice(0, limit) : targets

  console.log(`[match] ${chosen.length} photos to match`)

  const files = await findImages(scansRoot)
  console.log(`[match] ${files.length} local images found under ${scansRoot}`)

  console.log('[match] hashing local files...')
  const local = []
  for (const file of files) {
    try {
      const [hash, info] = await Promise.all([dHash(file), stat(file)])
      const meta = await sharp(file).metadata()
      // autoOrient, not the raw header: a scan carrying an EXIF rotation tag
      // reports landscape dimensions while the picture is portrait, and the
      // upload pipeline applies that rotation too. Comparing raw dimensions
      // against what is stored makes correct matches look like failures.
      const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height }
      local.push({ file, hash, bytes: info.size, width: oriented.width, height: oriented.height })
    } catch (error) {
      console.error(`[match] skipped ${file}: ${error.message}`)
    }
  }

  console.log('[match] hashing stored versions...')
  const results = []
  for (const target of chosen) {
    let storedHash
    try {
      const res = await fetch(target.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      storedHash = await dHash(Buffer.from(await res.arrayBuffer()))
    } catch (error) {
      results.push({ ...target, status: 'fetch-failed', reason: error.message })
      continue
    }

    const scored = local
      .map((candidate) => ({ candidate, distance: hamming(storedHash, candidate.hash) }))
      .sort((a, b) => a.distance - b.distance)

    const best = scored[0]
    const runnerUp = scored[1]

    let status = 'matched'
    if (!best || best.distance > MATCH_THRESHOLD) status = 'no-match'
    else if (runnerUp && runnerUp.distance - best.distance < AMBIGUITY_MARGIN) status = 'ambiguous'

    results.push({
      photoId: target.photoId,
      url: target.url,
      storedSize: `${target.width}x${target.height}`,
      status,
      match: best && best.distance <= MATCH_THRESHOLD
        ? {
            file: best.candidate.file,
            distance: best.distance,
            size: `${best.candidate.width}x${best.candidate.height}`,
            bytes: best.candidate.bytes,
          }
        : null,
      runnerUp: runnerUp ? { file: runnerUp.candidate.file, distance: runnerUp.distance } : null,
    })
  }

  const byStatus = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
  console.log('\n[match] summary:', JSON.stringify(byStatus))

  await writeFile(outPath, JSON.stringify(results, null, 2))
  console.log(`[match] wrote ${outPath}`)
}

main().catch((error) => {
  console.error('[match] failed:', error)
  process.exit(1)
})
