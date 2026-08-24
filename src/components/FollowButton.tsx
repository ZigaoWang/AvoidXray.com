'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from './ui/Toast'
import Button from '@/components/ui/Button'

export default function FollowButton({ username, initialFollowing }: { username: string; initialFollowing: boolean }) {
  const { data: session } = useSession()
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const currentUsername = (session?.user as { username?: string })?.username

  if (!session || currentUsername === username) return null

  const handleFollow = async () => {
    if (loading) return
    setLoading(true)

    const res = await fetch('/api/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })

    if (res.ok) {
      const data = await res.json()
      setFollowing(data.following)
      toast(data.following ? `Following @${username}` : `Unfollowed @${username}`, 'success')
    } else {
      toast('Failed to update follow status', 'error')
    }
    setLoading(false)
  }

  return (
    <Button
      onClick={handleFollow}
      disabled={loading}
      size="sm"
      // Following is the resting state, so it steps down to secondary once set.
      variant={following ? 'secondary' : 'primary'}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
