'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/apiError'
import FieldLabel from '@/components/ui/FieldLabel'
import { fieldClass } from '@/components/ui/Field'
import Button from '@/components/ui/Button'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password'

export default function SettingsPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [twitter, setTwitter] = useState('')
  const [email, setEmail] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [username, setUsername] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/user').then(r => r.json()).then(user => {
      setName(user.name || '')
      setBio(user.bio || '')
      setWebsite(user.website || '')
      setInstagram(user.instagram || '')
      setTwitter(user.twitter || '')
      setEmail(user.email || '')
      setAvatar(user.avatar || null)
      setUsername(user.username || '')
    })
  }, [status])

  // Redirecting from the render body is a side effect during render, which
  // React is free to run more than once or discard; an effect is where a
  // navigation belongs. Rendering nothing meanwhile avoids a flash of the
  // signed-out form.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') return null

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setAvatarFile(file); setAvatar(URL.createObjectURL(file)) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    let avatarPath = (session?.user as { avatar?: string } | undefined)?.avatar
    if (avatarFile) {
      const formData = new FormData()
      formData.append('file', avatarFile)
      const uploadRes = await fetch('/api/avatar', { method: 'POST', body: formData })
      // A rejected avatar used to be ignored: the save carried on with the old
      // one and still reported "Settings saved", so the picture silently never
      // changed. Stopping here keeps the rest of the form as typed.
      if (!uploadRes.ok) {
        toast(await apiErrorMessage(uploadRes, 'Could not upload that image'), 'error')
        setSaving(false)
        return
      }
      avatarPath = (await uploadRes.json()).path
    }
    const res = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar: avatarPath, bio, website, instagram, twitter })
    })
    if (res.ok) {
      await update({ name, avatar: avatarPath })
      router.refresh()
      toast('Settings saved!', 'success')
    } else {
      // The server explains why — an unusable website URL, for instance.
      toast(await apiErrorMessage(res, 'Could not save your settings'), 'error')
    }
    setSaving(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast('Passwords do not match', 'error'); return }
    // The shared rule rather than a local "at least 8". This form's own copy
    // knew nothing about the 72-byte bcrypt ceiling, so a long passphrase
    // passed here and was refused by the server with a different message.
    const problem = passwordProblem(newPassword)
    if (problem) { toast(problem, 'error'); return }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      if (res.ok) {
        toast('Password changed', 'success')
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      } else {
        toast(await apiErrorMessage(res, 'Could not change your password'), 'error')
      }
    } catch {
      // Unhandled, this rejected with savingPassword still true and left the
      // button reading "Saving..." with nothing said about why.
      toast('Could not reach the server. Check your connection and try again.', 'error')
    } finally {
      setSavingPassword(false)
    }
  }


  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <ClientHeader />

      <main className="flex-1 max-w-xl mx-auto w-full py-16 px-6">
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Settings</h1>
        <p className="text-neutral-500 text-sm mb-10">Manage your profile and account</p>

        {/* Profile Section */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wider mb-6 pb-2 border-b border-neutral-800">Profile</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <FieldLabel>Avatar</FieldLabel>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-neutral-800 flex items-center justify-center text-white text-2xl font-bold overflow-hidden shrink-0">
                  {avatar ? (
                    <Image src={avatar} alt="Your profile avatar" width={80} height={80} className="w-full h-full object-cover" />
                  ) : (
                    (name || username || '?').charAt(0).toUpperCase()
                  )}
                </div>
                <label className="cursor-pointer bg-neutral-800 text-white px-4 py-2 text-sm hover:bg-neutral-700 transition-colors font-medium">
                  Change Photo
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </label>
              </div>
            </div>

            <div>
              <FieldLabel>Username</FieldLabel>
              <input type="text" value={username} disabled className={fieldClass} />
              <p className="text-neutral-600 text-xs mt-1">Username cannot be changed</p>
            </div>

            <div>
              <FieldLabel>Email</FieldLabel>
              <input type="email" value={email} disabled className={fieldClass} />
            </div>

            <div>
              <FieldLabel>Display Name</FieldLabel>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={fieldClass} placeholder="Your name" />
            </div>

            <div>
              <FieldLabel>Bio</FieldLabel>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Tell us about yourself..." className={`${fieldClass} resize-none`} />
            </div>

            <div>
              <FieldLabel>Website</FieldLabel>
              <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourwebsite.com" className={fieldClass} />
            </div>

            <div>
              <FieldLabel>Instagram</FieldLabel>
              <div className="flex">
                {/* Matches the control it is joined to: same border colour and
                    the same vertical padding. It used border-neutral-800
                    against the field's -700 and p-3 against its py-2.5, so the
                    two halves of one control were a different height and a
                    different colour where they met. */}
                <span className="flex items-center bg-neutral-800 px-3 py-2.5 text-sm text-neutral-500 border border-r-0 border-neutral-700">@</span>
                <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="username" className={`${fieldClass} flex-1`} />
              </div>
            </div>

            <div>
              <FieldLabel>Twitter / X</FieldLabel>
              <div className="flex">
                {/* Matches the control it is joined to: same border colour and
                    the same vertical padding. It used border-neutral-800
                    against the field's -700 and p-3 against its py-2.5, so the
                    two halves of one control were a different height and a
                    different colour where they met. */}
                <span className="flex items-center bg-neutral-800 px-3 py-2.5 text-sm text-neutral-500 border border-r-0 border-neutral-700">@</span>
                <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="username" className={`${fieldClass} flex-1`} />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={saving} size="sm">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </section>

        {/* Password Section */}
        <section>
          <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wider mb-6 pb-2 border-b border-neutral-800">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div>
              <FieldLabel>Current Password</FieldLabel>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className={fieldClass} />
            </div>
            <div>
              <FieldLabel>New Password</FieldLabel>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} className={fieldClass} aria-describedby="new-password-hint" />
              <p id="new-password-hint" className="text-neutral-600 text-xs mt-1">At least {MIN_PASSWORD_LENGTH} characters.</p>
            </div>
            <div>
              <FieldLabel>Confirm New Password</FieldLabel>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={fieldClass} />
            </div>
            <div className="pt-2">
              {/* The shared component, like every other submit on the site.
                  This was the last hand-rolled one: a different height, a
                  different weight, sentence case, and its own disabled
                  opacity, sitting directly below Save Changes which is none of
                  those things. */}
              <Button type="submit" disabled={savingPassword} size="sm" variant="secondary">
                {savingPassword ? 'Saving…' : 'Change password'}
              </Button>
            </div>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  )
}
