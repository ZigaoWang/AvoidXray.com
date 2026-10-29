/**
 * The display versions every community photo gets, and the hashes that
 * recognize a file already in a library.
 *
 * What is promised: each version is made from the original, the right way up,
 * never enlarged, with sRGB embedded and nothing else of the original's
 * metadata; the large version uses the archive's JPEG settings; and the image
 * data hash ignores metadata but nothing else.
 *
 *   npx tsx scripts/test/photoDerivatives.test.ts
 */
import sharp from 'sharp'
import exifr from 'exifr'
import { makeDerivatives, differenceHash, identifyOriginal } from '../../src/lib/image'
import { hammingDistance, imageDataSha256, jpegScanOffset, sha256Hex } from '../../src/lib/imageHash'

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

/** A gradient, so resizing and hashing have something to work on. */
function gradient(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      pixels[i] = (x * 255) / width
      pixels[i + 1] = (y * 255) / height
      pixels[i + 2] = 128
    }
  }
  return pixels
}

/** The profile sharp embeds for 'srgb', to compare stored versions against. */
const SRGB_PROFILE = sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
  .withIccProfile('srgb').png().toBuffer().then(async b => (await sharp(b).metadata()).icc!)

/** Whether a file embeds exactly that sRGB profile. */
async function isTaggedSrgb(file: Buffer): Promise<boolean> {
  const { icc } = await sharp(file).metadata()
  return icc !== undefined && icc.equals(await SRGB_PROFILE)
}

const raw = (width: number, height: number) => sharp(gradient(width, height), { raw: { width, height, channels: 3 } })

/** A scan as a lab sends one: EXIF naming the scanner, a GPS position, a rotation. */
async function labScan(width: number, height: number, orientation = 1): Promise<Buffer> {
  return raw(width, height)
    .withExif({
      IFD0: { Make: 'FUJI PHOTO FILM CO., LTD.', Model: 'SP-3000', Artist: 'Someone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' },
    })
    .withMetadata({ orientation })
    .jpeg({ quality: 92 })
    .toBuffer()
}

