import type { Metadata } from 'next'
import AuthShell from '@/components/auth/AuthShell'
import ResetPasswordForm, { ResetPasswordFooter } from '@/components/auth/ResetPasswordForm'
import { getAuthShowcase } from '@/lib/authShowcase'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  const showcase = await getAuthShowcase()

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you have not used here before."
      showcase={showcase}
      footer={<ResetPasswordFooter />}
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}
