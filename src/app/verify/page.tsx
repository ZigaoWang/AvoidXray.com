import type { Metadata } from 'next'
import { hashToken } from '@/lib/tokens'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import AuthShell from '@/components/auth/AuthShell'
import Button from '@/components/ui/Button'
import { textLinkClass } from '@/components/ui/TextLink'
import { getAuthShowcase } from '@/lib/authShowcase'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { LIMITS, limitKey } from '@/lib/rateLimitPolicy'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The page a verification email links to.
 *
 * Opening the link used to verify the account on the spot. Mail security
 * scanners such as Outlook Safe Links open every link in a message before the
 * person does, so the scanner spent the token and the person who clicked it
 * was told the link had expired. Confirming is now a button press, which a
 * scanner following links does not make.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const showcase = await getAuthShowcase()

  async function confirm(formData: FormData) {
    'use server'
    const submitted = String(formData.get('token') ?? '')

    // The same policy as the reset token: 256 bits of randomness at an
    // unauthenticated endpoint is still a lookup per request.
    const ip = clientIp(await headers())
    const byIp = rateLimit(limitKey('verify-ip', ip), LIMITS.passwordReset.perIp.limit, LIMITS.passwordReset.perIp.windowMs)
    if (!byIp.ok) redirect('/login?error=rate')

    // Checking and spending the token in one statement, so a double press
    // cannot verify twice or race a resend.
    const { count } = submitted
      ? await prisma.user.updateMany({
          where: { verificationToken: hashToken(submitted), verificationTokenExpiry: { gt: new Date() } },
          data: { emailVerified: true, verificationToken: null, verificationTokenExpiry: null },
        })
      : { count: 0 }

    redirect(count > 0 ? '/login?verified=true' : '/login?error=expired')
  }

  return (
    <AuthShell
      title="Confirm your email"
      subtitle={token ? 'Press the button to finish creating your account.' : 'This link is missing its code.'}
      showcase={showcase}
      footer={
        <p>
          Already confirmed?{' '}
          <Link href="/login" className={textLinkClass}>
            Sign in
          </Link>
        </p>
      }
    >
      {token ? (
        <form action={confirm}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" size="lg" fullWidth>
            Confirm email
          </Button>
        </form>
      ) : (
        <p className="text-sm text-neutral-400">
          Open the link from the email again, or{' '}
          <Link href="/login" className={textLinkClass}>
            sign in
          </Link>{' '}
          and we will send a new one.
        </p>
      )}
    </AuthShell>
  )
}
