/**
 * What size an export actually comes out.
 *
 * Nothing could ask this before. `renderBare`, `renderClean`, `renderSprocket`
 * and `renderSlide` were module-private inside a route handler, so no test
 * could reach any of them, and a slide export ignored the chosen format for as
 * long as it did: Post, Square and Story returned byte-identical 1080x1080
 * files while the dialog drew three different aspect swatches above them. There
 * was no assertion anywhere that could have failed.
 *
 * The rule these check is the one that was broken: for every style, at a fixed
 * format, the rendered file measures exactly the canvas the shared table says
 * it should. A style may decide anything it likes inside that frame — the slide
 * mount is square because a 35mm mount is square — but it does not get to
 * decide the size of the sheet.
 *
 *   npx tsx scripts/test/exportGeometry.test.ts
 */
import sharp from 'sharp'
import {
  EXPORT_STYLES,
  canTurn,
  canvasOf,
  availableResolutions,
  maxScale,
  targetLongEdge,
  RESOLUTION,
  EXPORT_FORMATS,
  nativeFormat,
  type ExportFormat,
} from '../../src/lib/exportFormats'
import { renderExport, type RenderContext } from '../../src/lib/watermark/render'

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

/** A stand-in photograph, so these run without storage or a database. */
async function photo(w: number, h: number): Promise<Buffer> {
  const data = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const x = i % w
    const y = (i / w) | 0
    data[i * 3] = 60 + ((x * 255) / w) * 0.6
    data[i * 3 + 1] = 70 + ((y * 255) / h) * 0.5
    data[i * 3 + 2] = 90
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer()
}

function context(source: Buffer, w: number, h: number, over: Partial<RenderContext> = {}): RenderContext {
  return {
    photo: sharp(source),
    mat: 55,
    filmFormat: '35mm',
    filmKind: 'Color negative',
    stock: { iso: 200, brand: 'Kodak', monochrome: false },
    seed: 'test-seed',
    srcW: w,
    srcH: h,
    format: 'post',
    scale: RESOLUTION.web,
    landscape: false,
    theme: 'light',
    caption: 'Shot on film',
    camera: 'Nikon F4',
    film: 'Kodak Gold 200',
    username: 'zigao',
    date: 'Jun 4, 2024',
    qrUrl: null,
    ...over,
  }
}

const sizeOf = async (buffer: Buffer) => {
  const m = await sharp(buffer).metadata()
  return { w: m.width || 0, h: m.height || 0 }
}

