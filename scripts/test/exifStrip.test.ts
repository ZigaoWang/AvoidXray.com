/**
 * Guards the promise in the privacy policy that we remove GPS from uploads.
 *
 * The stored original is the file as uploaded and is publicly downloadable, so
 * GPS left in it is public. Lab scans carry the scanner's details and no
 * location; a phone photograph of a print usually does carry it.
 *
 *   npx tsx scripts/test/exifStrip.test.ts
 */
import sharp from 'sharp'
import exifr from 'exifr'
import piexif from 'piexifjs'
import { stripLocation } from '../../src/lib/image'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

/** A JPEG carrying GPS and a camera make, written the way a phone writes it. */
async function phonePhoto(): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 200, height: 150, channels: 3, background: '#444' },
  })
    .jpeg()
    .toBuffer()
  const exif = piexif.dump({
    '0th': { [piexif.ImageIFD.Make]: 'TestPhone' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [[51, 1], [30, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: 'W',
      [piexif.GPSIFD.GPSLongitude]: [[0, 1], [7, 1], [0, 1]],
    },
    Exif: {},
    Interop: {},
    '1st': {},
    thumbnail: null,
  })
  const url = piexif.insert(exif, `data:image/jpeg;base64,${plain.toString('base64')}`)
  return Buffer.from(url.split(',')[1], 'base64')
}

/** A scan: EXIF naming the scanner, no location. */
async function labScan(): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 200, height: 150, channels: 3, background: '#888' },
  })
    .jpeg()
    .toBuffer()
  const exif = piexif.dump({
    '0th': {
      [piexif.ImageIFD.Make]: 'FUJI PHOTO FILM CO., LTD.',
      [piexif.ImageIFD.Model]: 'SP-3000',
    },
    Exif: {},
    GPS: {},
    Interop: {},
    '1st': {},
    thumbnail: null,
  })
  const url = piexif.insert(exif, `data:image/jpeg;base64,${plain.toString('base64')}`)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function main() {
  console.log('uploads carrying GPS')

  const phone = await phonePhoto()
  const phoneGpsBefore = await exifr.gps(phone)
  check('fixture really has GPS', phoneGpsBefore?.latitude != null, true)

  const cleaned = await stripLocation(phone, 'jpg')
  const after = await exifr.gps(cleaned).catch(() => null)
  check('GPS is gone after stripping', after?.latitude ?? null, null)
  check('the file changed', cleaned.equals(phone), false)
  // Still a usable image, not a corrupted buffer.
  const meta = await sharp(cleaned).metadata()
  check('still decodes at the same size', [meta.width, meta.height], [200, 150])

  console.log('uploads without GPS')

  const scan = await labScan()
  const kept = await stripLocation(scan, 'jpg')
  // Byte-for-byte: a scan must not be re-encoded for nothing.
  check('stored untouched', kept.equals(scan), true)
  const scanMeta = await exifr.parse(kept)
  check('scanner EXIF survives', scanMeta?.Model, 'SP-3000')

  console.log('bad input')

  // Unreadable metadata must not cost someone their upload.
  const notAnImage = Buffer.from('not an image at all')
  const passthrough = await stripLocation(notAnImage, 'jpg')
  check('unreadable file passes through', passthrough.equals(notAnImage), true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
