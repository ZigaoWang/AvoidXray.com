import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { allPage, loosePage, matchingIds, rollPage } from '@/lib/library/browse'
import { parseFilters } from '@/lib/library/requests'
import { searchLibrary } from '@/lib/library/search'

/**
 * A page of the library: rolls (`section=rolls`), photos in no roll
 * (`section=loose`), every photo (`section=all`, `sort=shot|uploaded`), or
 * every matching id (`section=ids`), narrowed by the filters and search in the
 * query string.
 */
export async function GET(req: NextRequest) {
  const user = await requireLibraryUser()
  if (user instanceof NextResponse) return user

  const params = req.nextUrl.searchParams
  const page = Math.max(0, Math.min(10000, Number(params.get('page')) || 0))
  const { q, ...filters } = parseFilters(params)
  let contentSearched = true
  let ids: string[] | undefined
  if (q) {
    const found = await searchLibrary(user.id, q)
    ids = found.ids
    contentSearched = found.contentSearched
  }

  const section = params.get('section')
  const scoped = { ...filters, ids }
  if (section === 'ids') return NextResponse.json({ ...(await matchingIds(user.id, scoped)), contentSearched })
  if (section === 'all') {
    const sort = params.get('sort') === 'uploaded' ? 'uploaded' : 'shot'
    return NextResponse.json({ ...(await allPage(user.id, scoped, page, sort)), contentSearched })
  }
  if (section === 'loose') {
    return NextResponse.json({ ...(await loosePage(user.id, scoped, page)), contentSearched })
  }
  return NextResponse.json({ ...(await rollPage(user.id, scoped, page)), contentSearched })
}
