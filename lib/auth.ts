/**
 * lib/auth.ts — Full NextAuth.js v5 (Node.js runtime) instantiation
 *
 * WHY NOT edge-compatible: This file imports @node-rs/argon2 (native binary)
 * and @prisma/client (Node.js-only). It must ONLY be imported from:
 *  - API route handlers (app/api/**)
 *  - Server Components (async components with no 'use client')
 *  - Server Actions
 *
 * WHY NO PrismaAdapter:
 *  This system uses Credentials provider + JWT session strategy exclusively.
 *  PrismaAdapter is designed for OAuth providers and database session storage.
 *  It expects prisma.account and prisma.verificationToken models which do not
 *  exist in this schema (Credentials users are managed directly via prisma.user).
 *  Including the adapter with missing schema models causes runtime errors
 *  when NextAuth internally calls adapter methods (getUserByAccount, etc.)
 *  on certain request paths in production. Removing it is both safe and correct
 *  for a Credentials + JWT architecture.
 *
 * Auth flow summary:
 *  1. POST /api/auth/callback/credentials → authorize() → validates email +
 *     Argon2id hash against MySQL via prisma.user.findUnique
 *  2. jwt() callback → embeds id, role, campusId into signed JWT (NEXTAUTH_SECRET)
 *  3. Cookie set: next-auth.session-token (httpOnly, SameSite=lax)
 *  4. Every subsequent request → middleware decodes JWT via authConfig (Edge)
 *  5. session() callback → maps JWT claims to session.user for client components
 */

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { verify } from '@node-rs/argon2'
import { loginSchema } from '@/lib/validation/user'
import { authConfig } from '@/lib/auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  // WHY no adapter: See module-level comment. Credentials + JWT requires no
  // database adapter. Session data lives entirely in the signed JWT cookie.

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        // ── Input validation ──────────────────────────────────────────────
        // loginSchema: email (valid + lowercase + trim), password (min 6)
        // Rejecting at this layer before any DB touch prevents enumeration
        // attacks via timing differences.
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // ── Identity lookup ───────────────────────────────────────────────
        // WHY select only needed columns: avoids LEFT JOINs on 6 profile
        // tables for every login attempt. isActive is checked first to
        // short-circuit suspended accounts without doing bcrypt/argon work.
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id:           true,
            email:        true,
            passwordHash: true,
            role:         true,
            isActive:     true,
          },
        })

        // Return null (not throw) to signal "invalid credentials" to NextAuth.
        // Throwing would trigger a 500; returning null triggers a 401.
        if (!user || !user.isActive) return null

        // ── Password verification ─────────────────────────────────────────
        // @node-rs/argon2 verifies Argon2id hashes (preferred) and Argon2i/d.
        // If the hash in the DB was created with bcrypt or plain SHA-256,
        // verify() will throw — we catch and log, then reject the login.
        // The operator must re-hash the password with Argon2id via the
        // admin credential management panel.
        let passwordValid = false
        try {
          passwordValid = await verify(user.passwordHash, password)
        } catch (err) {
          console.error(
            '[AUTH] Password verification failed — hash algorithm mismatch.',
            'Expected Argon2id. Check DB hash for user:', user.email,
            'Hash prefix:', user.passwordHash.substring(0, 24),
            'Error:', err instanceof Error ? err.message : String(err),
          )
        }
        if (!passwordValid) return null

        // ── Last-login update (fire-and-forget) ───────────────────────────
        // WHY fire-and-forget: we do not want a lastLogin update failure to
        // block the login response. Catch prevents unhandled rejection.
        prisma.user.update({
          where: { id: user.id },
          data:  { lastLogin: new Date() },
        }).catch(() => {})

        // ── Profile resolution ────────────────────────────────────────────
        // WHY after password verify: the expensive profile JOIN is only paid
        // for valid logins, not for every failed attempt (which would be the
        // common case under a credential-stuffing attack).
        const profile = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            admin:      { select: { firstName: true, lastName: true, campusId: true } },
            teacher:    { select: { firstName: true, lastName: true, campusId: true } },
            student:    { select: { firstName: true, lastName: true } },
            accountant: { select: { firstName: true, lastName: true, campusId: true } },
          },
        })

        const p = profile?.admin ?? profile?.teacher ?? profile?.student ?? profile?.accountant
        const name = p
          ? `${p.firstName} ${p.lastName}`
          : email.split('@')[0]

        const campusId =
          profile?.admin?.campusId     ??
          profile?.teacher?.campusId   ??
          profile?.accountant?.campusId ??
          null

        // This object is passed to the jwt() callback as `user`.
        // All fields must be JSON-serialisable (no undefined, no circular refs).
        return {
          id:       user.id,
          email:    user.email,
          name,
          role:     user.role,
          campusId: campusId ?? null,
        }
      },
    }),
  ],
})
