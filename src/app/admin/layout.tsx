import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AdminNav from './AdminNav'
import { isAdminSession } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

/**
 * One gate and one frame for every admin page.
 *
 * The permission check lived in each page separately, which meant a new page
 * was unprotected until someone remembered to add it. A layout cannot be
 * bypassed by adding a route beneath it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminSession())) redirect('/')

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col">
      <Header />
      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <AdminNav />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  )
}
