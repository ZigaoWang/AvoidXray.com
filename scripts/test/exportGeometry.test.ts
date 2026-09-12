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

  console.log('\nthe export opens at the ratio the frame was shot at')
  {
    check('35mm is 3:2', nativeFormat('35mm') === 'frame')
    check('6x6 is square', nativeFormat('6x6') === 'square')
    check('645 is 4:3', nativeFormat('645') === 'classic')
    check('4x5 sheet is 5:4', nativeFormat('4x5') === 'post')
    check('6x7 is nearest a square', nativeFormat('6x7') === 'square')
    check('an unknown format falls back to 3:2', nativeFormat('super 8') === 'frame')
    check('no format at all falls back to 3:2', nativeFormat(null) === 'frame')
    for (const f of EXPORT_FORMATS) {
      if (f === 'original') continue
      const c = canvasOf(f, RESOLUTION.web, false)
      check(`${f} is taller than wide before it is turned`, c.h >= c.w, `${c.w}x${c.h}`)
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
