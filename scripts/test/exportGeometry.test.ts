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
  ORIGINAL_LONG_EDGE,
  EXPORT_FORMATS,
  paperFor,
  printPixels,
  scaleFor,
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
    invertMark: false,
    print: false,
    fill: false,
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

  /**
   * The looks that are a thing rather than a sheet with a picture on it.
   *
   * A slide mount is square because a 35mm mount is 50mm each way, and an
   * instant card is the picture plus a border and a chin. Neither has a size
   * anybody else gets to choose, so neither takes a format: asking a mount for
   * a 9:16 file produced a mount in the middle of a tall ground and called the
   * empty two thirds of it the export.
   */
  const OBJECTS: readonly string[] = ['slide', 'instant']
  const SHEETS = EXPORT_STYLES.filter(style => !OBJECTS.includes(style))

  console.log('an object is its own size, whatever format is asked for')
  {
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const style of EXPORT_STYLES.filter(s => OBJECTS.includes(s))) {
      const sizes = new Set<string>()
      for (const format of [...FIXED, 'original' as const]) {
        const got = await sizeOf(
          await renderExport({ ...context(source, w, h, { format }), style, quality: 70 })
        )
        sizes.add(`${got.w}x${got.h}`)
      }
      check(`${style} ignores the format`, sizes.size === 1, [...sizes].join(' '))
    }
    const mount = await sizeOf(
      await renderExport({ ...context(source, w, h, { format: 'story' }), style: 'slide', quality: 70 })
    )
    check('a mount is square', mount.w === mount.h, `${mount.w}x${mount.h}`)
  }

  console.log('\nevery sheet style fills the canvas the format asks for')
  {
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const style of SHEETS) {
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
    for (const style of SHEETS) {
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
    for (const style of SHEETS) {
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
      // To the pixel, give or take a few. An object's size comes from the
      // photograph's ratio rather than from a table, and an instant card is
      // three independently rounded terms — the picture's height, the border
      // and the chin — each of which can land a pixel either way at one scale
      // and not at the other. What this checks is that the whole composition
      // scales, not that three divisions round the same way twice.
      const drift = 3
      check(
        `${style} doubles`,
        Math.abs(two.w - one.w * 2) <= drift && Math.abs(two.h - one.h * 2) <= drift,
        `${one.w}x${one.h} -> ${two.w}x${two.h}`
      )
    }
  }

  console.log('\nevery look survives a scale that is not a whole number')
  {
    // Only a preview is rendered at a whole multiple. A print derives its scale
    // from the paper's inches and "full" derives it from the scan, so every
    // real download asks for something like 4.9725 — and sprocketStrip handed
    // 1500 * that straight to sharp as a canvas width, which it refuses. Both
    // film looks returned a 500 for both of those destinations across most of
    // the library while the preview beside the button drew a perfect strip.
    for (const [w, h] of [[2410, 1607], [7956, 5300], [3283, 2220], [2400, 876]]) {
      const source = await photo(w, h)
      for (const style of EXPORT_STYLES) {
        for (const scale of [w / ORIGINAL_LONG_EDGE, 1.111, 4.9725, 0.35]) {
          let ok = true
          let why = ''
          try {
            await renderExport({ ...context(source, w, h, { format: 'original', scale }), style, quality: 60 })
          } catch (error) {
            ok = false
            why = error instanceof Error ? error.message : String(error)
          }
          check(`${style} at ${scale.toFixed(3)} on ${w}x${h}`, ok, why)
        }
      }
    }
  }

  console.log('\nno photograph is enlarged to fill a size it cannot')
  {
    const offers = (f: ExportFormat, w: number, h: number, land?: boolean) =>
      availableResolutions(f, w, h, land).join()

    // The site's median scan, 3283x2220. It fills Post and Frame at twice the
    // screen canvas but not three times.
    check('median scan, post', offers('post', 3283, 2220) === 'web,high,full,print', offers('post', 3283, 2220))
    check('median scan, frame', offers('frame', 3283, 2220) === 'web,high,full,print', offers('frame', 3283, 2220))

    // Asked against the frame rather than the sheet: a landscape scan covers a
    // Story canvas by its height at twice the size, so refusing it on the long
    // edge alone turned down a render that enlarges nothing. Story has no
    // standard paper, so it offers no print.
    check('a landscape scan reaches high on story', offers('story', 3283, 2220, true) === 'web,high,full', offers('story', 3283, 2220, true))
    check('an upright scan does too', offers('story', 2220, 3283, false) === 'web,high,full', offers('story', 2220, 3283, false))

    // A scan short on both sides gets the smallest size and nothing else.
    check('a small scan offers one', offers('post', 900, 600) === 'web', offers('post', 900, 600))
    check('a large scan offers everything', offers('post', 6000, 4000) === 'web,high,full,print', offers('post', 6000, 4000))

    // "As shot" has no paper and is not exempt from the no-enlargement rule.
    check('as shot offers no print', offers('original', 6000, 4000) === 'web,high,full', offers('original', 6000, 4000))
    check('as shot at web only when small', offers('original', 1200, 800) === 'web')

    // Nothing offered is ever an enlargement.
    for (const f of EXPORT_FORMATS) {
      for (const [w, h] of [[3283, 2220], [2220, 3283], [900, 600], [6000, 4000]]) {
        const ceiling = maxScale(f, w, h)
        const bad = availableResolutions(f, w, h).find(n => scaleFor(n, f, ceiling) > ceiling + 0.001)
        check(`${f} ${w}x${h} offers nothing it cannot fill`, !bad, bad ?? '')
      }
    }
  }

  console.log('\na print size is the ratio already chosen, on paper')
  {
    check('4x6 is the 3:2 sheet', paperFor('frame')?.name === '4×6')
    check('8x10 is the 4:5 sheet', paperFor('post')?.name === '8×10')
    check('9:16 has no paper', paperFor('story') === undefined)
    check('as shot has no paper', paperFor('original') === undefined)

    for (const [f, w, h] of [['frame', 1800, 1200], ['post', 3000, 2400], ['classic', 2400, 1800], ['square', 2400, 2400]] as const) {
      const px = printPixels(f, true)
      check(`${f} prints ${w}x${h} at 300dpi`, px?.w === w && px?.h === h, `${px?.w}x${px?.h}`)
      // And the render agrees with the arithmetic.
      const canvas = canvasOf(f, scaleFor('print', f), true)
      check(`${f} renders that exactly`, canvas.w === w && canvas.h === h, `${canvas.w}x${canvas.h}`)
    }
    const upright = printPixels('frame', false)
    check('turning the paper turns the pixels', upright?.w === 1200 && upright?.h === 1800)
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
      // A slide mount is square whatever it holds. Everything else follows the
      // photograph, the instant card included: it is cut around the picture, so
      // a standing frame gives a standing card.
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

    // The chin is the one thing the card adds to the photograph's own shape, so
    // a landscape card comes out nearer a square than the frame in it. This is
    // what says the card was cut around the picture rather than the picture
    // dropped into a card: it used to be 1.2 tall whatever it held, which put a
    // 3:2 frame in the middle of a square with empty cream above and below it.
    const card = await sizeOf(
      await renderExport({ ...context(wide, 1500, 1000, { format: 'original' }), style: 'instant', quality: 70 })
    )
    check('an instant card is cut around the frame it holds',
      card.w > card.h && card.w / card.h < 1.5, `${card.w}x${card.h}`)
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

  console.log('\nevery mat setting leaves a frame to put a picture in')
  {
    // A mat measured from the wrong side of a turned canvas can subtract more
    // than the canvas has. The suite only ever used the middle of the slider,
    // which is exactly where it does not happen.
    const [w, h] = [2400, 1600]
    const source = await photo(w, h)
    for (const mat of [0, 25, 55, 100]) {
      for (const landscape of [false, true]) {
        for (const format of [...FIXED, 'original' as const]) {
          let ok = true
          let why = ''
          try {
            const got = await sizeOf(
              await renderExport({ ...context(source, w, h, { format, mat, landscape }), style: 'bare', quality: 70 })
            )
            ok = got.w > 0 && got.h > 0
            why = `${got.w}x${got.h}`
          } catch (error) {
            ok = false
            why = error instanceof Error ? error.message.slice(0, 60) : String(error)
          }
          check(`bare / ${format} / mat ${mat} / ${landscape ? 'landscape' : 'portrait'}`, ok, why)
        }
      }
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
      // An object look is its own size, so only a sheet is measured against the
      // format here. What this is really asking of both is that a fourth
      // channel does not throw.
      const want = canvasOf('post', RESOLUTION.web, false)
      const sized = OBJECTS.includes(style) ? size.w > 0 && size.h > 0 : size.w === want.w && size.h === want.h
      check(`${style} renders an image with alpha`, ok && sized, why || `${size.w}x${size.h}`)
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
