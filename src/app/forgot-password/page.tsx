import type { Metadata } from 'next'
import AuthShell from '@/components/auth/AuthShell'
import ForgotPasswordForm, { ForgotPasswordFooter } from '@/components/auth/ForgotPasswordForm'
import { getAuthShowcase } from '@/lib/authShowcase'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: true },
}

export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage() {
  const showcase = await getAuthShowcase()

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Tell us the address on your account and we will send you a link."
      showcase={showcase}
      footer={<ForgotPasswordFooter />}
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
