import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import bcrypt from 'bcryptjs'
import { rateLimit, clientIp } from './rateLimit'
import { LIMITS, limitKey } from './rateLimitPolicy'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const identifier = credentials.email.toLowerCase()

        // Password guessing is limited by source and, separately, by the
        // account being targeted — an attacker spreading attempts across many
        // addresses still hits a wall on the account they are after.
        //
        // next-auth hands `authorize` a plain header record rather than a
        // Headers instance, so it is adapted before reading the client address.
        const ip = clientIp(new Headers((req?.headers ?? {}) as Record<string, string>))
        const byIp = rateLimit(limitKey('login-ip', ip), LIMITS.login.perIp.limit, LIMITS.login.perIp.windowMs)
        const byIdentifier = rateLimit(limitKey('login-id', identifier), LIMITS.login.perIdentifier.limit, LIMITS.login.perIdentifier.windowMs)

        // Throwing rather than returning null so the sign-in page can tell
        // "wrong password" apart from "stop trying for a while"; returning null
        // would render as an ordinary credentials error.
        if (!byIp.ok || !byIdentifier.ok) {
          throw new Error('RATE_LIMITED')
        }

        // Try to find by email or username (case-insensitive)
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { username: identifier }
            ]
          },
          // Credential check needs the hash; the session payload needs the email.
          omit: { passwordHash: false, email: false }
        })

        if (!user) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        if (!user.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        return { id: user.id, email: user.email, name: user.name, username: user.username, avatar: user.avatar }
      }
    })
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.username = (user as { username?: string }).username
        token.name = user.name
        token.avatar = (user as { avatar?: string }).avatar
      }
      // Handle session update from client
      if (trigger === 'update') {
        if (session?.name !== undefined) token.name = session.name
        if (session?.avatar !== undefined) token.avatar = session.avatar
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string
        (session.user as { username?: string }).username = token.username as string
        session.user.name = token.name as string | null
        (session.user as { avatar?: string }).avatar = (token.avatar as string | null) || undefined
      }
      return session
    }
  }
}
