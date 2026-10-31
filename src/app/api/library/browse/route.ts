import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { allPage, loosePage, matchingIds, rankedPage, rollPage } from '@/lib/library/browse'
import { parseFilters } from '@/lib/library/requests'
import { searchLibrary } from '@/lib/library/search'

/**
 * A page of the library: rolls (`section=rolls`), photos in no roll
 * (`section=loose`), every photo (`section=all`, `sort=shot|uploaded`), the
 * photos a search found only by what they show (`section=lookalike`), or
 * every matching id (`section=ids`), narrowed by the filters and search in the
 * query string. Rolls, loose photos and every photo hold the search's other
 * matches, so a look-alike is shown once, in its own section.
 */
export async function GET(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user

  const params = req.nextUrl.searchParams
  const page = Math.max(0, Math.min(10000, Number(params.get('page')) || 0))
  const { q, ...filters } = parseFilters(params)
  let contentSearched = true
  let ids: string[] | undefined
  let lookalike: string[] = []
  if (q) {
    const found = await searchLibrary(user.id, q)
    ids = found.ids
    lookalike = found.lookalike
    contentSearched = found.contentSearched
  }

  const section = params.get('section')
  if (section === 'ids') return NextResponse.json({ ...(await matchingIds(user.id, { ...filters, ids })), contentSearched })
  if (section === 'lookalike') {
    return NextResponse.json({ ...(await rankedPage(user.id, { ...filters, ids: lookalike }, page)), contentSearched })
  }
  const shown = new Set(lookalike)
  const scoped = { ...filters, ids: ids?.filter(id => !shown.has(id)) }
  if (section === 'all') {
    const sort = params.get('sort') === 'uploaded' ? 'uploaded' : 'shot'
    return NextResponse.json({ ...(await allPage(user.id, scoped, page, sort)), contentSearched })
  }
  if (section === 'loose') {
    return NextResponse.json({ ...(await loosePage(user.id, scoped, page)), contentSearched })
  }
  return NextResponse.json({ ...(await rollPage(user.id, scoped, page)), contentSearched })
}
