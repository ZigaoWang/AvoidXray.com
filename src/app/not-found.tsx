import { ButtonLink } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-8xl font-black text-[#D32F2F] mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-2">Film Fogged</h1>
        <p className="text-neutral-500 mb-8">This page got exposed to light.</p>
        <ButtonLink  href="/">
          Go Home
        </ButtonLink>
      </div>
    </div>
  )
}
