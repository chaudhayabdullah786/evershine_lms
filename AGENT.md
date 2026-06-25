# AGENT.md — Evershine Academy LMS: Agent Context File
# ======================================================
# PURPOSE: Read this file at the START of every chat session before making
#          any code changes. It contains the current state of the system,
#          all architectural decisions, known issues, and what has been fixed.
#          Keep this file updated after every session that modifies the codebase.
#
# Last updated: 2026-06-25
# Updated by:   Antigravity AI (Gemini/Claude assisted session)
# Repo:         https://github.com/chaudhayabdullah786/evershine_lms
# Live site:    https://evershineacadmey.com
# Hostinger:    hPanel → Node.js Web App (auto-deploys on push to main)

---

## 1. PROJECT OVERVIEW

**Evershine Academy LMS** — Enterprise-grade school management system for
Evershaheen Academy, Gujranwala, Pakistan. Multi-campus (Boys + Girls),
multi-shift (Morning/Evening/Night), multi-role (SUPER_ADMIN → GUARDIAN).

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 16 (App Router, standalone) |
| Auth        | NextAuth.js v5 (JWT, Credentials)   |
| Database    | MySQL (Hostinger) via Prisma v5     |
| ORM         | Prisma Client (lazy proxy pattern)  |
| Passwords   | Argon2id via @node-rs/argon2        |
| Styling     | Tailwind CSS v4                     |
| UI          | shadcn/ui + Radix UI + Framer Motion|
| State       | Zustand + TanStack React Query      |
| Hosting     | Hostinger Node.js Web App           |
| CI/CD       | GitHub Actions → auto-deploy on push|
| Schema type | MySQL (NOT PostgreSQL)              |

---

## 2. ROLE SYSTEM (RBAC)

```
SUPER_ADMIN > ADMIN > ACCOUNTANT > TEACHER > STUDENT > PARENT > GUARDIAN
```

- All roles are defined in `prisma/schema.prisma` under `enum Role`
- Nav items in `app/dashboard/layout.tsx` use an allowlist `roles[]` array
- Session carries `role` via JWT claim set in `lib/auth.config.ts` `jwt()` callback
- If `session.user.role` is empty → all role-gated nav items are hidden → looks broken
- Root cause of empty role: missing `NEXTAUTH_SECRET` or `NEXTAUTH_URL` in hPanel env vars

---

## 3. ARCHITECTURE — CRITICAL PATTERNS

### 3.1 Prisma Lazy Proxy (lib/prisma.ts)
```
`next build` imports every server module to collect metadata.
Without the lazy proxy, PrismaClient constructor validates DATABASE_URL
at import time → build fails when DATABASE_URL is absent (CI/build env).
The Proxy defers construction to the first actual DB call at runtime.
```
- `DATABASE_URL` is validated at **runtime**, not build time
- Singleton is now stored in `globalForPrisma.prisma` **unconditionally** (was dev-only — fixed 2026-06-25)
- Format must be `mysql://user:password@host:3306/database`

### 3.2 Auth Split (Edge vs Node)
```
lib/auth.config.ts  → Edge-compatible (JWT callbacks, no Prisma/Argon2)
lib/auth.ts         → Node-only (Credentials provider, Prisma, Argon2)
middleware.ts       → imports ONLY auth.config.ts (never auth.ts)
```
**DO NOT** import from `lib/auth.ts` in middleware — it will crash the Edge runtime.

### 3.3 NextAuth Configuration
- Strategy: `jwt` (cookie-based, no database sessions)
- `trustHost: true` — required for Hostinger reverse proxy
- **No PrismaAdapter** — removed 2026-06-25 (schema has no Account/VerificationToken models)
- Session maxAge: 8 hours
- Login page: `/login`, error page: `/login`
- JWT custom claims: `id`, `role`, `campusId` (typed via `declare module 'next-auth/jwt'`)

### 3.4 Standalone Output (Hostinger ChunkLoadError Fix)
```
next build with output:"standalone" creates .next/standalone/server.js
but DOES NOT copy .next/static/ or public/ into standalone.
Server serves static files from .next/standalone/.next/static/ only.
Missing → every /_next/static/chunks/*.js → 404 → ChunkLoadError.
```
**Three-layer fix (all must be present):**

| Layer | File | When it runs |
|-------|------|-------------|
| 1 | `scripts/postbuild-sync.js` | After every `npm run build` (postbuild hook) |
| 2 | `server.js` (project root) | At Hostinger startup (Startup file field) |
| 3 | `scripts/prod-start.sh` | When `npm start` is called (fallback) |

---

## 4. FILE CHANGE HISTORY

### 2026-06-25 (Session: Production Hardening + ChunkLoadError Fix)

