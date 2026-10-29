import { NextRequest, NextResponse } from 'next/server'
import { requireLibraryUser } from '@/lib/library/access'
import { loosePage, rollPage } from '@/lib/library/browse'
import { parseFilters } from '@/lib/library/requests'
import { searchLibrary } from '@/lib/library/search'

/**
 * A page of the library home: rolls (`section=rolls`) or photos in no roll
 * (`section=loose`), narrowed by the filters and search in the query string.
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

  if (params.get('section') === 'loose') {
    return NextResponse.json({ ...(await loosePage(user.id, { ...filters, ids }, page)), contentSearched })
  }
  return NextResponse.json({ ...(await rollPage(user.id, { ...filters, ids }, page)), contentSearched })
}
