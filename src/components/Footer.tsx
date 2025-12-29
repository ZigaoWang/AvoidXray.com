import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <Link href="/" className="text-white text-lg mb-6 block" >
              Film Gallery
            </Link>
            <p className="text-neutral-600 text-sm leading-relaxed max-w-sm">
              A space for analog photography. Share your work, discover film stocks, connect with photographers.
            </p>
          </div>

          <div>
            <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-6">Explore</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/" className="text-neutral-600 hover:text-white transition-colors">Gallery</Link></li>
              <li><Link href="/films" className="text-neutral-600 hover:text-white transition-colors">Film Stocks</Link></li>
              <li><Link href="/cameras" className="text-neutral-600 hover:text-white transition-colors">Cameras</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-6">Account</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/login" className="text-neutral-600 hover:text-white transition-colors">Sign In</Link></li>
              <li><Link href="/register" className="text-neutral-600 hover:text-white transition-colors">Create Account</Link></li>
              <li><Link href="/upload" className="text-neutral-600 hover:text-white transition-colors">Upload</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-900 pt-8">
          <p className="text-neutral-700 text-xs leading-relaxed mb-8">
            All photographs remain the intellectual property of their respective authors. Film Gallery serves as a hosting platform and assumes no responsibility for user-uploaded content.
          </p>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-neutral-700">
            <p>© {new Date().getFullYear()} Film Gallery</p>
            <p>
              Built by{' '}
              <a href="https://zigao.wang" target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white transition-colors">
                Zigao Wang
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
