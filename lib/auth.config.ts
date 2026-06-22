/**
 * NextAuth.js v5 (Auth.js) Edge-Compatible Configuration
 * 
 * This file contains ONLY edge-compatible code (no Prisma, no bcrypt/argon2).
 * It is used by `middleware.ts` to decode JWTs at the edge.
 */

import type { NextAuthConfig } from 'next-auth'
import type { Role } from '@prisma/client'

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: Role
      campusId?: string | null
    }
  }
  interface User {
    role: Role
    campusId?: string | null
  }
}

export const authConfig = {
  // Use JWT strategy so Edge middleware can decode it without hitting the DB
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [], // Injected in lib/auth.ts for Node environments

  callbacks: {
    // JWT callback is executed on login, and on every request in middleware
    async jwt({ token, user }) {
      // If user object is present, it means this is the initial login
      if (user) {
        token.id = user.id
        token.role = user.role
        token.campusId = user.campusId
        // name and email are automatically handled by NextAuth
      }
      return token
    },

    // Session callback exposes the token data to the client
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.campusId = token.campusId as string | null
      }
      return session
    },
  },
} satisfies NextAuthConfig
