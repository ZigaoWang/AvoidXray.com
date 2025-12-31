import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const client = new S3Client({
  region: process.env.ALIYUN_OSS_REGION!,
  endpoint: `https://${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`,
  credentials: {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!,
  },
})

const bucket = process.env.ALIYUN_OSS_BUCKET!

export async function uploadToOSS(buffer: Buffer, key: string): Promise<string> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
  }))
  return `https://${bucket}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${key}`
}

export async function deleteFromOSS(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}
