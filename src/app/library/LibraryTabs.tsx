import UnderlineTabs from '@/components/ui/UnderlineTabs'

/**
 * The library's sections: its rolls, every photo, albums and the Trash. On
 * every page of the library, so moving between them never changes the frame.
 * `query` keeps the filters when switching between Rolls and All photos.
 */
export default function LibraryTabs({ current, query = '', trailing }: {
  current: 'rolls' | 'all' | 'albums' | 'trash'
  query?: string
  /** Something at the far end of the row, such as New album. */
  trailing?: React.ReactNode
}) {
  const view = (all: boolean) => {
    const q = new URLSearchParams(query)
    if (all) q.set('view', 'all')
    else q.delete('view')
    const s = q.toString()
    return s ? `/library?${s}` : '/library'
  }
  return (
    <UnderlineTabs
      label="Your library"
      tabs={[
        { href: view(false), label: 'Rolls', current: current === 'rolls' },
        { href: view(true), label: 'All photos', current: current === 'all' },
        { href: '/albums', label: 'Albums', current: current === 'albums' },
        { href: '/library/trash', label: 'Trash', current: current === 'trash' },
      ]}
      trailing={trailing}
    />
  )
}
