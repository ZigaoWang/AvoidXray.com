import SegmentedLinks from '@/components/ui/SegmentedLinks'
import { sectionHeadingClass } from '@/components/ui/PageHeader'
import { SAMPLE_ORDERS, SAMPLE_ORDER_LABELS, type SampleOrder } from '@/lib/feedFirstPage'

/**
 * The heading over a gear page's sample photos: what they are, how many, and
 * the order they are in.
 *
 * The film, camera and pairing pages each drew this row by hand, and none of
 * them could reorder their photos. One component, so the three stay alike.
 */
export default function SamplePhotosHeader({
  title,
  summary,
  order,
  basePath,
  total,
}: {
  title: string
  /** "120 photos from 14 photographers", or whatever the page counts. */
  summary?: React.ReactNode
  order: SampleOrder
  /** The page's canonical path; the default order is the plain URL. */
  basePath: string
  total: number
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h2 className={sectionHeadingClass}>{title}</h2>
        {summary && <p className="mt-1 text-sm text-neutral-500">{summary}</p>}
      </div>
      {/* Only where there is something to reorder. */}
      {total > 1 && (
        <SegmentedLinks
          label="Order photos"
          options={SAMPLE_ORDERS.map(value => ({ value, label: SAMPLE_ORDER_LABELS[value] }))}
          active={order}
          hrefFor={value => (value === 'random' ? basePath : `${basePath}?order=${value}`)}
          scroll={false}
        />
      )}
    </div>
  )
}
