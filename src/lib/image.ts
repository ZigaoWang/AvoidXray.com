import sharp from 'sharp'
import { uploadToOSS } from './oss'

export async function processImage(buffer: Buffer, id: string, originalExt: string = 'jpg') {
  const rotatedBuffer = await sharp(buffer).rotate().toBuffer()
  const metadata = await sharp(rotatedBuffer).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  const ext = originalExt.toLowerCase()

  // Generate medium (1600px)
  const mediumBuffer = await sharp(rotatedBuffer)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  // Generate thumbnail (800px)
  const thumbBuffer = await sharp(rotatedBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  // Upload to OSS
  const [originalPath, mediumPath, thumbnailPath] = await Promise.all([
    uploadToOSS(buffer, `originals/${id}.${ext}`),
    uploadToOSS(mediumBuffer, `medium/${id}.jpg`),
    uploadToOSS(thumbBuffer, `thumbs/${id}.jpg`),
  ])

  return { originalPath, mediumPath, thumbnailPath, width, height }
}
