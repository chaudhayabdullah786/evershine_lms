/**
 * NextAuth.js v5 (Auth.js) Edge-Compatible Configuration
 * 
 * This file contains ONLY edge-compatible code (no Prisma, no bcrypt/argon2).
 * It is used by `middleware.ts` to decode JWTs at the edge.
 */

import type { NextAuthConfig } from 'next-auth'
import type { Role } from '@prisma/client'

// ── NextAuth Session type extensions ────────────────────────────────────────
// WHY: NextAuth's built-in Session/User types do not include role or campusId.
// Without this augmentation, session.user.role is typed as 'any' which
// bypasses TypeScript's RBAC enforcement at the call site.
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

// ── NextAuth JWT type extension ──────────────────────────────────────────────
// WHY: The default JWT type from 'next-auth/jwt' only includes standard IANA
// claims (sub, iat, exp, jti, etc.). Our custom jwt() callback writes 'id',
// 'role', and 'campusId' into the token. Without declaring them here,
// TypeScript infers all token.* custom fields as implicit 'any', silently
// swallowing type errors in the session callback.
declare module 'next-auth/jwt' {
  interface JWT {
    /** User DB id — mirrors User.id (cuid). Prefer over sub for DB lookups. */
    id?: string
    /** RBAC role — sourced from User.role at login time. */
    role?: Role
    /** Campus scope — null for SUPER_ADMIN / STUDENT / PARENT / GUARDIAN. */
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

  // trustHost is REQUIRED in production when running behind a reverse proxy
  // (Hostinger, nginx, Cloudflare, etc.). Without it, NextAuth v5 rejects
  // CSRF validation and may drop custom JWT claims from the session.
  trustHost: true,

  providers: [], // Injected in lib/auth.ts for Node environments

  callbacks: {
    // JWT callback is executed on login, and on every request.
    // We ALWAYS set custom fields — not just on initial login — to handle
    // token refresh, secret rotation, and edge-case deserialization issues.
    async jwt({ token, user, account }) {
      // If user object is present, this is the initial login or account link
      if (user) {
        token.id = user.id
        token.role = user.role
        token.campusId = user.campusId
      }

      // Defensive: if token.role is somehow missing but we have a userId,
      // this indicates a token deserialization issue in production.
      // The role will be missing from the session until next login.
      // We log a warning so operators can detect this in production logs.
      if (!token.role && token.sub) {
        console.warn(
          '[AUTH] Role missing from JWT token — user may need to re-login. ' +
          'Check NEXTAUTH_URL and trustHost config. ' +
          'Token sub:', token.sub,
        )
      }

      return token
    },

    // Session callback exposes the token data to the client.
    // IMPORTANT: In NextAuth v5 production, session.user may be immutable.
    // We construct a NEW user object instead of mutating in place.
    //
    // WHY prefer token.id over token.sub:
    // token.sub is set by NextAuth to the user id for most providers, but for
    // Credentials it may be undefined until explicitly set in the jwt() callback.
    // We set token.id explicitly on login — prefer it; fall back to token.sub.
    async session({ session, token }) {
      if (!token) return session

      return {
        ...session,
        user: {
          id:       token.id ?? token.sub ?? '',
          email:    token.email ?? session.user?.email ?? '',
          name:     token.name ?? session.user?.name ?? '',
          role:     token.role ?? session.user?.role,
          campusId: token.campusId ?? null,
        },
      }
    },
  },
} satisfies NextAuthConfig
