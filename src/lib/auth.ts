import { cache } from 'react'
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import bcrypt from 'bcryptjs'
import { rateLimit, clientIp } from './rateLimit'
import { LIMITS, limitKey } from './rateLimitPolicy'

/**
 * Compared against when no account matched, so that both answers cost the same.
 *
 * Returning early on a missing account answered in about a millisecond, while a
 * wrong password spent the ~400ms bcrypt costs at this work factor. The gap is
 * far wider than network jitter, so timing the sign-in form told an attacker
 * which addresses are registered, one request at a time and without tripping
 * anything: a failed sign-in is a perfectly ordinary event.
 *
 * A literal rather than a hash computed at import, which would spend that same
 * 400ms blocking the first request to reach the process. It hashes a string no
 * password can be, and the result is discarded either way.
 */
const ABSENT_ACCOUNT_HASH = '$2b$12$u3AKW.Yrh0G0c1bwQHgKgu4pzAj1nf86gznygNveAQAPMXOjuQoJe'

/**
 * Thrown from the jwt callback for a session issued before the account's last
 * password change, or for an account that no longer exists. next-auth answers
 * it with no session and clears the cookie where it can.
 */
const SESSION_REVOKED = 'SESSION_REVOKED'

/**
 * The account's current session version, read once per request.
 *
 * A signed-in page reads the session from its metadata, its body and its
 * header, and each read runs the jwt callback. React's cache dedupes those
 * within one server render; outside a render it is an ordinary call.
 */
const sessionVersionOf = cache((id: string) =>
  prisma.user.findUnique({ where: { id }, select: { sessionVersion: true } })
)

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

        // Password guessing is limited by source and by account from that
        // source. See LIMITS.login for why the account count is not global.
        //
        // next-auth hands `authorize` a plain header record rather than a
        // Headers instance, so it is adapted before reading the client address.
        const ip = clientIp(new Headers((req?.headers ?? {}) as Record<string, string>))
        const byIp = rateLimit(limitKey('login-ip', ip), LIMITS.login.perIp.limit, LIMITS.login.perIp.windowMs)
        const byIdentifier = rateLimit(limitKey('login-id', `${identifier}|${ip}`), LIMITS.login.perAccountPerIp.limit, LIMITS.login.perAccountPerIp.windowMs)

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

        // The comparison runs either way, so a missing account and a wrong
        // password take the same time to refuse.
        const valid = await bcrypt.compare(
          credentials.password,
          user?.passwordHash ?? ABSENT_ACCOUNT_HASH
        )
        if (!user || !valid) return null

        if (!user.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        return {
          id: user.id, email: user.email, name: user.name, username: user.username, avatar: user.avatar,
          sessionVersion: user.sessionVersion,
        }
      }
    })
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  logger: {
    // A revoked session is expected, and it is read on every request until the
    // browser drops the cookie. Everything else is reported as before.
    error(code, metadata) {
      if ((metadata as { message?: unknown } | undefined)?.message === SESSION_REVOKED) return
      console.error(`[next-auth][error][${code}]`, metadata)
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.username = (user as { username?: string }).username
        token.name = user.name
        token.avatar = (user as { avatar?: string }).avatar
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0
      } else if (token.id) {
        // Every read, not only sign-in: this is what makes a password change
        // sign out a session somebody else is holding. Tokens issued before
        // versions existed carry none, which is version 0.
        const account = await sessionVersionOf(token.id as string)
        if (!account || account.sessionVersion !== ((token.sessionVersion as number | undefined) ?? 0)) {
          throw new Error(SESSION_REVOKED)
        }
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
