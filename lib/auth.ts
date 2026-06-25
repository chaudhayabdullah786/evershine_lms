import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { verify } from '@node-rs/argon2'
import { loginSchema } from '@/lib/validation/user'
import { authConfig } from '@/lib/auth.config'

function isPrismaConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('DATABASE_URL') ||
      err.message.includes('database') ||
      err.message.includes('connect') ||
      err.message.includes('validate datasource')
    )
  }
  return false
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials)
          if (!parsed.success) return null

          const { email, password } = parsed.data

          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              admin: { select: { campusId: true, firstName: true, lastName: true } },
              teacher: { select: { campusId: true, firstName: true, lastName: true } },
              student: { select: { firstName: true, lastName: true } },
              accountant: { select: { campusId: true, firstName: true, lastName: true } },
            },
          })

          if (!user || !user.isActive) return null

          const passwordValid = await verify(user.passwordHash, password)
          if (!passwordValid) return null

          prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
          }).catch(() => {})

          const profile = user.admin ?? user.teacher ?? user.student ?? user.accountant
          const name = profile
            ? `${(profile as { firstName: string }).firstName} ${(profile as { lastName: string }).lastName}`
            : email.split('@')[0]

          const campusId = user.admin?.campusId ?? user.teacher?.campusId ?? user.accountant?.campusId ?? null

          return {
            id: user.id,
            email: user.email,
            name,
            role: user.role,
            campusId,
          }
        } catch (err) {
          if (isPrismaConnectionError(err)) {
            console.error('[auth] Database connection failed — DATABASE_URL may be missing or invalid on the server.')
            console.error('[auth] Go to your Hostinger hosting panel → Environment Variables → set DATABASE_URL')
            return null
          }
          console.error('[auth] authorize error:', err)
          return null
        }
      },
    }),
  ],
})
