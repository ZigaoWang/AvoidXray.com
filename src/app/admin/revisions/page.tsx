import RevisionQueue from './RevisionQueue'
import PageHeader from '@/components/ui/PageHeader'

export default function Page() {
  return (
    <div>
      <PageHeader title="Proposed changes" description="Contributor suggestions and anything generated wait here. Your own edits apply as you make them and are recorded rather than queued. Accept each field or refuse it with a reason." />
      <RevisionQueue />
    </div>
  )
}