| File | Change Type | Summary |
|------|-------------|---------|
| `middleware.ts` | **NEW** | Edge auth guard for `/dashboard/*`. Was missing — only client-side redirects existed |
| `server.js` | **NEW** | Hostinger native startup entry point. Syncs static assets + starts standalone server |
| `scripts/postbuild-sync.js` | **NEW** | Copies `.next/static` + `public/` into standalone after every build |
| `app/error.tsx` | **FIXED** | Was exposing raw `error.message` (stack traces) to browser. Now sanitised + auto-reload for ChunkErrors |
| `app/global-error.tsx` | **FIXED** | Added ChunkLoadError detection + 3s auto-reload countdown |
| `lib/auth.ts` | **FIXED** | Removed `PrismaAdapter` — schema has no `Account`/`VerificationToken` models |
| `lib/auth.config.ts` | **FIXED** | Added `declare module 'next-auth/jwt'` JWT interface augmentation. Removed implicit `any` casts |
| `lib/prisma.ts` | **FIXED** | Singleton written unconditionally (was dev-only). Fixed production connection pool leak |
| `scripts/prod-start.sh` | **FIXED** | Line 64: `grep -qv` → `if ! grep -q`. Was exiting on VALID DATABASE_URL (inverted logic) |
| `package.json` | **UPDATED** | Added `postbuild: node scripts/postbuild-sync.js`. Changed `start` to `node server.js` |
| `.github/workflows/academic-ci.yml` | **UPDATED** | CI now uses `node server.js` for smoke test startup |

### 2026-06-24 (Session: Prisma Lazy Init + Build Fix)

| File | Change Type | Summary |
|------|-------------|---------|
| `lib/prisma.ts` | **NEW** | Lazy Proxy pattern to defer DATABASE_URL validation to runtime |
| `next.config.ts` | **UPDATED** | `output: "standalone"`, `serverExternalPackages: ["@node-rs/argon2", "@prisma/client"]` |
| `.env.example` | **UPDATED** | Fixed stale `postgresql://` URL to `mysql://` |
| `.github/workflows/academic-ci.yml` | **UPDATED** | Added stub DATABASE_URL + NEXTAUTH_SECRET for build job |

---

## 5. ENVIRONMENT VARIABLES (HOSTINGER hPANEL)

Set these in: **hPanel → Websites → Manage → Node.js → Environment Variables**

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | ✅ CRITICAL | `mysql://user:pass@localhost:3306/dbname` | Must start with `mysql://` |
| `NEXTAUTH_SECRET` | ✅ CRITICAL | `openssl rand -hex 32` | Min 32 chars. Missing = role stripped from JWT |
| `NEXTAUTH_URL` | ✅ CRITICAL | `https://evershineacadmey.com` | Must match actual domain exactly |
| `NODE_ENV` | ✅ | `production` | Without this Next.js runs in dev mode |
| `NEXT_PUBLIC_APP_URL` | ⚠️ Recommended | `https://evershineacadmey.com` | Used by client components |
| `NEXT_PUBLIC_APP_NAME` | ⚠️ Recommended | `Evershaheen Academy LMS` | Branding |
| `NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY` | ⚠️ Recommended | `true` | Hides legacy nav items |
| `CRON_SECRET` | ⚠️ Recommended | `openssl rand -hex 20` | Required for automated maintenance |
| `SMTP_HOST` | Optional | `smtp.hostinger.com` | Email features |
| `SMTP_PORT` | Optional | `465` | |
| `SMTP_USER` | Optional | `noreply@evershineacadmey.com` | |
| `SMTP_PASS` | Optional | `your-smtp-password` | |

---

## 6. HOSTINGER DEPLOYMENT SETTINGS

```
Application root:    /home/user/htdocs/evershineacadmey.com
Startup file:        server.js          ← CRITICAL: must be server.js not app.js
Node.js version:     20.x
Auto-deploy:         GitHub → main branch push triggers rebuild + restart
Build command:       npm install && npm run build
Start command:       node server.js  (or via npm start → same thing)
```

**Deployment flow on git push to main:**
```
git push → GitHub Actions CI → (unit tests → build → smoke tests) → Hostinger pulls → 
npm install → npm run build → [postbuild-sync.js runs] → node server.js → 
[server.js syncs assets again] → require(.next/standalone/server.js) → LIVE
```

---

## 7. KNOWN ISSUES & GOTCHAS

### 7.1 Branding Inconsistency
- Code/DB uses `"Evershaheen Academy"` in some places
- Landing page config uses `"Evershine Academy"`
- Schema header comment says `"Evershaheen Academy"`
- Domain is `evershineacadmey.com` (also has a typo — missing 'y' in academy)
- **Do not rename without a full global search-replace audit**

### 7.2 Session Role Empty = All Nav Hidden
If a user logs in but sees an empty sidebar:
1. Check `NEXTAUTH_URL` matches the actual request URL exactly
2. Check `NEXTAUTH_SECRET` is set and is 32+ chars
3. Check browser console for `[DASHBOARD] Role is empty in session`
4. Check Node.js logs for `[AUTH] Role missing from JWT token`

### 7.3 @node-rs/argon2 is a Native Binary
- Must be in `serverExternalPackages` in `next.config.ts` ✅ (already set)
- Cannot be imported in Edge runtime (middleware, edge API routes)
- If Hostinger changes Node.js version, re-run `npm install` to get correct binary