async function main() {
  console.log('display versions')

  const scan = await labScan(4800, 3200)
  const original = await identifyOriginal(scan)
  const d = await makeDerivatives(original.source)

  await check('sizes are 800, 1600 and 4000 on the long edge', async () => {
    const sizes = await Promise.all([d.thumb, d.medium, d.large].map(b => sharp(b).metadata()))
    assert(JSON.stringify(sizes.map(m => Math.max(m.width!, m.height!))) === '[800,1600,4000]', JSON.stringify(sizes.map(m => [m.width, m.height])))
  })

  await check('every version carries the sRGB profile', async () => {
    for (const b of [d.thumb, d.medium, d.large]) assert(await isTaggedSrgb(b), 'no sRGB profile')
  })

  await check('no version carries the scan\'s EXIF, XMP or IPTC', async () => {
    for (const b of [d.thumb, d.medium, d.large]) {
      const m = await sharp(b).metadata()
      assert(!m.exif && !m.xmp && !m.iptc, `exif ${!!m.exif} xmp ${!!m.xmp} iptc ${!!m.iptc}`)
    }
    // And the scan did carry them, or the check above proves nothing.
    const tags = await exifr.parse(scan, { tiff: true, gps: true })
    assert(tags?.Model === 'SP-3000' && typeof tags?.latitude === 'number', 'the test scan has no EXIF to lose')
  })

  await check('the large version is a progressive 4:4:4 JPEG', async () => {
    const m = await sharp(d.large).metadata()
    assert(m.format === 'jpeg' && m.isProgressive === true && m.chromaSubsampling === '4:4:4', `${m.format} ${m.isProgressive} ${m.chromaSubsampling}`)
  })

  await check('the size is reported the right way up', async () => {
    const rotated = await makeDerivatives((await identifyOriginal(await labScan(1200, 800, 6))).source)
    const thumb = await sharp(rotated.thumb).metadata()
    assert(rotated.width === 800 && rotated.height === 1200, `${rotated.width}x${rotated.height}`)
    assert(thumb.height! > thumb.width!, `thumb ${thumb.width}x${thumb.height}`)
  })

  await check('a small original is never enlarged', async () => {
    const small = await makeDerivatives(await labScan(1000, 600))
    const sizes = await Promise.all([small.medium, small.large].map(b => sharp(b).metadata()))
    assert(sizes.every(m => m.width === 1000 && m.height === 600), JSON.stringify(sizes.map(m => [m.width, m.height])))
  })

  await check('a Display P3 source comes out tagged sRGB', async () => {
    const p3 = await raw(1200, 800).withIccProfile('p3').jpeg().toBuffer()
    const out = await makeDerivatives(p3)
    assert(await isTaggedSrgb(out.medium), 'not tagged sRGB')
    // Converted, not just relabeled: P3 values read as sRGB look different.
    const relabeled = await sharp(p3).withIccProfile('srgb').stats()
    const converted = await sharp(out.large).stats()
    assert(Math.abs(relabeled.channels[0].mean - converted.channels[0].mean) > 1, 'values were not converted')
  })

  await check('a TIFF is identified as one and kept as it is', async () => {
    const tiff = await raw(600, 400).tiff().toBuffer()
    const id = await identifyOriginal(tiff)
    assert(id.format === 'tiff' && id.ext === 'tif' && id.source === tiff, `${id.format} ${id.ext}`)
  })

  await check('an SVG is refused', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
    let refused = false
    try { await identifyOriginal(svg) } catch { refused = true }
    assert(refused, 'accepted an SVG')
  })

  console.log('hashes')

  await check('rewriting a JPEG\'s metadata keeps its image data hash and changes its file hash', async () => {
    const pixels = await raw(800, 600).jpeg({ quality: 90 }).toBuffer()
    const withExif = await sharp(pixels).withExif({ IFD0: { Model: 'SP-3000' } }).keepIccProfile().toBuffer()
    // Re-encoding would change the scan, so build the variant by hand: the
    // same scan data behind a different header.
    const scan = pixels.subarray(jpegScanOffset(pixels)!)
    const header = withExif.subarray(0, jpegScanOffset(withExif)!)
    const rewritten = Buffer.concat([header, scan])
    assert(await imageDataSha256(rewritten) === await imageDataSha256(pixels), 'image data hash changed')
    assert(await sha256Hex(rewritten) !== await sha256Hex(pixels), 'file hash did not change')
  })

  await check('a change to the picture changes the image data hash', async () => {
    const a = await raw(800, 600).jpeg({ quality: 90 }).toBuffer()
    const b = await raw(800, 600).modulate({ brightness: 1.05 }).jpeg({ quality: 90 }).toBuffer()
    assert(await imageDataSha256(a) !== await imageDataSha256(b), 'same hash')
  })

  await check('a PNG\'s text chunks do not enter its image data hash', async () => {
    const plain = await raw(300, 200).png().toBuffer()
    const tagged = await sharp(plain).withMetadata().withExif({ IFD0: { Artist: 'Someone' } }).png().toBuffer()
    const [h1, h2] = await Promise.all([imageDataSha256(plain), imageDataSha256(tagged)])
    assert(h1 !== null && h1 === h2, `${h1} vs ${h2}`)
  })

  await check('a TIFF has no image data hash rather than a wrong one', async () => {
    assert(await imageDataSha256(await raw(100, 100).tiff().toBuffer()) === null, 'returned a hash')
  })

  await check('perceptual hashes of one picture at two sizes are close, of two pictures far apart', async () => {
    const big = await differenceHash(await raw(1600, 1000).jpeg().toBuffer())
    const small = await differenceHash(await raw(800, 500).webp({ quality: 60 }).toBuffer())
    const other = await differenceHash(await raw(1600, 1000).flop().jpeg().toBuffer())
    assert(/^[0-9a-f]{16}$/.test(big), `not 16 hex digits: ${big}`)
    assert(hammingDistance(big, small) < hammingDistance(big, other), `same ${hammingDistance(big, small)}, other ${hammingDistance(big, other)}`)
  })

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
