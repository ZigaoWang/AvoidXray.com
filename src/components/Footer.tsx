import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-neutral-800/50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-block mb-4">
              <Image src="/logo.svg" alt="AvoidXray" width={120} height={24} />
            </Link>
            <p className="text-neutral-500 text-sm mb-2">
              Protect your film. Share your work.
            </p>
            <p className="text-neutral-600 text-xs">
              &copy; {new Date().getFullYear()} AvoidXray. All images &copy; their respective owners.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Explore</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/explore" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Photos
              </Link>
              <Link href="/films" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Film Stocks
              </Link>
              <Link href="/cameras" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Cameras
              </Link>
              {/* /discover/albums, not /albums. The latter is your own albums
                  and redirects to the sign-in page, so a visitor following
                  "Albums" out of a footer section headed Explore was sent to a
                  login form instead of to the albums. This is the same
                  destination the header nav uses. */}
              <Link href="/discover/albums" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Albums
              </Link>
            </nav>
          </div>

          {/* About & Contact */}
          <div>
            <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">About</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/guidelines" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Guidelines
              </Link>
              <p className="text-neutral-500 text-sm">
                Made by <a href="https://zigao.wang" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors">Zigao Wang</a>
              </p>
              <a href="https://github.com/ZigaoWang/avoidxray.com" target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-white text-sm transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                </svg>
                Source Code
              </a>
              <Link href="/legal" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Terms &amp; Privacy
              </Link>
              {/* Was a link to the GitHub issue tracker, which asked a film
                  photographer to make a developer account and write in public
                  in order to say a button did not work. */}
              <Link href="/feedback" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Feedback
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
