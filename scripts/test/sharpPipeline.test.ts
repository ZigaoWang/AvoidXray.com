/**
 * Exercises every sharp operation the app actually performs.
 *
 * sharp is the one dependency sitting directly in the path of untrusted
 * uploads, so it gets bumped for security fixes more often than most — and a
 * successful build says nothing about whether the image pipelines still work,
 * because every call is behind a runtime binding to libvips. This runs the
 * real chains: upload processing, catalogue image processing, and the
 * watermark compositor.
 *
 *   npx tsx scripts/test/sharpPipeline.test.ts
 */
import sharp from 'sharp'
import { encode } from 'blurhash'
import { processItemImage } from '../../src/lib/imageProcessing'
import { MAX_INPUT_PIXELS, isTooLarge } from '../../src/lib/sharpConfig'

let pass = 0
let fail = 0

async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    pass++
    console.log(`  PASS  ${name}`)
  } catch (error) {
    fail++
    console.log(`  FAIL  ${name}  ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

/** A landscape photo stand-in, as JPEG. */
async function sampleJpeg(width = 1200, height = 800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer()
}

/** A logo stand-in: transparent margins, which processItemImage trims. */
async function sampleTransparentPng(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: { width: 100, height: 100, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
        },
        left: 150,
        top: 150,
      },
    ])
    .png()
    .toBuffer()
}

async function main() {
  console.log('sharp pipeline')

  // lib/image.ts — what every uploaded photo goes through.
  await check('upload: rotate, metadata, blurhash, medium and thumb', async () => {
    const source = await sampleJpeg()

    const rotated = await sharp(source).rotate().toBuffer()
    const metadata = await sharp(rotated).metadata()
    assert(metadata.width === 1200 && metadata.height === 800, `unexpected size ${metadata.width}x${metadata.height}`)

    const { data, info } = await sharp(rotated)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert(info.channels === 4, `ensureAlpha did not yield 4 channels, got ${info.channels}`)

    const hash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
    assert(typeof hash === 'string' && hash.length > 6, 'blurhash was not produced')

    const [medium, thumb] = await Promise.all([
      sharp(rotated).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      sharp(rotated).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    ])
    assert((await sharp(medium).metadata()).format === 'webp', 'medium is not webp')
    assert((await sharp(thumb).metadata()).width === 800, 'thumb was not resized to 800')
  })

  // api/avatar — decode, square-bound, re-encode.
  await check('avatar: resize within bounds and re-encode as webp', async () => {
    const output = await sharp(await sampleJpeg(2000, 1500))
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const metadata = await sharp(output).metadata()
    assert(metadata.format === 'webp', `expected webp, got ${metadata.format}`)
    assert(metadata.width === 512, `expected width 512, got ${metadata.width}`)
  })

  // lib/imageProcessing.ts — trim + extend, the most version-sensitive chain.
  await check('catalogue image: trim transparent edges, pad, resize', async () => {
    const output = await processItemImage(await sampleTransparentPng())
    const metadata = await sharp(output).metadata()
    assert(metadata.format === 'webp', `expected webp, got ${metadata.format}`)
    // 100px subject trimmed out of 400px, plus 40px padding on each side.
    assert(metadata.width === 180, `expected 180 wide after trim+extend, got ${metadata.width}`)
  })

  // api/watermark — SVG rasterising, compositing, mozjpeg.
  await check('watermark: rasterise SVG, composite, encode with mozjpeg', async () => {
    const svg = Buffer.from(
      '<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg"><text x="0" y="40" font-size="32" fill="#fff">Shot on film</text></svg>'
    )
    const text = await sharp(svg).png().toBuffer()
    assert((await sharp(text).metadata()).format === 'png', 'SVG did not rasterise to png')

    const composed = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 255, g: 252, b: 247 } },
    })
      .composite([{ input: text, left: 20, top: 20 }])
      .jpeg({ quality: 98, mozjpeg: true })
      .toBuffer()
    assert((await sharp(composed).metadata()).format === 'jpeg', 'composite did not encode to jpeg')
  })

  // The pixel ceiling is the guard that actually protects memory, and the
  // upload route only reports it usefully if isTooLarge recognises the error
  // sharp really throws. Tested with a deliberately tiny limit against a small
  // image, which produces the same failure without allocating anything large.
  await check('pixel ceiling is enforced and recognised by isTooLarge', async () => {
    const source = await sampleJpeg(500, 500)
    let caught: unknown = null
    try {
      await sharp(source, { limitInputPixels: 1000 }).metadata()
    } catch (error) {
      caught = error
    }
    assert(caught !== null, 'sharp accepted an image past its pixel limit')
    assert(
      isTooLarge(caught),
      `isTooLarge did not match sharp's message: ${caught instanceof Error ? caught.message : String(caught)}`
    )
    assert(!isTooLarge(new Error('Input buffer contains unsupported image format')), 'isTooLarge matched an unrelated error')
  })

  // A realistic large scan must still go through: the biggest original on
  // record is 7956x7483, so the ceiling has to sit well clear of that.
  await check('a 60MP scan is still within the ceiling', async () => {
    assert(7956 * 7483 < MAX_INPUT_PIXELS, 'the largest stored photo would now be rejected')
  })

  // The upload route relies on sharp rejecting non-images so it can report a
  // useful per-file message rather than storing rubbish.
  await check('unreadable input is rejected rather than stored', async () => {
    let threw = false
    try {
      await sharp(Buffer.from('this is not an image at all')).metadata()
    } catch {
      threw = true
    }
    assert(threw, 'sharp accepted a non-image buffer')
  })

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
