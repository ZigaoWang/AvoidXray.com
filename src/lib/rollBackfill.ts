/**
 * How photos uploaded before rolls existed are grouped into rolls.
 *
 * An owner's uploads are cut into sessions wherever more than SESSION_GAP_MS
 * passed between one upload and the next, and each session is then split by
 * camera and film. Splitting on every change of camera or film along the
 * upload order instead produced runs of single photos, because frames tagged
 * differently were uploaded interleaved in one batch: the order of a batch is
 * not the order of the frames.
 *
 * The gap is ten minutes because that is where the uploads themselves divide.
 * Inside a batch, one upload follows the last within seconds; between
 * batches the gap is hours or days, with almost nothing in between.
 *
 * A group of one photo is not a roll: it stays a loose photo.
 *
 * Pure, so the rule is tested without a database.
 */

export const SESSION_GAP_MS = 10 * 60 * 1000

export interface BackfillPhoto {
  id: string
  createdAt: Date
  cameraId: string | null
  filmStockId: string | null
  takenDate: Date | null
}

export interface ProposedRoll {
  cameraId: string | null
  filmStockId: string | null
  /** In upload order, which becomes the frame order. */
  photos: BackfillPhoto[]
  firstUpload: Date
  lastUpload: Date
  /**
   * The range of the dates owners typed on these photos, if any did. Never a
   * date read from a file: these were entered by hand.
   */
  shotFrom: Date | null
  shotTo: Date | null
}

/** One owner's photos, in any order, as proposed rolls ordered by first upload. Photos in no roll stay loose. */
export function proposeRolls(photos: BackfillPhoto[]): ProposedRoll[] {
  const sorted = [...photos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))

  const sessions: BackfillPhoto[][] = []
  for (const photo of sorted) {
    const session = sessions.at(-1)
    const previous = session?.at(-1)
    if (session && previous && photo.createdAt.getTime() - previous.createdAt.getTime() <= SESSION_GAP_MS) {
      session.push(photo)
    } else {
      sessions.push([photo])
    }
  }

  const rolls: ProposedRoll[] = []
  for (const session of sessions) {
    const groups = new Map<string, BackfillPhoto[]>()
    for (const photo of session) {
      const key = `${photo.cameraId ?? ''}\u0000${photo.filmStockId ?? ''}`
      const group = groups.get(key)
      if (group) group.push(photo)
      else groups.set(key, [photo])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const dates = group.flatMap(p => (p.takenDate ? [p.takenDate.getTime()] : []))
      rolls.push({
        cameraId: group[0].cameraId,
        filmStockId: group[0].filmStockId,
        photos: group,
        firstUpload: group[0].createdAt,
        lastUpload: group[group.length - 1].createdAt,
        shotFrom: dates.length ? new Date(Math.min(...dates)) : null,
        shotTo: dates.length ? new Date(Math.max(...dates)) : null,
      })
    }
  }
  return rolls.sort((a, b) => a.firstUpload.getTime() - b.firstUpload.getTime())
}