async function main() {
  const FIXED: Exclude<ExportFormat, 'original'>[] = ['square', 'post', 'classic', 'frame', 'story']

  console.log('every style fills the canvas the format asks for')
  {
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      for (const format of FIXED) {
        const want = canvasOf(format, RESOLUTION.web, false)
        const got = await sizeOf(
          await renderExport({ ...context(source, w, h, { format }), style, quality: 70 })
        )
        check(
          `${style} / ${format}`,
          got.w === want.w && got.h === want.h,
          `wanted ${want.w}x${want.h}, got ${got.w}x${got.h}`
        )
      }
    }
  }

  console.log('\nevery format produces its own size, not one repeated')
  {
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      const sizes = new Set<string>()
      for (const format of FIXED) {
        const got = await sizeOf(
          await renderExport({ ...context(source, w, h, { format }), style, quality: 70 })
        )
        sizes.add(`${got.w}x${got.h}`)
      }
      // This is the assertion that was missing. Slide collapsed every format
      // to 1080x1080 and nothing noticed.
      check(`${style} distinguishes every format`, sizes.size === FIXED.length, [...sizes].join(' '))
    }
  }

  console.log('\nturning the canvas swaps its sides and nothing else')
  {
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      for (const format of FIXED) {
        const upright = await sizeOf(
          await renderExport({ ...context(source, w, h, { format, landscape: false }), style, quality: 70 })
        )
        const turned = await sizeOf(
          await renderExport({ ...context(source, w, h, { format, landscape: true }), style, quality: 70 })
        )
        const expected = canTurn(format) ? { w: upright.h, h: upright.w } : upright
        check(
          `${style} / ${format} turned`,
          turned.w === expected.w && turned.h === expected.h,
          `wanted ${expected.w}x${expected.h}, got ${turned.w}x${turned.h}`
        )
      }
    }
  }

  console.log('\na larger resolution is the same picture, larger')
  {
    const [w, h] = [4800, 3200]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      const one = await sizeOf(
        await renderExport({ ...context(source, w, h, { scale: RESOLUTION.web }), style, quality: 70 })
      )
      const two = await sizeOf(
        await renderExport({ ...context(source, w, h, { scale: RESOLUTION.high }), style, quality: 70 })
      )
      check(
        `${style} doubles`,
        two.w === one.w * 2 && two.h === one.h * 2,
        `${one.w}x${one.h} -> ${two.w}x${two.h}`
      )
    }
  }

  console.log('\nno photograph is enlarged to fill a size it cannot')
  {
    // The median scan on the site. It can fill Post at twice the canvas (2700
    // long edge) but not three times (4050).
    check('median scan tops out at high on post', maxScale('post', 3283, 2220) === RESOLUTION.high)
    // Asked against the frame rather than the sheet: a landscape scan covers a
    // Story canvas by its height at twice the size, so refusing it on the long
    // edge alone turned down a render that does not enlarge anything.
    check('a landscape scan reaches high on story', maxScale('story', 3283, 2220, true) === RESOLUTION.high)
    // Symmetric: an upright scan covers an upright Story canvas by its width.
    check('an upright scan reaches high on story', maxScale('story', 2220, 3283, false) === RESOLUTION.high)
    // But a scan that falls short on both sides is still refused.
    check('a small scan reaches neither', maxScale('story', 900, 600, true) === RESOLUTION.web)
    check('median scan offers two steps', availableResolutions('post', 3283, 2220).join() === 'web,high')
    check('a small scan offers one', availableResolutions('post', 900, 600).join() === 'web')
    check('a large scan offers all three', availableResolutions('post', 6000, 4000).join() === 'web,high,max')
    // "As shot" used to short-circuit to the ceiling, so every step was offered
    // for every photograph and the extra ones rendered an identical file.
    check('as shot is not exempt', maxScale('original', 1200, 800) === RESOLUTION.web)
    check('as shot scales when it can', maxScale('original', 5000, 3300) === RESOLUTION.max)
    for (const scale of [RESOLUTION.web, RESOLUTION.high, RESOLUTION.max]) {
      check(
        `a granted scale is one the source covers (x${scale})`,
        targetLongEdge('post', maxScale('post', 3283, 2220)) <= 3283
      )
    }
  }

  console.log('\nan upright photograph comes out upright')
  {
    // The route used to take these from sharp's metadata, which reports the
    // stored pair rather than the oriented one, so an EXIF-rotated original was
    // rendered with its axes swapped: the filmstrip skipped its rotation and
    // force-filled a 2:3 picture into a 3:2 frame.
    const [w, h] = [1000, 1500]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      const got = await sizeOf(
        await renderExport({ ...context(source, w, h, { format: 'original' }), style, quality: 70 })
      )
      // Slide is square by design; every other style keeps the frame standing.
      const upright = style === 'slide' ? got.h === got.w : got.h > got.w
      check(`${style} keeps a portrait frame portrait`, upright, `${got.w}x${got.h}`)
    }
    const wide = await photo(1500, 1000)
    for (const style of EXPORT_STYLES) {
      const got = await sizeOf(
        await renderExport({ ...context(wide, 1500, 1000, { format: 'original' }), style, quality: 70 })
      )
      const flat = style === 'slide' ? got.h === got.w : got.w > got.h
      check(`${style} keeps a landscape frame landscape`, flat, `${got.w}x${got.h}`)
    }
  }

  console.log('\nthe export opens at the ratio the frame was shot at')
  {
    check('35mm is 3:2', nativeFormat('35mm') === 'frame')
    check('6x6 is square', nativeFormat('6x6') === 'square')
    check('645 is 4:3', nativeFormat('645') === 'classic')
    check('4x5 sheet is 5:4', nativeFormat('4x5') === 'post')
    check('6x7 is nearest a square', nativeFormat('6x7') === 'square')
    check('an unknown format with no scan falls back to 3:2', nativeFormat('super 8') === 'frame')
    check('no format at all falls back to 3:2', nativeFormat(null) === 'frame')

    // The catalog's gauge columns cannot answer this on their own: a stock's
    // lists what it is sold in, and a camera's says "Medium Format (120/220)",
    // which is 6x6, 6x7 and 645 at once. The scan's own shape can.
    check('a square medium-format scan opens square', nativeFormat('Medium Format (120/220)', 2000, 2000) === 'square')
    check('a 4:3 medium-format scan opens 4:3', nativeFormat('Medium Format (120/220)', 2400, 1800) === 'classic')
    check('a bare "120" opens by the scan, not 3:2', nativeFormat('120', 2000, 2000) === 'square')
    check('an untagged 3:2 scan opens 3:2', nativeFormat(null, 3000, 2000) === 'frame')
    check('an untagged upright scan opens the same ratio', nativeFormat(null, 2000, 3000) === 'frame')
    check('a panorama opens at the widest canvas', nativeFormat(null, 4000, 1500) === 'story')
    for (const f of EXPORT_FORMATS) {
      if (f === 'original') continue
      const c = canvasOf(f, RESOLUTION.web, false)
      check(`${f} is taller than wide before it is turned`, c.h >= c.w, `${c.w}x${c.h}`)
    }
  }

  console.log('\na photograph carrying an alpha channel renders like any other')
  {
    // The medium variant is WebP, which may carry alpha, and the filmstrip now
    // hands raw pixel buffers between its stages — so the channel count travels
    // with them instead of being re-read from an encoded header.
    const [w, h] = [1600, 1067]
    const rgba = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 90
      rgba[i * 4 + 1] = 110
      rgba[i * 4 + 2] = 130
      rgba[i * 4 + 3] = 255
    }
    const withAlpha = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
    const channels = (await sharp(withAlpha).metadata()).channels
    check('the fixture really has four channels', channels === 4, String(channels))

    for (const style of EXPORT_STYLES) {
      let ok = true
      let why = ''
      let size = { w: 0, h: 0 }
      try {
        size = await sizeOf(
          await renderExport({ ...context(withAlpha, w, h, { format: 'post' }), style, quality: 70 })
        )
      } catch (error) {
        ok = false
        why = error instanceof Error ? error.message : String(error)
      }
      const want = canvasOf('post', RESOLUTION.web, false)
      check(`${style} renders an image with alpha`, ok && size.w === want.w && size.h === want.h, why || `${size.w}x${size.h}`)
    }
  }

  console.log('\nan export survives a photograph too small for its own textures')
  {
    // A 240x180 scan on "as shot" makes a frame under the 256px grain tile, and
    // sharp refuses a composite larger than its base.
    const [w, h] = [240, 180]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES) {
      let ok = true
      let why = ''
      try {
        await renderExport({ ...context(source, w, h, { format: 'original' }), style, quality: 70 })
      } catch (error) {
        ok = false
        why = error instanceof Error ? error.message : String(error)
      }
      check(`${style} renders a tiny source`, ok, why)
    }
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
