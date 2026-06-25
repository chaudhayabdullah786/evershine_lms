/**
 * Full NextAuth.js (Node.js runtime) instantiation
 * 
 * This file contains Prisma and Argon2, which are NOT edge-compatible.
 * It is used by API routes and server components.
 */

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { verify } from '@node-rs/argon2'
import { loginSchema } from '@/lib/validation/user'
import { authConfig } from '@/lib/auth.config'

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

        // Update lastLogin (fire and forget)
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
      },
    }),
  ],
})
