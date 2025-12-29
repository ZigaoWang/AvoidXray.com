import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads')

export async function processImage(buffer: Buffer, id: string) {
  // Auto-rotate based on EXIF orientation
  const rotated = sharp(buffer).rotate()
  const metadata = await rotated.metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  const originalPath = `/uploads/originals/${id}.jpg`
  const mediumPath = `/uploads/medium/${id}.jpg`
  const thumbnailPath = `/uploads/thumbs/${id}.jpg`

  // Save original (with rotation applied)
  await rotated.clone().jpeg({ quality: 95 }).toFile(path.join(UPLOAD_DIR, `originals/${id}.jpg`))

  // Generate medium (1600px on longest side)
  await rotated.clone()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(UPLOAD_DIR, `medium/${id}.jpg`))

  // Generate thumbnail (800px on longest side)
  await rotated.clone()
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(path.join(UPLOAD_DIR, `thumbs/${id}.jpg`))

  return { originalPath, mediumPath, thumbnailPath, width, height }
}
