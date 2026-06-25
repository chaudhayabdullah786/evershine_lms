/**
 * middleware.ts — NextAuth.js v5 Edge Auth Guard
 *
 * Runs at the Edge (before any page or API route handler).
 * Responsibilities:
 *  1. Protect /dashboard/* — redirect unauthenticated requests to /login?callbackUrl=…
 *  2. Redirect authenticated users away from /login (avoids double-session confusion)
 *  3. Pass through all public routes, API routes, and static assets without overhead
 *
 * WHY Edge runtime (not Node): Next.js middleware runs in the V8 isolate before the
 * server bundle is loaded. Only edge-compatible code is allowed here — no Prisma,
 * no Argon2. We use authConfig (which contains only the JWT strategy + callbacks)
 * imported from lib/auth.config.ts.
 *
 * WHY NOT import from lib/auth.ts: auth.ts imports @node-rs/argon2 and @prisma/client,
 * both of which are native Node.js modules and will crash the Edge runtime.
 */

import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

// Instantiate a minimal Edge-compatible NextAuth instance using only authConfig.
// providers: [] in authConfig means no provider is registered here — this instance
// is used exclusively for session decoding, not for actual login flows.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isAuthenticated = !!session

  const isProtectedRoute = nextUrl.pathname.startsWith('/dashboard')
  const isAuthRoute      = nextUrl.pathname === '/login'
  const isApiRoute       = nextUrl.pathname.startsWith('/api')

  // ── Guard: unauthenticated user hitting a protected route ──────────────────
  if (isProtectedRoute && !isAuthenticated) {
    // Encode the original destination so /login can redirect back after auth.
    const callbackUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search)
    const loginUrl    = new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl.origin)
    return Response.redirect(loginUrl)
  }

  // ── Convenience: authenticated user visiting /login ─────────────────────
  // If they already have a valid session, send them to the dashboard.
  // This prevents a confusing blank login form for logged-in users.
  if (isAuthRoute && isAuthenticated) {
    return Response.redirect(new URL('/dashboard', nextUrl.origin))
  }

  // All other routes (public landing, API, static): pass through unchanged.
  // return undefined (implicit) means "continue to the handler".
})

// ── Matcher: limit middleware execution to routes that need it ─────────────
// Static files (/_next/static, /favicon, /public/**) are excluded by default.
// We also skip /api/auth/** which is NextAuth's own internal handler — it must
// never be auth-gated by us or it will infinitely redirect on login attempts.
export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static  (JS/CSS chunks — must be public)
     *  - _next/image   (Next.js image optimiser proxy)
     *  - /api/auth/**  (NextAuth's own route — must not be protected)
     *  - Files with extensions (favicons, fonts, images, manifests)
     */
    '/((?!_next/static|_next/image|api/auth|.*\\..*).*)',
  ],
}
