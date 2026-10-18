/**
 * Guards the promise in the privacy policy that we remove GPS, and with it
 * anything else in a stored original that identifies a person.
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
import { stripPrivateMetadata } from '../../src/lib/image'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
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

/**
 * A JPEG whose only location is in XMP, which is where Lightroom and several
 * phone makers write it. The packet is spliced in as its own APP1 segment
 * because that is exactly how it arrives in a real file, and because exifr.gps
 * does not look at it.
 */
async function xmpLocationPhoto(): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 200, height: 150, channels: 3, background: '#666' },
  })
    .jpeg()
    .toBuffer()

  const xml =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
    'exif:GPSLatitude="51,30.000000N" exif:GPSLongitude="0,7.000000W"/>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'

  const payload = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
    Buffer.from(xml, 'latin1'),
  ])
  const header = Buffer.alloc(4)
  header.writeUInt16BE(0xffe1, 0)
  // The length field counts itself but not the marker.
  header.writeUInt16BE(payload.length + 2, 2)

  // After the SOI marker, before everything else.
  return Buffer.concat([plain.subarray(0, 2), header, payload, plain.subarray(2)])
}

async function main() {
  console.log('uploads carrying GPS')

  const phone = await phonePhoto()
  const phoneGpsBefore = await exifr.gps(phone)
  check('fixture really has GPS', phoneGpsBefore?.latitude != null, true)

  const cleaned = await stripPrivateMetadata(phone, 'jpg')
  const after = await exifr.gps(cleaned).catch(() => null)
  check('GPS is gone after stripping', after?.latitude ?? null, null)
  check('the file changed', cleaned.equals(phone), false)
  // Still a usable image, not a corrupted buffer.
  const meta = await sharp(cleaned).metadata()
  check('still decodes at the same size', [meta.width, meta.height], [200, 150])

  console.log('uploads without GPS')

  const scan = await labScan()
  const kept = await stripPrivateMetadata(scan, 'jpg')
  // Byte-for-byte: a scan must not be re-encoded for nothing.
  check('stored untouched', kept.equals(scan), true)
  const scanMeta = await exifr.parse(kept)
  check('scanner EXIF survives', scanMeta?.Model, 'SP-3000')

  console.log('location outside the GPS IFD')

  // exifr.gps reads the EXIF GPS IFD only, so this file answers "no GPS" and
  // was stored with its coordinates intact.
  const xmpPhoto = await xmpLocationPhoto()
  check('fixture has no GPS in the EXIF IFD', (await exifr.gps(xmpPhoto).catch(() => null))?.latitude ?? null, null)
  check('fixture really carries XMP coordinates', xmpPhoto.toString('latin1').includes('GPSLatitude'), true)

  const xmpCleaned = await stripPrivateMetadata(xmpPhoto, 'jpg')
  check('XMP coordinates are gone', xmpCleaned.toString('latin1').includes('GPSLatitude'), false)
  const xmpMeta = await sharp(xmpCleaned).metadata()
  check('still decodes at the same size', [xmpMeta.width, xmpMeta.height], [200, 150])

  console.log('personal tags, with the shooting details kept')

  const plainBase = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#666' } }).jpeg().toBuffer()
  const personalExif = piexif.dump({
    '0th': {
      [piexif.ImageIFD.Make]: 'Nikon',
      [piexif.ImageIFD.Model]: 'Coolscan',
      [piexif.ImageIFD.Artist]: 'Jane Doe',
      [piexif.ImageIFD.Orientation]: 6,
    },
    Exif: {
      [piexif.ExifIFD.BodySerialNumber]: 'SN123456',
      [piexif.ExifIFD.CameraOwnerName]: 'Jane Doe',
    },
    GPS: {},
    Interop: {},
    '1st': {},
    thumbnail: null,
  })
  const personal = Buffer.from(
    piexif.insert(personalExif, `data:image/jpeg;base64,${plainBase.toString('base64')}`).split(',')[1],
    'base64',
  )
  const scrubbed = await stripPrivateMetadata(personal, 'jpg')
  const scrubbedMeta = await exifr.parse(scrubbed, { tiff: true, exif: true, translateValues: false })
  check('serial number is gone', scrubbedMeta?.BodySerialNumber ?? null, null)
  check('owner name is gone', scrubbedMeta?.CameraOwnerName ?? null, null)
  check('artist is gone', scrubbedMeta?.Artist ?? null, null)
  check('model is kept', scrubbedMeta?.Model, 'Coolscan')
  check('orientation is kept', scrubbedMeta?.Orientation, 6)
  // Not re-encoded: the image data after the metadata is the same bytes.
  check('pixels are untouched', scrubbed.subarray(scrubbed.length - 200).equals(personal.subarray(personal.length - 200)), true)

  console.log('PNG text chunks')

  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123' } })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: 'Jane Doe' } } })
    .toBuffer()
  const pngCleaned = await stripPrivateMetadata(png, 'png')
  check('fixture carries a name', png.toString('latin1').includes('Jane Doe'), true)
  check('the name is gone', pngCleaned.toString('latin1').includes('Jane Doe'), false)
  const pngMeta = await sharp(pngCleaned).metadata()
  check('PNG still decodes', [pngMeta.width, pngMeta.height], [20, 20])

  console.log('bad input')

  // Unreadable metadata must not cost someone their upload.
  const notAnImage = Buffer.from('not an image at all')
  const passthrough = await stripPrivateMetadata(notAnImage, 'jpg')
  check('unreadable file passes through', passthrough.equals(notAnImage), true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