### 7.4 PrismaAdapter Was Removed
- `@auth/prisma-adapter` remains in `package.json` dependencies but is NOT used
- Safe to either remove the package or leave it (it's not imported anywhere)
- `Account` and `VerificationToken` models do NOT exist in the schema
- Do NOT add PrismaAdapter back without first adding those models

### 7.5 Guardian/Parent Profile Name Resolution
- `lib/auth.ts` `authorize()` resolves name from admin/teacher/student/accountant
- `parent` and `guardian` profiles have no name in that query
- Logged-in parents will show email prefix as name (acceptable, not a bug)

### 7.6 Static Asset Sync on Redeployment
- Hostinger redeployments preserve old `.next/standalone/` directory
- Old chunk hashes persist alongside new ones causing stale-chunk 404s
- `server.js` and `postbuild-sync.js` both do unconditional `cp -r` to override

---

## 8. KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `middleware.ts` | Edge auth guard (MUST stay edge-compatible — no Prisma/Argon2 imports) |
| `server.js` | Hostinger startup file (validates env, syncs assets, starts Next.js) |
| `lib/auth.ts` | Full NextAuth config (Node.js only — Credentials provider + Argon2) |
| `lib/auth.config.ts` | Edge-safe auth config (JWT callbacks, no DB access) |
| `lib/prisma.ts` | Lazy Prisma singleton (defers DB connection to runtime) |
| `prisma/schema.prisma` | MySQL schema (2458 lines, all models) |
| `app/dashboard/layout.tsx` | Sidebar nav with RBAC filtering (NAV_ITEMS allowlist) |
| `app/dashboard/page.tsx` | Dashboard home (role-specific content rendering) |
| `app/layout.tsx` | Root layout (SessionProvider, metadata, favicon) |
| `app/page.tsx` | Public landing page (static content only, no DB calls) |
| `app/error.tsx` | Route-level error boundary (sanitised messages, chunk auto-reload) |
| `app/global-error.tsx` | Root HTML-level error boundary (same pattern as error.tsx) |
| `content/site-config.ts` | All landing page content (text, images, stats) — edit here not in components |
| `scripts/prod-start.sh` | Shell startup script (env validation + asset sync fallback) |
| `scripts/postbuild-sync.js` | Post-build asset sync (runs automatically via npm postbuild hook) |
| `.github/workflows/academic-ci.yml` | CI: unit tests → build → smoke tests (MySQL 8.0 service) |
| `next.config.ts` | Next.js config (standalone output, serverExternalPackages) |
| `package.json` | start: node server.js, postbuild: node scripts/postbuild-sync.js |

---

## 9. WHAT TO CHECK BEFORE MAKING ANY CHANGE

1. **Is it a server component, client component, or Edge function?**
   - Edge (middleware): no Prisma, no Argon2, no Node.js-only modules
   - Server component/API route: can use Prisma and Argon2 freely
   - Client component: no server imports, use fetch/useQuery for data

2. **Does it touch auth?** → Read `lib/auth.config.ts` and `lib/auth.ts` first

3. **Does it touch the sidebar?** → Read `app/dashboard/layout.tsx` NAV_ITEMS array

4. **Does it need a DB query?** → Check if the table exists in `prisma/schema.prisma` first

5. **Is it a new API route?** → Follow the pattern in `app/api/dashboard/route.ts`:
   - Call `auth()` from `@/lib/auth` (not auth.config)
   - Return `errors.unauthorized()` if no session
   - Check `user.isActive` from DB before processing

6. **Does it modify the Prisma schema?** → Run `npx prisma migrate dev` locally, then `npx prisma migrate deploy` on Hostinger via the Node.js console

---

## 10. AGENT INSTRUCTIONS (FOR AI SESSIONS)

When starting a new session:
1. Read sections 3, 5, 6, and 7 of this file before writing any code
2. Never import `lib/auth.ts` in `middleware.ts` or any edge-compatible file
3. Never add PrismaAdapter without first verifying Account/VerificationToken models exist
4. DATABASE_URL format is always `mysql://` — never `postgresql://`
5. All API routes must call `auth()` and check `session.user.isActive` against DB
6. Error messages shown to users must NEVER contain `error.message`, stack traces, or module paths
7. After making changes, update section 4 (File Change History) in this file

**When the user reports "Something went wrong" on the live site:**
→ Most likely cause: ChunkLoadError from missing static assets in standalone
→ Fix: Ensure `server.js` is the Hostinger Startup file AND postbuild-sync.js ran during build

**When the user reports "Auth not working" or "Login fails":**
→ Check: NEXTAUTH_SECRET and NEXTAUTH_URL set in hPanel
→ Check: DATABASE_URL starts with mysql:// and DB is accessible
→ Check: User exists in DB with isActive=true and Argon2id passwordHash

**When the user reports "Sidebar empty" or "Features not visible after login":**
→ Check: session.user.role is populated (check browser DevTools → Application → Cookies)
→ Check: NEXTAUTH_URL matches actual request origin exactly (including https://)
→ Check: trustHost: true is set in lib/auth.config.ts (it is ✅)
