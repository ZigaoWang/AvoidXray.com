'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_RESOURCES, RESOURCE_ORDER } from '@/lib/admin/resources'

const EXTRA = [
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/feedback', label: 'Reports' },
  { href: '/admin/maintenance', label: 'Maintenance' },
] as const

export default function AdminNav() {
  const pathname = usePathname() ?? ''

  const item = (href: string, label: string, badge?: string) => {
    const current = pathname === href
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? 'page' : undefined}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm border-l-2 transition-colors ${
          current
            ? 'text-white border-[#D32F2F] bg-neutral-900'
            : 'text-neutral-400 border-transparent hover:text-white hover:bg-neutral-900/60'
        }`}
      >
        <span>{label}</span>
        {badge && <span className="text-[10px] text-neutral-500 tabular-nums">{badge}</span>}
      </Link>
    )
  }

  return (
    <nav
      aria-label="Admin sections"
      className="lg:w-52 flex-shrink-0 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible
                 border-b lg:border-b-0 lg:border-r border-neutral-900 pb-2 lg:pb-0 lg:pr-4"
    >
      {item('/admin', 'Overview')}
      <p className="hidden lg:block px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-neutral-600">
        Content
      </p>
      {RESOURCE_ORDER.map(name => item(`/admin/${name}`, ADMIN_RESOURCES[name].plural))}
      <p className="hidden lg:block px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-neutral-600">
        Operations
      </p>
      {EXTRA.map(e => item(e.href, e.label))}
    </nav>
  )
}
