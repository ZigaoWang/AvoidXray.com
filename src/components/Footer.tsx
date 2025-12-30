import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-neutral-900 py-8">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Logo size="sm" />
        <p className="text-neutral-600 text-xs">
          &copy; {new Date().getFullYear()} &middot; Built by <a href="https://zigao.wang" className="hover:text-white transition-colors">Zigao Wang</a>
        </p>
      </div>
    </footer>
  )
}
