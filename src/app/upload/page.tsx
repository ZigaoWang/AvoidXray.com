import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasFeature } from '@/lib/features'
import ImportPage from '@/app/library/import/ImportPage'
import ClassicUpload from './ClassicUpload'

/**
 * The one uploader. An account with the library gets the library's: rolls,
 * private originals, resumable uploads, duplicates skipped. Everyone else keeps
 * the classic page until the library opens to all. So does an admin uploading
 * for someone else (`asUserId`), which only the classic page knows how to do.
 */
export default async function UploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const viewer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }) : null
  if (hasFeature(viewer, 'library') && !params.asUserId) {
    // From a film or camera page's "Shoot to unlock": its film or camera goes
    // on each new roll. Only ids the catalog has, or every roll would be refused.
    const one = (v: string | string[] | undefined) => (typeof v === 'string' && v.length < 100 ? v : undefined)
    const [film, camera] = await Promise.all([
      one(params.film) ? prisma.filmStock.findUnique({ where: { id: one(params.film) }, select: { id: true } }) : null,
      one(params.camera) ? prisma.camera.findUnique({ where: { id: one(params.camera) }, select: { id: true } }) : null,
    ])
    return <ImportPage prefill={{ ...(film ? { filmStockId: film.id } : {}), ...(camera ? { cameraId: camera.id } : {}) }} />
  }
  return <ClassicUpload />
}
