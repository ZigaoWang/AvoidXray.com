import ResourceTable from '../ResourceTable'

/**
 * Drafts and private frames are invisible everywhere else on the site, so the
 * one place an admin can see them offers them as presets rather than making
 * someone guess a query.
 */
const FILTERS = [
  { value: 'unpublished', label: 'Unpublished' },
  { value: 'private', label: 'Private' },
] as const

export default function Page() {
  return <ResourceTable resource="photos" filters={FILTERS} />
}
