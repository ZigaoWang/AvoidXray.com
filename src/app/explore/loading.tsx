import { PageSkeleton, TitleSkeleton, MasonrySkeleton, Bar } from '@/components/ui/Skeleton'

/** Widths roughly matching Random / Recent / Popular / Following. */
const TAB_WIDTHS = ['w-14', 'w-14', 'w-16', 'w-20']

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <TitleSkeleton />
        {/* The feed tabs, on the rule they sit above. */}
        <div className="mb-8 flex gap-4 border-b border-neutral-800">
          {TAB_WIDTHS.map((width, i) => (
            <Bar key={i} className={`mb-3 h-4 ${width}`} />
          ))}
        </div>
        <MasonrySkeleton count={16} />
      </div>
    </PageSkeleton>
  )
}
