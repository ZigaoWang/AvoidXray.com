import { permanentRedirect } from 'next/navigation'

/** The first address of the account changes log, which also lists the library beta now. */
export default function Page() {
  permanentRedirect('/admin/account-changes')
}
