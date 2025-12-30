import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads')

export async function processImage(buffer: Buffer, id: string, originalExt: string = 'jpg') {
  // Auto-rotate based on EXIF orientation and get rotated buffer
  const rotatedBuffer = await sharp(buffer).rotate().toBuffer()
  const metadata = await sharp(rotatedBuffer).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  const ext = originalExt.toLowerCase()
  const originalPath = `/uploads/originals/${id}.${ext}`
  const mediumPath = `/uploads/medium/${id}.jpg`
  const thumbnailPath = `/uploads/thumbs/${id}.jpg`

  // Save original as-is (no re-encoding)
  await fs.writeFile(path.join(UPLOAD_DIR, `originals/${id}.${ext}`), buffer)

  // Generate medium (1600px on longest side)
  await sharp(rotatedBuffer)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(UPLOAD_DIR, `medium/${id}.jpg`))

  // Generate thumbnail (800px on longest side)
  await sharp(rotatedBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(path.join(UPLOAD_DIR, `thumbs/${id}.jpg`))

  return { originalPath, mediumPath, thumbnailPath, width, height }
}
