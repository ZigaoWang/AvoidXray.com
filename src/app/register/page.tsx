import type { Metadata } from 'next'
import AuthShell from '@/components/auth/AuthShell'
import RegisterForm, { RegisterFooter } from '@/components/auth/RegisterForm'
import { getAuthShowcase } from '@/lib/authShowcase'

export const metadata: Metadata = {
  title: 'Join',
  description:
    'Create an AvoidXray account to share your film scans, tag the stock and camera you shot on, and see how every roll really renders.',
}

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const showcase = await getAuthShowcase()

  return (
    <AuthShell
      title="Join AvoidXray"
      subtitle="Share what you shot, tag the stock and the camera, and show people how a roll really renders."
      showcase={showcase}
      footer={<RegisterFooter />}
    >
      <RegisterForm />
    </AuthShell>
  )
}
