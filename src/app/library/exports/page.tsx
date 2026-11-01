import { permanentRedirect } from 'next/navigation'

/** The Downloads tab's first address, kept for links already sent. */
export default function Page() {
  permanentRedirect('/library/downloads')
}
