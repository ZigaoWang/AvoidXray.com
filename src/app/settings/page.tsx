'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ClientHeader from '@/components/ClientHeader'
import Footer from '@/components/Footer'
import { useToast } from '@/components/ui/Toast'

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

  if (status === 'loading') return null
  if (!session) { router.push('/login'); return null }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setAvatarFile(file); setAvatar(URL.createObjectURL(file)) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    let avatarPath = (session.user as { avatar?: string }).avatar
    if (avatarFile) {
      const formData = new FormData()
      formData.append('file', avatarFile)
      const uploadRes = await fetch('/api/avatar', { method: 'POST', body: formData })
      if (uploadRes.ok) avatarPath = (await uploadRes.json()).path
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
      toast('Error saving settings', 'error')
    }
    setSaving(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast('Passwords do not match', 'error'); return }
    if (newPassword.length < 8) { toast('Password must be at least 8 characters', 'error'); return }
    setSavingPassword(true)
    const res = await fetch('/api/user/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    })
    const data = await res.json()
    if (res.ok) {
      toast('Password changed!', 'success')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } else {
      toast(data.error || 'Error changing password', 'error')
    }
    setSavingPassword(false)
  }

  const inputClass = 'w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-[#D32F2F] focus:outline-none'
  const labelClass = 'block text-neutral-500 text-xs uppercase tracking-wider mb-2 font-medium'

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
              <label className={labelClass}>Avatar</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-neutral-800 flex items-center justify-center text-white text-2xl font-bold overflow-hidden shrink-0">
                  {avatar ? (
                    <Image src={avatar} alt="" width={80} height={80} className="w-full h-full object-cover" />
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
              <label className={labelClass}>Username</label>
              <input type="text" value={username} disabled className="w-full p-3 bg-neutral-900 text-neutral-500 border border-neutral-800 cursor-not-allowed" />
              <p className="text-neutral-600 text-xs mt-1">Username cannot be changed</p>
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} disabled className="w-full p-3 bg-neutral-900 text-neutral-500 border border-neutral-800 cursor-not-allowed" />
            </div>

            <div>
              <label className={labelClass}>Display Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="Your name" />
            </div>

            <div>
              <label className={labelClass}>Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Tell us about yourself..." className={`${inputClass} resize-none`} />
            </div>

            <div>
              <label className={labelClass}>Website</label>
              <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourwebsite.com" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Instagram</label>
              <div className="flex">
                <span className="p-3 bg-neutral-800 text-neutral-500 border border-r-0 border-neutral-800 text-sm">@</span>
                <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="username" className={`${inputClass} flex-1`} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Twitter / X</label>
              <div className="flex">
                <span className="p-3 bg-neutral-800 text-neutral-500 border border-r-0 border-neutral-800 text-sm">@</span>
                <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="username" className={`${inputClass} flex-1`} />
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" disabled={saving} className="bg-[#D32F2F] text-white px-8 py-2.5 text-sm font-medium hover:bg-[#B71C1C] disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </section>

        {/* Password Section */}
        <section>
          <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wider mb-6 pb-2 border-b border-neutral-800">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div>
              <label className={labelClass}>Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} className={inputClass} />
              <p className="text-neutral-600 text-xs mt-1">Minimum 8 characters</p>
            </div>
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className={inputClass} />
            </div>
            <div className="pt-2">
              <button type="submit" disabled={savingPassword} className="bg-neutral-800 text-white px-8 py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition-colors">
                {savingPassword ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  )
}
