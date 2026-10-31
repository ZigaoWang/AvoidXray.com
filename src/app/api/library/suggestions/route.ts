import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireLibraryUser } from '@/lib/library/access'

/**
 * The film, camera and lab on the owner's most recently made roll that names
 * any, offered as suggestions on the next import. Suggestions only: nothing is
 * filled in until the owner picks one.
 */
export async function GET() {
  const user = await requireLibraryUser({ actAs: true })
  if (user instanceof NextResponse) return user

  const pick = (where: object) => prisma.roll.findFirst({
    where: { ownerId: user.id, ...where },
    orderBy: { createdAt: 'desc' },
    select: { filmStockId: true, cameraId: true, labId: true },
  })
  const [film, camera, lab] = await Promise.all([
    pick({ filmStockId: { not: null } }),
    pick({ cameraId: { not: null } }),
    pick({ labId: { not: null } }),
  ])
  return NextResponse.json({
    filmStockId: film?.filmStockId ?? null,
    cameraId: camera?.cameraId ?? null,
    labId: lab?.labId ?? null,
  })
}
