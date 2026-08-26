import ResourceTable from '../ResourceTable'

const FILTERS = [{ value: 'open', label: 'Open' }] as const

export default function Page() {
  return <ResourceTable resource="reports" filters={FILTERS} />
}
