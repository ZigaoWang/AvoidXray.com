/**
 * The catalogue's gaps, written out as a research brief.
 *
 * Generated from the database rather than kept by hand, so it cannot drift from
 * what is actually stored. Every entry lists what is recorded, what is missing,
 * and which existing claims rest on a citation whose supporting passage was
 * never captured — the state that made a correct citation on Fujifilm 400 look
 * like a careless one.
 *
 *   npx tsx scripts/research-brief.ts > research-brief.md
 */
import { PrismaClient } from '@prisma/client'
import { filmFormatLabel } from '../src/lib/filmFields'

const prisma = new PrismaClient()

interface Claim { claim?: string | null; url?: string | null; editorial?: boolean | null }

function passageState(sourceUrl: string | null, claims: unknown): string {
  if (!sourceUrl) return ''
  const list = (Array.isArray(claims) ? claims : []) as Claim[]
  const supporting = list.filter(c => !c.editorial && c.claim)
  return supporting.length > 0 ? `cited, passage recorded` : `cited, NO PASSAGE RECORDED`
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.length ? value.join(', ') : ''
  return String(value)
}

async function main() {
  const brands = new Map((await prisma.brand.findMany({ select: { id: true, name: true } })).map(b => [b.id, b.name]))
  const provenance = await prisma.fieldProvenance.findMany({
    select: { entityType: true, entityId: true, fieldName: true, sourceUrl: true, claims: true, source: true },
  })
  const provFor = (type: string, id: string) =>
    provenance.filter(p => p.entityType === type && p.entityId === id)

  const films = await prisma.filmStock.findMany({ orderBy: { name: 'asc' } })
  const cameras = await prisma.camera.findMany({ orderBy: { name: 'asc' } })
  const variants = await prisma.filmVariant.findMany({ select: { filmStockId: true, format: true } })

  const out: string[] = []
  out.push(`# AvoidXray catalogue: research brief`)
  out.push('')
  out.push(`${films.length} film stocks and ${cameras.length} cameras. Generated from the live database.`)
  out.push('')

  const FILM_FIELDS: Array<[string, (f: typeof films[number]) => unknown]> = [
    ['iso', f => f.iso],
    ['process', f => f.process],
    ['chromaticity', f => f.chromaticity],
    ['polarity', f => f.polarity],
    ['colorBalance', f => f.colorBalance],
    ['filmType', f => f.filmType],
    ['format', f => f.format],
    ['exposures', f => f.exposures],
    ['aliases', f => f.aliases],
    ['summary', f => f.summary],
    ['description', f => f.description],
  ]

  out.push(`## Film stocks`)
  out.push('')
  for (const f of films) {
    const p = provFor('FILM_STOCK', f.id)
    const cite = (field: string) => {
      const row = p.find(r => r.fieldName === field)
      if (!row) return ''
      return passageState(row.sourceUrl, row.claims)
    }
    const maker =
      f.manufacturerStatus === 'SAME_AS_BRAND'
        ? `${brands.get(f.brandId ?? '') ?? f.brand ?? '?'} (coats its own)`
        : `${brands.get(f.manufacturedByBrandId ?? '') ?? '?'} (${f.manufacturerStatus})`

    out.push(`### ${f.name}`)
    out.push(`- slug: \`${f.slug ?? '(none)'}\``)
    out.push(`- brand: ${brands.get(f.brandId ?? '') ?? f.brand ?? '(none)'}`)
    out.push(`- manufacturer: ${maker} ${cite('manufacturerStatus') ? `[${cite('manufacturerStatus')}]` : '[UNCITED]'}`)
    if (f.parentStockId) {
      const parent = films.find(x => x.id === f.parentStockId)
      out.push(`- respooled from: ${parent?.name ?? f.parentStockId}`)
    }
    // Labelled, not the raw enum member: the person reading this should see
    // 35mm, which is what the box says, rather than MM35.
    const sold = variants.filter(v => v.filmStockId === f.id).map(v => filmFormatLabel(v.format) ?? v.format)
    if (sold.length) out.push(`- sold in: ${sold.join(', ')}`)

    const missing: string[] = []
    const uncited: string[] = []
    for (const [field, get] of FILM_FIELDS) {
      const value = fmt(get(f))
      if (!value) { missing.push(field); continue }
      const state = cite(field)
      if (!state) uncited.push(field)
      else if (state.includes('NO PASSAGE')) uncited.push(`${field} (cited, no passage)`)
    }
    out.push(`- recorded: ${FILM_FIELDS.filter(([, g]) => fmt(g(f))).map(([k, g]) => `${k}=${fmt(g(f)).slice(0, 40)}`).join('; ') || '(nothing)'}`)
    out.push(`- **missing**: ${missing.join(', ') || 'nothing'}`)
    out.push(`- **needs a source**: ${uncited.join(', ') || 'nothing'}`)
    out.push('')
  }

  const CAMERA_FIELDS: Array<[string, (c: typeof cameras[number]) => unknown]> = [
    ['bodyType', c => c.bodyType],
    ['frameFormat', c => c.frameFormat],
    ['format', c => c.format],
    ['mountType', c => c.mountType],
    ['year', c => c.year],
    ['aliases', c => c.aliases],
    ['summary', c => c.summary],
    ['description', c => c.description],
  ]

  out.push(`## Cameras`)
  out.push('')
  for (const c of cameras) {
    const p = provFor('CAMERA', c.id)
    const cite = (field: string) => {
      const row = p.find(r => r.fieldName === field)
      if (!row) return ''
      return passageState(row.sourceUrl, row.claims)
    }
    out.push(`### ${c.brand ? `${c.brand} ` : ''}${c.name}`)
    out.push(`- slug: \`${c.slug ?? '(none)'}\``)

    const missing: string[] = []
    const uncited: string[] = []
    for (const [field, get] of CAMERA_FIELDS) {
      const value = fmt(get(c))
      if (!value) { missing.push(field); continue }
      const state = cite(field)
      if (!state) uncited.push(field)
      else if (state.includes('NO PASSAGE')) uncited.push(`${field} (cited, no passage)`)
    }
    out.push(`- recorded: ${CAMERA_FIELDS.filter(([, g]) => fmt(g(c))).map(([k, g]) => `${k}=${fmt(g(c)).slice(0, 40)}`).join('; ') || '(nothing)'}`)
    out.push(`- **missing**: ${missing.join(', ') || 'nothing'}`)
    out.push(`- **needs a source**: ${uncited.join(', ') || 'nothing'}`)
    out.push('')
  }

  console.log(out.join('\n'))
  await prisma.$disconnect()
}

main()
