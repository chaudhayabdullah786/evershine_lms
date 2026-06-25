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

        // Lightweight auth query: only the columns needed to verify identity.
        // Avoids 4 LEFT JOINs on every login attempt.
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            role: true,
            isActive: true,
          },
        })

        if (!user || !user.isActive) return null

        let passwordValid = false
        try {
          passwordValid = await verify(user.passwordHash, password)
        } catch (err) {
          console.error(
            '[AUTH] Password verification threw — likely a non-Argon2 hash in DB.',
            'Email:', user.email,
            'Hash prefix:', user.passwordHash.substring(0, 24),
            'Error:', err instanceof Error ? err.message : err,
          )
        }
        if (!passwordValid) return null

        // Update lastLogin (fire and forget)
        prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        }).catch(() => {})

        // Fetch profile name and campusId after successful password verification
        // so the expensive join is only paid for valid logins, not every attempt.
        const profile = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            admin:   { select: { firstName: true, lastName: true, campusId: true } },
            teacher: { select: { firstName: true, lastName: true, campusId: true } },
            student: { select: { firstName: true, lastName: true } },
            accountant: { select: { firstName: true, lastName: true, campusId: true } },
          },
        })

        const p = profile?.admin ?? profile?.teacher ?? profile?.student ?? profile?.accountant
        const name = p
          ? `${p.firstName} ${p.lastName}`
          : email.split('@')[0]

        const campusId =
          profile?.admin?.campusId ??
          profile?.teacher?.campusId ??
          profile?.accountant?.campusId ??
          null

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
