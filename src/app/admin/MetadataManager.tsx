'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Item = { id: string; name: string; _count: { photos: number } }

export default function MetadataManager({
  title,
  type,
  items
}: {
  title: string
  type: 'camera' | 'filmStock'
  items: Item[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const startEdit = (item: Item) => {
    setEditing(item.id)
    setName(item.name)
  }

  const save = async () => {
    if (!editing) return
    setLoading(true)
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id: editing, name })
    })
    setEditing(null)
    setLoading(false)
    router.refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this item?')) return
    setLoading(true)
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id })
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="bg-neutral-900 p-4">
      <h3 className="text-white font-semibold mb-3">{title}</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {editing === item.id ? (
              <>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="flex-1 bg-neutral-800 text-white px-2 py-1 text-sm"
                  placeholder="Name"
                />
                <button onClick={save} disabled={loading} className="text-green-500 hover:text-green-400">Save</button>
                <button onClick={() => setEditing(null)} className="text-neutral-500 hover:text-white">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-neutral-300">
                  {item.name}
                  <span className="text-neutral-600 ml-2">({item._count.photos})</span>
                </span>
                <button onClick={() => startEdit(item)} className="text-neutral-500 hover:text-white">Edit</button>
                <button onClick={() => remove(item.id)} className="text-red-500 hover:text-red-400">Delete</button>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-neutral-600 text-sm">No items</p>}
      </div>
    </div>
  )
}
