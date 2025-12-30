'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export default function SortDropdown({ current }: { current: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value === 'recent') {
      params.delete('sort')
    } else {
      params.set('sort', e.target.value)
    }
    router.push(`/?${params.toString()}`)
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="bg-neutral-900 text-neutral-400 text-xs border border-neutral-800 px-3 py-1.5 focus:outline-none focus:border-neutral-600 cursor-pointer"
    >
      <option value="recent">Recent</option>
      <option value="popular">Popular</option>
      <option value="random">Random</option>
    </select>
  )
}
