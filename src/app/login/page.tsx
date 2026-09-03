import type { Metadata } from 'next'
import AuthShell from '@/components/auth/AuthShell'
import LoginForm, { LoginFooter } from '@/components/auth/LoginForm'
import { getAuthShowcase } from '@/lib/authShowcase'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to AvoidXray to upload scans, build albums and follow other film photographers.',
  robots: { index: false, follow: true },
}

// The showcase is a live count and a live set of photographs, so this cannot
// be cached at build time.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const showcase = await getAuthShowcase()

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Your albums, your rolls, and everyone you follow."
      showcase={showcase}
      footer={<LoginFooter />}
    >
      <LoginForm />
    </AuthShell>
  )
}
