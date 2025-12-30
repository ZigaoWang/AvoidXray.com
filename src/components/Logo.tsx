import Link from 'next/link'

type LogoProps = {
  size?: 'sm' | 'md'
  asLink?: boolean
}

export default function Logo({ size = 'md', asLink = true }: LogoProps) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  const logo = (
    <span className="inline-flex items-center gap-1">
      <span className={`bg-[#D32F2F] text-white font-black ${textSize} px-2 py-1 tracking-tight`}>AVOID</span>
      <span className={`bg-white text-black font-black ${textSize} px-2 py-1 tracking-tight`}>X RAY</span>
    </span>
  )

  if (!asLink) return logo

  return <Link href="/">{logo}</Link>
}
