'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useToast } from './ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import Button from '@/components/ui/Button'
import { loginHrefHere } from '@/lib/loginHref'

export default function FollowButton({ username, initialFollowing }: { username: string; initialFollowing: boolean }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const currentUsername = (session?.user as { username?: string })?.username

  // Signed out, the button is still offered and leads to sign-in, as Like
  // does. Hiding it left a visitor no sign that following was possible.
  if (status === 'loading' || currentUsername === username) return null

  const handleFollow = async () => {
    if (loading) return
    if (!session) {
      router.push(loginHrefHere())
      return
    }
    setLoading(true)

    // finally, not a trailing setLoading: this guards with `if (loading)
    // return`, so a request that threw left the button disabled for the rest
    // of the visit.
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })

      if (res.ok) {
        const data = await res.json()
        setFollowing(data.following)
        toast(data.following ? `Following @${username}` : `Unfollowed @${username}`, 'success')
        // The follower count beside this button is rendered on the server, so
        // only the button changed: the profile went on claiming the number
        // from before the follow until the page was reloaded.
        router.refresh()
      } else {
        toast(await apiErrorMessage(res, 'Could not update follow status'), 'error')
      }
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setLoading(false)
    }
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
