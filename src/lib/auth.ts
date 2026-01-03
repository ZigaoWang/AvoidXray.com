import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const identifier = credentials.email.toLowerCase()

        // Try to find by email or username (case-insensitive)
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { username: identifier }
            ]
          }
        })

        if (!user) return null
        if (!user.emailVerified) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

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
