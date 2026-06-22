# Evershaheen Academy LMS — Production Optimization & Security Report

**Document ID:** `PROD_OPTIMIZATION_REPORT_v1`
**Project:** Evershaheen Academy Management System (LMS)
**Version:** 1.0
**Last Updated:** 2026-06-20
**Target Deployment:** Hostinger Business (Node.js Web App)
**Audience:** AI Coding Agents (Claude Code, Cursor, Windsurf, Aider, Cline)
**Status:** ⚡ READY FOR AGENT EXECUTION

---

## ⚠️ Agent Execution Contract — Read Before Anything

> You are an AI agent assigned to optimize this system for production deployment on Hostinger. This document is your **sole source of truth**. Before writing a single line of code, read this document in full.

| Non-Negotiable Rule | Detail |
|---|---|
| **Read first, code second** | Complete this document before touching any file |
| **Phase order is mandatory** | Execute phases in the exact sequence listed in §8 |
| **No secrets in Git** | Never commit `.env`, SMTP passwords, `NEXTAUTH_SECRET`, or `CRON_SECRET` |
| **No skipping verification** | Each phase has a `✅ Done When:` checklist — satisfy all items before advancing |
| **Correction before assumption** | If you encounter a false assumption in a task description, correct it and document it in `docs/.CHAT_MEMORY.md` before proceeding |
| **Update chat memory** | After every task, update `docs/.CHAT_MEMORY.md` with completed items and current state |

**Agent Quick-Start Index**

| Priority | Section | Task Summary |
|---|---|---|
| 🔴 P0 | §3 | Security hardening (CSP, rate limiting, session rotation) |
| 🔴 P0 | §4 | Session management implementation |
| 🟠 P1 | §5 | Performance optimization (N+1 queries, bundle, caching) |
| 🟠 P1 | §6 | UI/UX loader and skeleton screen implementation |
| 🟡 P2 | §7 | Hostinger deployment configuration |
| 🟡 P2 | §9 | Security test scenarios execution |
| 🟢 P3 | §10 | Monitoring and observability setup |

---

## 1. Executive Summary

### System Overview

Evershaheen Academy LMS is an enterprise-grade multi-campus management system built on Next.js 16, React 19, TypeScript 5, Prisma 5, and PostgreSQL. It serves 7 user roles across two campuses (Boys/Girls) and covers academic management, institutional finance, recruitment pipelines, attendance, and document generation.

### Assessment Verdict

The system has a **strong security and data model foundation** but carries **critical gaps** in four areas that block production readiness:

| Area | Current State | Risk Level |
|---|---|---|
| **CSP / Security Headers** | None configured | 🔴 Critical |
| **Rate Limiter Wiring** | Module exists, zero routes import it | 🔴 Critical |
| **Session Token Rotation** | Not enabled in NextAuth config | 🔴 Critical |
| **N+1 Query Patterns** | Confirmed in multiple API routes | 🟠 High |
| **Client-Side Rendering** | All dashboards use `useEffect` + `fetch` | 🟠 High |
| **Bundle Size** | ~800KB+ initial JS payload | 🟠 High |
| **Loader/Skeleton UX** | Basic spinners only | 🟡 Medium |
| **Monitoring / Observability** | stdout logs only | 🟡 Medium |
| **Backup Automation** | No documented backup schedule | 🟡 Medium |

### What Is Already Production-Grade (Do Not Regress)

- ✅ Argon2id password hashing (`memoryCost: 65536, timeCost: 3`)
- ✅ NextAuth.js v5 with CSRF protection
- ✅ Zod validation on all 70+ API routes
- ✅ RBAC at route + data layer with campus-scoped isolation
- ✅ Prisma ORM eliminating raw SQL injection surface
- ✅ Immutable `AuditLog` table on all mutations
- ✅ ACID transactions for financial and payroll operations
- ✅ CNIC masking in list views

---

## 2. Current Architecture Map

```
Users (Browser)
    ↓ HTTPS (→ Cloudflare proxy recommended)
Next.js 16 App Router (React 19, TypeScript 5)
    ├── Landing Page (Framer Motion, ShadCN, 20+ sections)
    ├── Dashboard Pages (ALL client-rendered — optimization target)
    └── 70+ API Routes (Zod validated, RBAC middleware)
         ↓
Service Layer (Prisma $transaction, business logic)
         ↓
PostgreSQL 16+ via Neon (→ MySQL on Hostinger — see §7)
         ↓
External Services:
    ├── Resend (email → replaced by Hostinger SMTP)
    ├── Cloudinary (uploads → replaced by disk storage)
    └── Upstash Redis (rate limiting — not wired; see §3.2)
```

### Post-Migration Architecture (Hostinger)

```
Users (Browser)
    ↓ HTTPS + Cloudflare Free
Hostinger Node.js 20.x (Next.js SSR + API Routes)
    ├── Dashboard Pages (→ RSC migration in §5.3)
    └── 70+ API Routes (→ rate-limited in §3.2)
         ↓
MySQL/MariaDB (Hostinger — included in plan)
         ↓
Local Services:
    ├── SMTP (Hostinger email — nodemailer)
    └── Disk (public/uploads/ — persistent)
```

---

## 3. Security Hardening Plan

**Confidence Level: CONFIRMED** — All recommendations align with OWASP Top 10 (2021) and NextAuth.js v5 official documentation.

### 3.1 Content Security Policy (CSP) Headers

**File:** `next.config.ts`

**Risk:** Without CSP, any injected script can exfiltrate session tokens or data — a critical XSS amplification vector.

**Implementation:**

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // tighten after audit
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "font-src 'self'",
      "connect-src 'self' https://api.resend.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  // ... rest of your config
};

export default nextConfig;
```

**✅ Done When:**
- [ ] `curl -I https://yourdomain.com` response includes `Content-Security-Policy` header
- [ ] Browser DevTools → Network → response headers confirm all 6 security headers present
- [ ] No CSP violations in browser console for login + dashboard flows

---

### 3.2 Rate Limiter Wiring

**Files:** `lib/rate-limit.ts` (exists), `app/api/auth/[...nextauth]/route.ts`, all public POST routes

**Risk:** Without rate limiting, login endpoint is vulnerable to brute-force attacks. Current module exists but is imported by zero routes.

**Step 1 — Choose rate limiter for Hostinger (no Upstash):**

```typescript
// lib/rate-limit.ts — REPLACE with in-memory version for Hostinger
import { LRUCache } from 'lru-cache';

type Options = {
  uniqueTokenPerInterval?: number;
  interval?: number;
};

export function rateLimit(options?: Options) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval ?? 500,
    ttl: options?.interval ?? 60_000,
  });

  return {
    check: (limit: number, token: string) => {
      const tokenCount = tokenCache.get(token) ?? [];
      const currentTime = Date.now();
      const windowStart = currentTime - (options?.interval ?? 60_000);
      const requestsInWindow = tokenCount.filter((t) => t > windowStart);

      if (requestsInWindow.length >= limit) {
        return Promise.reject(new Error('Rate limit exceeded'));
      }

      requestsInWindow.push(currentTime);
      tokenCache.set(token, requestsInWindow);
      return Promise.resolve();
    },
  };
}
```

**Step 2 — Install dependency:**

```bash
npm install lru-cache
```

**Step 3 — Wire into auth + public POST routes:**

```typescript
// middleware pattern — add to any public POST route handler
import { rateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  
  try {
    await limiter.check(10, ip); // 10 requests per minute per IP
  } catch {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  
  // ... rest of route handler
}
```

**Routes that MUST be rate-limited (in order of priority):**

| Route | Limit | Reason |
|---|---|---|
| `POST /api/auth/signin` | 5/min per IP | Brute force prevention |
| `POST /api/auth/forgot-password` | 3/min per IP | Email abuse prevention |
| `POST /api/admissions/apply` | 3/min per IP | Spam prevention |
| `POST /api/landing/inquiries` | 5/min per IP | Spam prevention |
| `POST /api/staff-applications` | 2/min per IP | Abuse prevention |

**✅ Done When:**
- [ ] 6+ rapid POST requests to `/api/auth/signin` return `429` after threshold
- [ ] Rate limit response includes `Retry-After` header
- [ ] Auth flow works normally below threshold (5 attempts = success, 6th = 429)

---

### 3.3 Session Token Rotation

**File:** `auth.ts` or `app/api/auth/[...nextauth]/route.ts` (wherever NextAuth is configured)

**Risk:** Without token rotation, a stolen session token remains valid indefinitely — session fixation and token theft attacks are unexploited.

**Implementation:**

```typescript
// auth.ts — NextAuth v5 configuration
import NextAuth from 'next-auth';

export const { handlers, signIn, signOut, auth } = NextAuth({
  // ... existing providers, adapter, etc.
  
  session: {
    strategy: 'database', // or 'jwt' — confirm your current strategy
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // rotate every 24 hours
  },
  
  callbacks: {
    async session({ session, token, user }) {
      // Attach role + campus to session for RBAC
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? '';
        session.user.role = user?.role ?? token?.role;
        session.user.campusId = user?.campusId ?? token?.campusId;
      }
      return session;
    },
    
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.campusId = user.campusId;
      }
      // Force token refresh on session update
      if (trigger === 'update' && session) {
        token = { ...token, ...session };
      }
      return token;
    },
  },
  
  // Secure cookie configuration
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      },
    },
  },
});
```

**✅ Done When:**
- [ ] Session cookie is `HttpOnly` and `Secure` (verify in browser DevTools → Application → Cookies)
- [ ] Session token in database has an `expires` field that is 30 days from login
- [ ] Token refreshes every 24 hours (verified by checking `Session.expires` in Prisma Studio after 24h)

---

### 3.4 Request Body Size Limits

**File:** Per route or global `next.config.ts`

**Risk:** Large payload attacks can exhaust memory and cause DoS on a single-instance Hostinger Node.js deployment.

```typescript
// In each API route that accepts file/body data:
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb', // Adjust per route — admission photos: 5mb, text-only: 512kb
    },
  },
};
```

For file upload routes specifically:

```typescript
// app/api/uploads/[type]/route.ts
export const config = {
  api: {
    bodyParser: false, // Handle manually for multipart
  },
};

// Then validate size after parsing:
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 413 });
}
```

**✅ Done When:**
- [ ] POST with 10MB JSON body to a text-only route returns `413`
- [ ] File upload beyond limit returns `413` with descriptive error message

---

### 3.5 CORS Hardening

**File:** `next.config.ts` and/or `middleware.ts`

**Remove:** `allowedDevOrigins` in production config — this must not be present in the production build.

```typescript
// middleware.ts — enforce CORS
import { NextResponse, NextRequest } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://www.yourdomain.com',
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const response = NextResponse.next();

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Vary', 'Origin');
  }

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

**✅ Done When:**
- [ ] `OPTIONS` preflight from `https://yourdomain.com` returns `Access-Control-Allow-Origin: https://yourdomain.com`
- [ ] Request from `https://malicious.com` does not receive CORS headers

---

### 3.6 Dependency Scanning

**File:** `.github/workflows/security.yml` (create this)

```yaml
name: Security Audit

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 8 * * 1' # Every Monday 8am UTC

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --audit-level=high
      - name: Check for critical vulnerabilities
        run: |
          RESULT=$(npm audit --json | jq '.metadata.vulnerabilities.critical')
          if [ "$RESULT" -gt 0 ]; then
            echo "Critical vulnerabilities found: $RESULT"
            exit 1
          fi
```

**✅ Done When:**
- [ ] `npm audit` runs in CI on every push to `main`
- [ ] Build fails if critical vulnerabilities are detected
- [ ] Weekly schedule is active in GitHub Actions

---

## 4. Session Management Implementation

**Confidence Level: CONFIRMED** — Based on NextAuth.js v5 official documentation and OWASP Session Management Cheat Sheet.

### 4.1 Session Lifecycle Architecture

```
User Login
    ↓
NextAuth creates Session record in DB (expires = now + 30d)
    ↓
Session token set as HttpOnly Secure cookie
    ↓
Every request: middleware validates session token against DB
    ↓
Every 24h: updateAge triggers token rotation (new token, old invalidated)
    ↓
User Logout → Session deleted from DB → Cookie cleared
    ↓
Session expiry → DB record expires → Cookie becomes invalid
    ↓
Middleware redirects to /login with ?callbackUrl=[original path]
```

### 4.2 Session Expiry + Re-Authentication Flow

**File:** `middleware.ts` (create or update)

```typescript
// middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  '/',
  '/admissions/apply',
  '/api/auth',
  '/api/landing',
  '/api/admissions',
  '/api/health',
];

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  
  // Allow public paths
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (isPublic) return NextResponse.next();

  // No session — redirect to login with callback
  if (!req.auth) {
    const loginUrl = new URL('/api/auth/signin', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    loginUrl.searchParams.set('error', 'SessionExpired');
    return NextResponse.redirect(loginUrl);
  }

  // Session exists but role mismatch — redirect to appropriate dashboard
  const userRole = req.auth.user?.role;
  const roleDashboardMap: Record<string, string> = {
    SUPER_ADMIN: '/dashboard/super-admin',
    ADMIN: '/dashboard/admin',
    TEACHER: '/dashboard/teacher',
    ACCOUNTANT: '/dashboard/accountant',
    STUDENT: '/dashboard/student',
    PARENT: '/dashboard/parent',
    GUARDIAN: '/dashboard/guardian',
  };

  // Enforce role-based route access at middleware layer
  if (pathname.startsWith('/dashboard/super-admin') && userRole !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL(roleDashboardMap[userRole] ?? '/', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
```

### 4.3 Client-Side Session Expiry Notification

**File:** `components/layout/SessionExpiryToast.tsx` (create this)

```typescript
'use client';
import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner'; // or your toast library

const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function SessionExpiryToast() {
  const { data: session } = useSession();
  const toastShown = useRef(false);

  useEffect(() => {
    if (!session?.expires) return;
    
    const expiresAt = new Date(session.expires).getTime();
    const warningAt = expiresAt - WARNING_BEFORE_EXPIRY_MS;
    const now = Date.now();
    
    if (warningAt <= now) return; // Already past warning time
    
    const timeout = setTimeout(() => {
      if (!toastShown.current) {
        toastShown.current = true;
        toast.warning('Your session expires in 5 minutes. Save your work.', {
          action: {
            label: 'Stay signed in',
            onClick: () => {
              // Trigger session refresh
              fetch('/api/auth/session').then(() => {
                toastShown.current = false;
                toast.success('Session extended.');
              });
            },
          },
          duration: 60_000,
        });
      }
    }, warningAt - now);

    return () => clearTimeout(timeout);
  }, [session]);

  return null;
}
```

**Add to root layout:**

```typescript
// app/layout.tsx or app/dashboard/layout.tsx
import { SessionExpiryToast } from '@/components/layout/SessionExpiryToast';

// Inside the layout body:
<SessionExpiryToast />
```

**✅ Done When:**
- [ ] Expired session redirects to `/api/auth/signin?callbackUrl=[original]&error=SessionExpired`
- [ ] Login page shows "Session expired" message when `?error=SessionExpired` is present
- [ ] After re-login, user is redirected to their original `callbackUrl`
- [ ] Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` in production
- [ ] Toast warning appears 5 minutes before session expiry

---

## 5. Performance Optimization Plan

**Confidence Level: CONFIRMED** — Bottlenecks identified from `README.md` performance analysis and architecture review.

### 5.1 N+1 Query Elimination

**Files:** All routes under `app/api/` that fetch related data

**Problem pattern (currently exists in multiple routes):**

```typescript
// ❌ WRONG — N+1: 1 query for students + N queries for each student's attendance
const students = await prisma.student.findMany({ where: { campusId } });
const withAttendance = await Promise.all(
  students.map(async (s) => ({
    ...s,
    attendance: await prisma.attendance.findMany({ where: { studentId: s.id } }),
  }))
);
```

**Correct pattern:**

```typescript
// ✅ CORRECT — Single JOIN via Prisma include + select
const students = await prisma.student.findMany({
  where: { campusId },
  select: {
    id: true,
    name: true,
    rollNumber: true,
    attendance: {
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        date: true,
        status: true,
      },
    },
  },
});
```

**Dashboard badge count pattern — REPLACE:**

```typescript
// ❌ WRONG — 6+ separate COUNT queries
const totalStudents = await prisma.student.count({ where: { campusId } });
const pendingFees = await prisma.feeInvoice.count({ where: { campusId, status: 'PENDING' } });
const absentToday = await prisma.attendance.count({ where: { date: today, status: 'ABSENT' } });
// ... 3 more queries

// ✅ CORRECT — Single raw SQL aggregation
const stats = await prisma.$queryRaw`
  SELECT
    COUNT(DISTINCT s.id) FILTER (WHERE s."campusId" = ${campusId}) AS total_students,
    COUNT(fi.id) FILTER (WHERE fi.status = 'PENDING' AND fi."campusId" = ${campusId}) AS pending_fees,
    COUNT(a.id) FILTER (WHERE a.date = ${today} AND a.status = 'ABSENT') AS absent_today,
    COUNT(lr.id) FILTER (WHERE lr.status = 'PENDING') AS pending_leaves,
    COUNT(ar.id) FILTER (WHERE ar.status = 'PENDING') AS pending_admissions,
    COUNT(sa.id) FILTER (WHERE sa.status = 'PENDING') AS pending_applications
  FROM "Campus" c
  LEFT JOIN "Student" s ON s."campusId" = c.id
  LEFT JOIN "FeeInvoice" fi ON fi."campusId" = c.id
  LEFT JOIN "Attendance" a ON a."campusId" = c.id
  LEFT JOIN "LeaveRequest" lr ON TRUE
  LEFT JOIN "AdmissionRequest" ar ON TRUE
  LEFT JOIN "StaffApplicationRequest" sa ON TRUE
  WHERE c.id = ${campusId}
`;
```

**Note:** Adapt this query for MySQL syntax on Hostinger — replace `FILTER (WHERE ...)` with `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`.

---

### 5.2 Database Index Audit

**File:** `prisma/schema.prisma`

Add composite indexes for the most common query patterns identified in the API routes:

```prisma
// Add to relevant models in schema.prisma

model Attendance {
  // ... existing fields
  @@index([campusId, date, status])
  @@index([studentId, date])
}

model FeeInvoice {
  // ... existing fields
  @@index([campusId, status, dueDate])
  @@index([studentId, status])
}

model Student {
  // ... existing fields  
  @@index([campusId, isActive])
}

model TeacherAttendance {
  // ... existing fields
  @@index([teacherId, date])
  @@index([campusId, date, status])
}

model AuditLog {
  // ... existing fields
  @@index([userId, createdAt])
  @@index([action, createdAt])
}
```

**Run after schema change:**

```bash
npx prisma migrate dev --name add_composite_indexes
```

**✅ Done When:**
- [ ] `EXPLAIN ANALYZE` on dashboard badge count query shows index scans, not sequential scans
- [ ] Attendance queries for date ranges use the `[campusId, date, status]` index

---

### 5.3 Server Component Migration (Dashboard Pages)

**Target files:** All `app/dashboard/**/*.tsx` that currently use `'use client'` + `useEffect` + `fetch`

**Priority order (migrate in this sequence):**

1. Dashboard stat/badge pages (read-only aggregations — highest gain)
2. Student/Teacher list pages (read-only, high traffic)
3. Report view pages (read-only, slow due to data volume)
4. Leave only interactive forms as Client Components

**Pattern to follow:**

```typescript
// ❌ CURRENT — client-rendered with fetch waterfall
'use client';
import { useEffect, useState } from 'react';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(d => {
      setStudents(d.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;
  return <StudentTable data={students} />;
}

// ✅ TARGET — server component (no useEffect, no fetch, no spinner)
import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { StudentTable } from '@/components/academic/StudentTable';

export default async function StudentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/api/auth/signin');

  const students = await prisma.student.findMany({
    where: { campusId: session.user.campusId, isActive: true },
    select: {
      id: true,
      name: true,
      rollNumber: true,
      classSection: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  return <StudentTable data={students} />;
}
```

**✅ Done When:**
- [ ] Dashboard stat page renders without any client-side fetch
- [ ] Network tab shows no XHR/Fetch calls on page load for migrated pages
- [ ] Page load time (First Contentful Paint) improves by ≥40% vs baseline

---

### 5.4 Dynamic Imports (Bundle Reduction)

**File:** Any component that imports Recharts, Framer Motion, or ExcelJS at the top level

```typescript
// ❌ WRONG — loads entire library at initial bundle
import { BarChart, LineChart, PieChart } from 'recharts';

// ✅ CORRECT — only loads when component is rendered
import dynamic from 'next/dynamic';

const BarChart = dynamic(() => import('recharts').then(m => ({ default: m.BarChart })), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

// For Framer Motion on landing page:
const MotionSection = dynamic(() => import('framer-motion').then(m => ({ default: m.motion.section })), {
  ssr: false,
});

// For PDF generation (jsPDF):
const generatePdf = async (data: ReportData) => {
  const { jsPDF } = await import('jspdf'); // lazy import
  const doc = new jsPDF();
  // ...
};
```

**Target bundle reduction: ~300KB from initial payload.**

**✅ Done When:**
- [ ] `npm run build` output shows Recharts and Framer Motion are NOT in the main chunk
- [ ] `next/bundle-analyzer` report shows initial JS payload < 500KB (gzipped)

---

### 5.5 Static Data Caching

**Target:** Campuses, shifts, academic years, subjects — data that rarely changes.

```typescript
// lib/cache.ts — simple in-memory cache for Hostinger single-instance
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlSeconds = 300): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Usage in API routes:
export async function GET(req: NextRequest) {
  const CACHE_KEY = 'campuses:all';
  const cached = getCached<Campus[]>(CACHE_KEY);
  if (cached) return NextResponse.json({ data: cached });

  const campuses = await prisma.campus.findMany({ where: { isActive: true } });
  setCached(CACHE_KEY, campuses, 600); // 10-minute TTL
  return NextResponse.json({ data: campuses });
}
```

**Add `Cache-Control` headers for static API responses:**

```typescript
return NextResponse.json({ data: campuses }, {
  headers: {
    'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
  },
});
```

**✅ Done When:**
- [ ] Campus list API returns `Cache-Control: public, s-maxage=600` header
- [ ] Repeated `/api/campuses` calls return within 2ms from cache

---

### 5.6 Excel/PDF Report Async Offloading

**Problem:** ExcelJS generates large reports synchronously in API routes, blocking the Node.js event loop for 2–10 seconds.

**Solution — Two-phase approach:**

```typescript
// Phase 1: Trigger job (immediate response)
// POST /api/reports/generate
export async function POST(req: NextRequest) {
  const { reportType, campusId, month } = await req.json();
  
  const jobId = cuid();
  
  // Store job in DB (pending)
  await prisma.reportJob.create({
    data: { id: jobId, type: reportType, campusId, month, status: 'PENDING' },
  });
  
  // Fire-and-forget background generation
  generateReportAsync(jobId, reportType, campusId, month).catch(console.error);
  
  return NextResponse.json({ jobId, status: 'PENDING' });
}

// Phase 2: Poll for completion
// GET /api/reports/status/[jobId]
export async function GET(_: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await prisma.reportJob.findUnique({ where: { id: params.jobId } });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  
  return NextResponse.json({
    status: job.status,
    downloadUrl: job.status === 'COMPLETE' ? `/uploads/reports/${job.id}.xlsx` : null,
  });
}
```

**Add to Prisma schema:**

```prisma
model ReportJob {
  id          String   @id @default(cuid())
  type        String
  campusId    String
  month       String?
  status      String   @default("PENDING") // PENDING | PROCESSING | COMPLETE | FAILED
  error       String?
  createdAt   DateTime @default(now())
  completedAt DateTime?
}
```

**✅ Done When:**
- [ ] Report generation API returns immediately with `jobId`
- [ ] Polling endpoint returns `COMPLETE` + download URL after generation finishes
- [ ] No API route times out during 500-row Excel generation

---

## 6. UI/UX and Loading Enhancement Plan

**Confidence Level: CONFIRMED** — Based on established skeleton loading UX patterns (Nielsen Norman Group research on perceived performance).

### 6.1 Skeleton Screen Component Library

**File:** `components/ui/skeletons/` (create this directory)

**Global Skeleton Primitive:**

```typescript
// components/ui/skeletons/Skeleton.tsx
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted rounded-md',
        variant === 'circle' && 'rounded-full',
        variant === 'text' && 'h-4 rounded',
        className
      )}
      aria-hidden="true"
    />
  );
}
```

**Dashboard Stats Skeleton:**

```typescript
// components/ui/skeletons/DashboardStatsSkeleton.tsx
import { Skeleton } from './Skeleton';

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
```

**Table Skeleton:**

```typescript
// components/ui/skeletons/TableSkeleton.tsx
import { Skeleton } from './Skeleton';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 8, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className={cn('h-4 flex-1', colIdx === 0 && 'w-8 flex-none')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 6.2 Page-Level Loading States (`loading.tsx`)

Create a `loading.tsx` file next to each dashboard page — Next.js automatically shows it during server-side data fetching:

```typescript
// app/dashboard/admin/students/loading.tsx
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton';
import { DashboardStatsSkeleton } from '@/components/ui/skeletons/DashboardStatsSkeleton';

export default function StudentsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse bg-muted rounded" />
          <div className="h-4 w-64 animate-pulse bg-muted rounded" />
        </div>
        <div className="h-10 w-32 animate-pulse bg-muted rounded" />
      </div>
      <DashboardStatsSkeleton />
      <TableSkeleton rows={10} columns={6} />
    </div>
  );
}
```

**Create `loading.tsx` for these routes (in priority order):**

1. `app/dashboard/admin/students/loading.tsx`
2. `app/dashboard/admin/teachers/loading.tsx`
3. `app/dashboard/admin/fees/loading.tsx`
4. `app/dashboard/teacher/attendance/loading.tsx`
5. `app/dashboard/teacher/grades/loading.tsx`
6. `app/dashboard/accountant/loading.tsx`

### 6.3 Progress Bar for Navigation

**File:** `components/layout/NavigationProgress.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function NavigationProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setLoading(true);
    setWidth(30);
    
    const t1 = setTimeout(() => setWidth(70), 100);
    const t2 = setTimeout(() => {
      setWidth(100);
      setTimeout(() => {
        setLoading(false);
        setWidth(0);
      }, 200);
    }, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div
      role="progressbar"
      aria-label="Page loading"
      aria-valuenow={width}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '3px',
        width: `${width}%`,
        background: 'hsl(var(--primary))',
        transition: 'width 0.3s ease, opacity 0.2s ease',
        zIndex: 9999,
      }}
    />
  );
}
```

**Add to root layout:**

```typescript
// app/layout.tsx
<NavigationProgress />
```

### 6.4 Error Boundaries for Dashboard Pages

**File:** `components/ui/DashboardErrorBoundary.tsx`

```typescript
'use client';
import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Log to your monitoring service
    console.error('Dashboard error:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <p className="text-muted-foreground text-sm">Something went wrong loading this page.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Wrap all dashboard pages:**

```typescript
// app/dashboard/layout.tsx
import { DashboardErrorBoundary } from '@/components/ui/DashboardErrorBoundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardErrorBoundary>
      {children}
    </DashboardErrorBoundary>
  );
}
```

**✅ Done When:**
- [ ] Every dashboard page shows skeleton (not spinner) while loading
- [ ] Navigation between pages shows top progress bar
- [ ] Simulated API error shows error boundary with "Try Again" button
- [ ] No dashboard page shows a blank white screen during any loading state

---

## 7. Hostinger Production Deployment

**Reference:** `docs/HOSTINGER_DEPLOYMENT.md` — read that document alongside this section.

### 7.1 Environment Variables (Production)

Set **all of the following** in hPanel → Node.js Web App → Environment Variables. Do not commit these to Git.

```env
# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL="mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME"

# ── Auth ──────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET="<openssl rand -hex 32>"
NEXTAUTH_URL="https://yourdomain.com"
AUTH_SECRET="<same value as NEXTAUTH_SECRET>"

# ── App ───────────────────────────────────────────────────────────────────
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_NAME="Evershaheen Academy LMS"
NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY="true"

# ── Cron security ─────────────────────────────────────────────────────────
CRON_SECRET="<openssl rand -hex 32>"

# ── Email (Hostinger SMTP) ────────────────────────────────────────────────
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="<mailbox-password>"
SMTP_FROM="Evershaheen Academy <noreply@yourdomain.com>"
```

**Must NOT be present in production:**

```env
# Delete these from Hostinger env vars
DIRECT_URL=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 7.2 Health Check Endpoint

**File:** `app/api/health/route.ts` (create this — required for load balancer and monitoring)

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Test database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: process.env.npm_package_version ?? 'unknown',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'Database health check failed',
      },
      { status: 503 }
    );
  }
}
```

**✅ Done When:**
- [ ] `GET https://yourdomain.com/api/health` returns `200` with `{ status: 'ok', database: 'connected' }`
- [ ] When DB is unreachable, endpoint returns `503`

### 7.3 File Upload Directory Setup

**Required before first deploy:**

```bash
# Create upload directories
mkdir -p public/uploads/admissions
mkdir -p public/uploads/students
mkdir -p public/uploads/teachers
mkdir -p public/uploads/fee-proofs
mkdir -p public/uploads/reports

# Create .gitkeep to preserve folder structure in Git
touch public/uploads/admissions/.gitkeep
touch public/uploads/students/.gitkeep
touch public/uploads/teachers/.gitkeep
touch public/uploads/fee-proofs/.gitkeep
touch public/uploads/reports/.gitkeep
```

**Add to `.gitignore`:**

```gitignore
# Upload files (not committed)
/public/uploads/**
!/public/uploads/**/.gitkeep
```

### 7.4 MySQL Query Syntax Fixes

When migrating from PostgreSQL to MySQL, these patterns require changes:

| PostgreSQL | MySQL / Prisma MySQL |
|---|---|
| `FILTER (WHERE ...)` in aggregates | `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` |
| `::text` casts | Remove — use Prisma types |
| `ILIKE` for case-insensitive search | `LIKE` (MySQL is case-insensitive by default) |
| `gen_random_uuid()` | Prisma `@default(cuid())` — unchanged |
| `@db.Text` | OK on MySQL |
| `Json` fields | OK on MySQL as `JSON` |

**Search all raw SQL queries:**

```bash
# Find all raw SQL that may need MySQL adjustment
grep -rn '\$queryRaw\|\$executeRaw' app/ lib/ --include="*.ts" --include="*.tsx"
```

Review each result and update syntax for MySQL.

---

## 8. Implementation Priority Matrix

Execute tasks in this exact order. Do not start a row until all higher-priority rows are ✅ complete.

| Priority | ID | Task | Effort | Impact | Section |
|---|---|---|---|---|---|
| 🔴 P0-1 | `SEC-01` | Add CSP + security headers | 2h | Critical | §3.1 |
| 🔴 P0-2 | `SEC-02` | Wire rate limiter into auth routes | 3h | Critical | §3.2 |
| 🔴 P0-3 | `SEC-03` | Enable session token rotation | 2h | Critical | §3.3 |
| 🔴 P0-4 | `SEC-04` | Implement session expiry + re-auth flow | 4h | Critical | §4.2 |
| 🟠 P1-1 | `PERF-01` | Fix N+1 queries in dashboard badge routes | 1 day | High | §5.1 |
| 🟠 P1-2 | `PERF-02` | Add composite DB indexes | 2h | High | §5.2 |
| 🟠 P1-3 | `UX-01` | Add skeleton screens + `loading.tsx` files | 1 day | High | §6.1–6.2 |
| 🟠 P1-4 | `PERF-03` | Dynamic imports for Recharts + Framer Motion | 3h | High | §5.4 |
| 🟠 P1-5 | `SEC-05` | Add request body size limits | 1h | Medium | §3.4 |
| 🟠 P1-6 | `SEC-06` | Harden CORS configuration | 2h | Medium | §3.5 |
| 🟡 P2-1 | `HOST-01` | Switch Prisma to MySQL; regenerate migrations | 4h | High | §7, HOSTINGER_DEPLOYMENT §4 |
| 🟡 P2-2 | `HOST-02` | Replace Resend with Hostinger SMTP | 3h | High | HOSTINGER_DEPLOYMENT §5 |
| 🟡 P2-3 | `HOST-03` | Migrate Cloudinary → disk uploads | 4h | Medium | HOSTINGER_DEPLOYMENT §6 |
| 🟡 P2-4 | `HOST-04` | Create health check endpoint | 1h | Medium | §7.2 |
| 🟡 P2-5 | `HOST-05` | Configure Hostinger Node.js app + env vars | 2h | High | §7.1 |
| 🟡 P2-6 | `HOST-06` | Configure hPanel cron jobs | 1h | Medium | HOSTINGER_DEPLOYMENT §10 |
| 🟡 P2-7 | `UX-02` | Add navigation progress bar | 1h | Medium | §6.3 |
| 🟡 P2-8 | `UX-03` | Add React error boundaries | 2h | Medium | §6.4 |
| 🟢 P3-1 | `PERF-04` | Server Component migration (dashboard pages) | 3 days | High | §5.3 |
| 🟢 P3-2 | `PERF-05` | Async report generation queue | 1 day | Medium | §5.6 |
| 🟢 P3-3 | `PERF-06` | Static data caching (in-memory) | 3h | Medium | §5.5 |
| 🟢 P3-4 | `SEC-07` | Set up dependency scanning in CI | 1h | Medium | §3.6 |
| 🟢 P3-5 | `MON-01` | Add Sentry error tracking | 2h | Medium | §10 |

**Total estimated effort:** ~6–8 working days for P0 + P1 tasks (production-blocking). P2 adds 2–3 days for Hostinger migration.

---

## 9. Security Test Scenarios

**For AI agents:** Execute these test scenarios after implementing §3. All tests must pass before marking security hardening complete.

### 9.1 Session Expiry Tests

```bash
# Test 1: Session persists after refresh
# 1. Log in as Admin
# 2. Navigate to /dashboard/admin/students
# 3. Hard-refresh page (Ctrl+Shift+R)
# Expected: Page loads with session intact, no redirect to login

# Test 2: Session expiry redirect
# 1. Manually expire session by deleting Session record in Prisma Studio
# 2. Navigate to /dashboard/admin/students
# Expected: Redirect to /api/auth/signin?callbackUrl=/dashboard/admin/students&error=SessionExpired

# Test 3: Session token not in URL
# Open DevTools → Network → Any authenticated request
# Expected: Session token ONLY in cookie, NEVER in URL query params or response body
```

### 9.2 Rate Limiting Tests

```bash
# Test: Brute force login prevention
for i in {1..10}; do
  curl -s -X POST https://yourdomain.com/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrongpassword"}' \
    -w "\nHTTP Status: %{http_code}\n"
done
# Expected: First 5 attempts return 401, 6th+ return 429 with Retry-After header

# Test: Rate limit reset after interval
sleep 61
curl -X POST https://yourdomain.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@evershaheen.com","password":"correct_password"}'
# Expected: 200 (rate limit window reset)
```

### 9.3 Authorization Bypass Tests

```bash
# Test 1: Student cannot access admin API
# 1. Log in as STUDENT
# 2. GET the session token from browser cookies
# 3. Try to call admin-only endpoint:
curl -H "Cookie: next-auth.session-token=<STUDENT_TOKEN>" \
  https://yourdomain.com/api/admin/users
# Expected: 403 Forbidden

# Test 2: Boys campus data isolation
# 1. Log in as Admin of Boys campus
# 2. Try to access Girls campus student endpoint
curl -H "Cookie: next-auth.session-token=<BOYS_ADMIN_TOKEN>" \
  "https://yourdomain.com/api/students?campusId=<GIRLS_CAMPUS_ID>"
# Expected: 403 or empty result set (data isolation enforced)

# Test 3: SUPER_ADMIN cannot write grades (view-only restriction)
# 1. Log in as SUPER_ADMIN
# 2. POST to grade entry endpoint
curl -X POST -H "Cookie: next-auth.session-token=<SUPER_ADMIN_TOKEN>" \
  -d '{"grade": 95}' https://yourdomain.com/api/academic-upgrades/grades
# Expected: 403 Forbidden (SUPER_ADMIN is view-only for grades per RBAC matrix)
```

### 9.4 Input Validation + Injection Tests

```bash
# Test 1: XSS attempt in student name
curl -X POST https://yourdomain.com/api/admissions/apply \
  -H "Content-Type: application/json" \
  -d '{"studentName": "<script>alert(1)</script>", ...}'
# Expected: 400 Bad Request (Zod validation rejects HTML in name fields)

# Test 2: SQL injection via search param (should be impossible with Prisma, confirm)
curl "https://yourdomain.com/api/students?search='; DROP TABLE Student;--"
# Expected: 200 with empty results or 400 — NOT a 500 error

# Test 3: Oversized payload DoS
curl -X POST https://yourdomain.com/api/admissions/apply \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'print("{\"name\":\"" + "A"*100000 + "\"}")')"
# Expected: 413 Payload Too Large
```

### 9.5 Cron Endpoint Security Tests

```bash
# Test 1: Unauthorized cron access
curl -s https://yourdomain.com/api/cron/fee-penalties
# Expected: 401 Unauthorized

# Test 2: Wrong secret
curl -H "Authorization: Bearer wrongsecret" https://yourdomain.com/api/cron/fee-penalties
# Expected: 401 Unauthorized

# Test 3: Correct secret
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/fee-penalties
# Expected: 200 with JSON result body

# Test all 4 cron endpoints:
for route in fee-penalties teacher-attendance fee-reminder birthday-check; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $CRON_SECRET" \
    "https://yourdomain.com/api/cron/$route")
  echo "$route: $STATUS"
done
# Expected: All return 200
```

### 9.6 CSP Header Validation

```bash
# Verify all security headers are present
curl -I https://yourdomain.com | grep -E "Content-Security-Policy|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Strict-Transport-Security"
# Expected: All 5 headers present with correct values
```

---

## 10. Monitoring and Observability Setup

**Confidence Level: LIKELY** — Sentry is industry-standard for Next.js error tracking; no Hostinger-specific constraints found.

### 10.1 Sentry Integration (Error Tracking)

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

**Add to environment:**

```env
SENTRY_DSN="https://<key>@<org>.ingest.sentry.io/<project>"
SENTRY_ENVIRONMENT="production"
```

**Capture handled errors in API routes:**

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // API logic
} catch (error) {
  Sentry.captureException(error, {
    extra: { userId: session.user.id, campusId: session.user.campusId },
  });
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

### 10.2 Structured Logging

Replace `console.log` with a structured logger:

```typescript
// lib/logger.ts
export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: 'info', msg, ...ctx, timestamp: new Date().toISOString() })),
  
  warn: (msg: string, ctx?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: 'warn', msg, ...ctx, timestamp: new Date().toISOString() })),
  
  error: (msg: string, error?: unknown, ctx?: Record<string, unknown>) =>
    console.error(JSON.stringify({
      level: 'error', msg,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...ctx,
      timestamp: new Date().toISOString(),
    })),
};
```

### 10.3 Database Backup Automation

**hPanel → Cron Jobs → Add:**

```bash
# Daily at 3:00 AM PKT (UTC+5 = 22:00 UTC previous day)
# Schedule: 0 22 * * *
mysqldump -u DB_USER -pDB_PASS DB_NAME | gzip > /home/user/backups/evershaheen_$(date +%Y%m%d).sql.gz

# Weekly: delete backups older than 30 days
find /home/user/backups/ -name "*.sql.gz" -mtime +30 -delete
```

**Upload directory backup:**

```bash
# Daily at 3:30 AM PKT (UTC 22:30)
# Schedule: 30 22 * * *
tar -czf /home/user/backups/uploads_$(date +%Y%m%d).tar.gz /home/user/public_html/public/uploads/
```

---

## 11. Production Smoke Test Checklist

Run after deploying to Hostinger. All items must pass before removing the maintenance banner.

### 11.1 Authentication & Security

- [ ] Login succeeds for Admin, Teacher, Student roles
- [ ] Invalid credentials return 401 (not 500)
- [ ] Expired session redirects to login with callbackUrl
- [ ] Session cookie is HttpOnly + Secure (check DevTools)
- [ ] Unauthorized API request returns 403 (not 200 or 500)
- [ ] CSP header present on all responses
- [ ] Rate limiter returns 429 after 6 rapid login attempts
- [ ] Cron endpoints return 401 without header, 200 with correct secret
- [ ] HTTPS enforced; HTTP redirects to HTTPS

### 11.2 Core Functionality

- [ ] Password reset email delivered via Hostinger SMTP
- [ ] Student admission photo upload saves to `/uploads/admissions/`
- [ ] Admission photo renders correctly in admin panel
- [ ] Excel report generates and downloads
- [ ] PDF result card generates and downloads
- [ ] Attendance marking saves and reflects in student portal
- [ ] Fee invoice generated and visible to student

### 11.3 Cron Jobs (Manual Test)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/fee-penalties
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/teacher-attendance
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/fee-reminder
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/birthday-check
```

All must return `200`.

### 11.4 Performance Baseline

After deployment, measure and record these baselines using Chrome DevTools Lighthouse:

| Metric | Target | Acceptable |
|---|---|---|
| First Contentful Paint (FCP) | < 1.5s | < 2.5s |
| Largest Contentful Paint (LCP) | < 2.5s | < 4s |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.25 |
| Time to Interactive (TTI) | < 3.5s | < 5s |
| API response (dashboard badges) | < 200ms | < 500ms |
| Login API response | < 300ms | < 800ms |

---

## 12. Agent Chat Memory Template

**File:** `docs/.CHAT_MEMORY.md` — Create this file. Update it after every task.

```markdown
# Agent Chat Memory — Evershaheen Academy LMS

## Last Updated
[ISO 8601 timestamp — update on every task completion]

## Completed Tasks
- [ ] SEC-01: CSP headers
- [ ] SEC-02: Rate limiter wiring
- [ ] SEC-03: Session token rotation
- [ ] SEC-04: Session expiry + re-auth flow
- [ ] PERF-01: N+1 query elimination
- [ ] PERF-02: Composite DB indexes
- [ ] UX-01: Skeleton screens + loading.tsx files
- [ ] PERF-03: Dynamic imports
- [ ] SEC-05: Body size limits
- [ ] SEC-06: CORS hardening
- [ ] HOST-01: MySQL migration
- [ ] HOST-02: Nodemailer SMTP
- [ ] HOST-03: Disk uploads
- [ ] HOST-04: Health check endpoint
- [ ] HOST-05: Hostinger deployment config
- [ ] HOST-06: hPanel cron jobs
- [ ] UX-02: Navigation progress bar
- [ ] UX-03: Error boundaries
- [ ] PERF-04: Server Component migration
- [ ] PERF-05: Async report queue
- [ ] PERF-06: Static data caching
- [ ] SEC-07: CI dependency scanning
- [ ] MON-01: Sentry setup

## Current State
[Update this section after each task — describe exactly what has been implemented]
- Database: [PostgreSQL / MySQL] at [location]
- Auth: [Session rotation enabled / not yet]
- Rate limiting: [Wired / not wired]
- Hosting: [Vercel / Hostinger]
- SMTP: [Resend / Hostinger SMTP]
- File storage: [Cloudinary / Disk]

## Next Steps
[List the next 3 tasks from the Priority Matrix in §8]
1. [Task ID]: [Description]
2. [Task ID]: [Description]
3. [Task ID]: [Description]

## Decisions Made
[Record any deviation from this spec with rationale]

## Issues Encountered
[Record any blockers, unexpected behavior, or resolution steps]
```

---

## 13. Prohibited Practices — Non-Negotiable

```
❌ Never commit .env, .env.production, or secrets to Git
❌ Never use any in TypeScript — use proper types
❌ Never store passwords, tokens, or secrets in database plain text
❌ Never return raw database errors in API responses (expose internal schema)
❌ Never skip Zod validation on a new API route
❌ Never write raw SQL without parameterization
❌ Never use console.log in production code — use the structured logger (§10.2)
❌ Never mark a task complete without satisfying all items in its ✅ Done When checklist
❌ Never skip updating docs/.CHAT_MEMORY.md after a task
❌ Never add Upstash, Cloudinary, or Resend on Hostinger — use local alternatives (§7)
```

---

## 14. User-Facing Error Handling — Humanized Error System

**Confidence Level: Confirmed** — This section addresses a critical UX and professionalism requirement: end users must never see raw Next.js error messages, stack traces, Prisma error codes, or technical output of any kind. Every error the user sees must be in plain, professional, human-readable language.

### 14.1 The Problem — What Must Never Reach the User

```
❌ Never show: PrismaClientKnownRequestError: Unique constraint failed on fields: [`email`]
❌ Never show: Error: connect ECONNREFUSED 127.0.0.1:3306
❌ Never show: ZodError: [{ "code": "invalid_type", "expected": "string", ... }]
❌ Never show: Error 500 — Internal Server Error (Next.js default page)
❌ Never show: TypeError: Cannot read properties of undefined (reading 'id')
❌ Never show: NEXTAUTH_SECRET is not set
```

These expose your database structure, authentication mechanism, and internal architecture to end users and attackers alike.

---

### 14.2 Global API Error Handler

**File:** `lib/errors.ts` — Create this file. Every API route uses it.

```typescript
// lib/errors.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

// ─── Human-readable error messages ───────────────────────────────────────────

const PRISMA_ERROR_MAP: Record<string, string> = {
  P2002: 'This record already exists. Please check the information and try again.',
  P2003: 'This action could not be completed because a related record was not found.',
  P2025: 'The record you are looking for does not exist or has already been deleted.',
  P2016: 'A required piece of information is missing. Please fill in all required fields.',
  P1001: 'Unable to reach the database. Please try again in a moment.',
  P1002: 'The database took too long to respond. Please try again.',
};

const HTTP_ERROR_MAP: Record<number, string> = {
  400: 'The information you submitted is not valid. Please review and try again.',
  401: 'You need to sign in to access this page.',
  403: 'You do not have permission to perform this action.',
  404: 'The page or record you are looking for could not be found.',
  409: 'A conflict occurred. This record may already exist.',
  413: 'The file or data you submitted is too large. Please reduce the size and try again.',
  429: 'Too many requests. Please wait a moment before trying again.',
  500: 'Something went wrong on our end. Please try again or contact support.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
};

// ─── Main error handler — call this in every API route catch block ─────────────

export function handleApiError(
  error: unknown,
  context?: { route?: string; userId?: string; campusId?: string }
): NextResponse {
  // Log the real error internally (never send to client)
  logger.error('API error', error, context);

  // Zod validation errors → list field-level messages in plain English
  if (error instanceof ZodError) {
    const fieldErrors = error.errors.map((e) => {
      const field = e.path.join(' → ') || 'input';
      return `${field}: ${humanizeZodMessage(e.message, e.code)}`;
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Some information you entered is not valid.',
        details: fieldErrors,
      },
      { status: 400 }
    );
  }

  // Prisma known errors → map to plain English
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = PRISMA_ERROR_MAP[error.code] ?? HTTP_ERROR_MAP[500];
    return NextResponse.json({ success: false, error: message }, { status: mapPrismaStatus(error.code) });
  }

  // Prisma connection errors
  if (error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError) {
    return NextResponse.json(
      { success: false, error: HTTP_ERROR_MAP[503] },
      { status: 503 }
    );
  }

  // AppError (custom — see §14.3)
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: error.userMessage },
      { status: error.statusCode }
    );
  }

  // Unknown errors — never leak details
  return NextResponse.json(
    { success: false, error: HTTP_ERROR_MAP[500] },
    { status: 500 }
  );
}

function humanizeZodMessage(message: string, code: string): string {
  const map: Record<string, string> = {
    invalid_type: 'This field is required and must be in the correct format.',
    too_small: 'This value is too short or too small.',
    too_big: 'This value is too long or too large.',
    invalid_string: 'This field contains an invalid value.',
    invalid_enum_value: 'Please select a valid option.',
    invalid_date: 'Please enter a valid date.',
  };
  return map[code] ?? message;
}

function mapPrismaStatus(code: string): number {
  const map: Record<string, number> = {
    P2002: 409, // Unique constraint → Conflict
    P2025: 404, // Not found
    P1001: 503, // DB unreachable
    P1002: 503, // DB timeout
  };
  return map[code] ?? 500;
}

// ─── Custom application error class ──────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public userMessage: string,   // What the user sees — plain English
    public statusCode: number,    // HTTP status
    public internalMessage?: string // What gets logged — never shown to user
  ) {
    super(internalMessage ?? userMessage);
    this.name = 'AppError';
  }
}
```

---

### 14.3 Standard API Route Pattern — Apply to ALL Routes

**Every API route must follow this exact pattern:**

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleApiError, AppError } from '@/lib/errors';

const requestSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user) {
      throw new AppError('You need to sign in to perform this action.', 401);
    }

    // 2. Parse + validate (Zod throws ZodError on failure — caught below)
    const body = await req.json();
    const data = requestSchema.parse(body);

    // 3. Business logic
    const result = await prisma.someModel.create({ data });

    // 4. Success response
    return NextResponse.json({ success: true, data: result }, { status: 201 });

  } catch (error) {
    // 5. Unified error handler — never leaks internals
    return handleApiError(error, {
      route: 'POST /api/example',
      userId: session?.user?.id,
    });
  }
}
```

**The rule:** Every `catch` block in every API route calls `handleApiError()`. Nothing else.

---

### 14.4 Custom Next.js Error Pages

**File:** `app/error.tsx` — Global client-side error boundary for the entire app

```typescript
// app/error.tsx
'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error); // Log internally
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We encountered an unexpected issue. Our team has been notified.
            Please try again, or contact your administrator if the problem continues.
          </p>
        </div>

        {/* Never show error.message to user — only log it */}
        {process.env.NODE_ENV === 'development' && (
          <pre className="text-xs text-left bg-muted p-4 rounded overflow-auto">
            {error.message}
          </pre>
        )}

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default">
            Try Again
          </Button>
          <Button onClick={() => (window.location.href = '/dashboard')} variant="outline">
            Go to Dashboard
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Error reference: {error.digest ?? 'N/A'}
        </p>
      </div>
    </div>
  );
}
```

**File:** `app/not-found.tsx` — Custom 404 page

```typescript
// app/not-found.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Page Not Found
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The page you are looking for does not exist or may have been moved.
            Please check the address or return to the dashboard.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
```

**File:** `app/global-error.tsx` — Catches errors in root layout itself

```typescript
// app/global-error.tsx
'use client';
import { Button } from '@/components/ui/button';

export default function GlobalRootError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-xl font-semibold">Application Error</h1>
            <p className="text-sm text-gray-500">
              A critical error occurred. Please refresh the page.
            </p>
            <Button onClick={reset}>Refresh Page</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

### 14.5 Toast Notifications for Form Errors (Client-Side)

When an API call fails, the client must show a friendly toast — not a raw JSON error in the console.

```typescript
// hooks/useApiMutation.ts — Reusable hook for all form submissions
'use client';
import { toast } from 'sonner';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string[];
}

export async function callApi<T>(
  url: string,
  options: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });

    const json: ApiResponse<T> = await res.json();

    if (!json.success) {
      // Show the human-readable error from server
      const message = json.error ?? 'Something went wrong. Please try again.';
      const details = json.details?.join('\n');
      toast.error(message, { description: details });
      return null;
    }

    return json.data ?? null;

  } catch {
    // Network error — fetch itself failed
    toast.error('Unable to connect to the server. Please check your connection.');
    return null;
  }
}

// Usage in any form component:
// const result = await callApi('/api/students', { method: 'POST', body: JSON.stringify(data) });
// if (result) toast.success('Student added successfully.');
```

---

### 14.6 Error Handling Verification Checklist

**✅ Done When:**
- [ ] `POST` with invalid Zod schema returns `{ success: false, error: "Some information...", details: ["field: message"] }` — no Zod internal format
- [ ] Duplicate email insert returns `{ success: false, error: "This record already exists..." }` — not `PrismaClientKnownRequestError`
- [ ] Unauthenticated request returns `{ success: false, error: "You need to sign in..." }` — not NextAuth internal message
- [ ] Simulated 500 error shows custom `app/error.tsx` page — not Next.js default error page
- [ ] Unknown URL shows custom `app/not-found.tsx` — not Next.js default 404
- [ ] `error.message` / stack trace is **never visible** in production UI or API response body
- [ ] All errors are logged via `logger.error()` with context — visible in Hostinger app logs, not to users
- [ ] Development mode shows stack trace in `app/error.tsx` for debugging; production hides it

---

## 15. Git-Based Auto-Deploy Workflow on Hostinger

**Confidence Level: Confirmed** — Hostinger Business Node.js Web Apps support GitHub-based Git deployment. Changes pushed to the connected branch automatically trigger a rebuild and restart on Hostinger.

### 15.1 How It Works

```
Your Local Machine
    ↓ git push origin main
GitHub Repository
    ↓ Webhook (automatic — Hostinger polls or receives push event)
Hostinger Node.js Web App
    ↓ git pull (latest commit)
    ↓ npm ci (install dependencies)
    ↓ npm run build (Next.js production build)
    ↓ npm run start (restart app)
Live Site Updated ✅
```

**No manual file upload. No SSH required for routine updates. Every `git push` = live update.**

---

### 15.2 One-Time Setup in hPanel

Do this once during initial deployment:

1. **hPanel → Websites → your domain → Node.js**
2. Under **"Git"** section → click **"Connect Repository"**
3. Authorize GitHub → select your repository (`Ibadat-Ali86/evershine_lms` or your fork)
4. Set **Branch:** `main` (or `production` — whichever is your stable branch)
5. Set **Auto-deploy:** `ON`
6. Set **Build command:** `npm run build`
7. Set **Start command:** `npm run start`
8. Click **Save**

From this point forward: `git push origin main` → Hostinger rebuilds and restarts automatically.

---

### 15.3 Recommended Branch Strategy for Client Work

This is critical: **never push directly to `main`** when making client-requested changes. Use this workflow:

```
main (production — what Hostinger auto-deploys)
 └── staging (test branch — you test here first)
      └── feature/add-new-report (your working branch)
      └── fix/fee-calculation-bug (client-requested fix)
      └── feature/remove-attendance-export (client-requested removal)
```

**Workflow for every client change request:**

```bash
# Step 1 — Create a branch for the change
git checkout -b feature/client-add-monthly-report

# Step 2 — Make the changes
# (add/edit/remove code as requested)

# Step 3 — Test locally
npm run dev
npm run build  # MUST pass before pushing

# Step 4 — Push to GitHub
git add .
git commit -m "feat: add monthly performance report for admin dashboard"
git push origin feature/client-add-monthly-report

# Step 5 — Merge to staging first (test on staging subdomain if available)
git checkout staging
git merge feature/client-add-monthly-report
git push origin staging

# Step 6 — After client approves on staging, merge to main → auto-deploys to production
git checkout main
git merge staging
git push origin main
# ↑ This push triggers Hostinger auto-deploy automatically
```

---

### 15.4 What Happens During a Hostinger Auto-Deploy

Hostinger runs these steps in sequence automatically after each push to `main`:

| Step | Command | What It Does |
|---|---|---|
| 1 | `git pull` | Pulls latest commit from GitHub |
| 2 | `npm ci` | Clean install of dependencies (uses `package-lock.json`) |
| 3 | `npx prisma generate` | Regenerates Prisma client (runs via `postinstall` in `package.json`) |
| 4 | `npm run build` | Next.js production build |
| 5 | App restart | Hostinger restarts the Node.js process with new build |

**If any step fails**, Hostinger keeps the previous version running. The site does not go down.

---

### 15.5 Handling Database Schema Changes During Deploy

If a client change requires a new database column, table, or index, you must run the migration **before or during** the deploy — not after.

**Safe migration workflow:**

```bash
# On your local machine (against a local MySQL that mirrors production):
npx prisma migrate dev --name add_client_requested_column

# This creates a new file in:
# prisma/migrations/20260620_add_client_requested_column/migration.sql

# Commit the migration file along with your code changes:
git add prisma/migrations/
git add prisma/schema.prisma
git add app/  # your code changes
git commit -m "feat: add client requested column with migration"
git push origin main
```

**Then SSH into Hostinger once to apply the migration:**

```bash
# In Hostinger hPanel → Terminal (or SSH):
cd /home/user/public_html
npx prisma migrate deploy
```

**After this, all future deploys with no schema changes require zero manual steps.**

---

### 15.6 Rollback Procedure

If a client change breaks production after deploy:

```bash
# Option A — Revert the last commit (safest)
git revert HEAD
git push origin main
# Hostinger auto-deploys the reverted version

# Option B — Roll back to a specific commit
git log --oneline  # find the last stable commit hash
git revert <commit-hash>
git push origin main

# Option C — Emergency: force-reset to previous state
# (Only if revert is not possible — this rewrites history)
git reset --hard <last-stable-commit-hash>
git push --force origin main
```

---

### 15.7 Auto-Deploy Verification Checklist

**✅ Done When:**
- [ ] GitHub repository is connected in hPanel → Node.js → Git section
- [ ] Auto-deploy toggle is `ON` for the `main` branch
- [ ] Test push: make a minor change (e.g., a comment), `git push origin main`, verify Hostinger rebuild triggers within 2 minutes
- [ ] `https://yourdomain.com` reflects the change after rebuild completes
- [ ] Build failure (intentional syntax error) does NOT take down the live site — previous version stays up
- [ ] hPanel → Node.js → Deployment Logs show build history with timestamps

---

## 16. Hostinger Business Plan — Zero Extra Cost Stack

**Confidence Level: Confirmed** — This section defines the complete production stack using only what is included in Hostinger Business Web Hosting. No external paid services. No exceptions.

### 16.1 What Hostinger Business Includes (No Extra Cost)

| Feature | Hostinger Business Includes | Used For |
|---|---|---|
| **Node.js Web App** | ✅ Yes | Hosting the Next.js application |
| **MySQL / MariaDB** | ✅ Yes (included) | Primary database (replacing Neon PostgreSQL) |
| **50 GB Disk Storage** | ✅ Yes | File uploads (`public/uploads/`) |
| **Business Email (5 mailboxes)** | ✅ Yes | SMTP for all transactional emails (replacing Resend) |
| **Free SSL (Let's Encrypt)** | ✅ Yes | HTTPS for the domain |
| **Cron Jobs (hPanel)** | ✅ Yes | Fee penalties, reminders, birthday checks, attendance |
| **Git Deployment** | ✅ Yes | Auto-deploy on `git push` (§15) |
| **SSH Access** | ✅ Yes | Running migrations, debugging |
| **Daily Backups** | ✅ Yes (hPanel) | Database + file backup |
| **CDN (Cloudflare Free)** | ✅ $0 extra | Static asset caching — not Hostinger but free |

### 16.2 Services Being Replaced — Cost Eliminated

| Old Service | Monthly Cost | Hostinger Replacement |
|---|---|---|
| Neon PostgreSQL | $0–$19/mo | Hostinger MySQL (included) |
| Resend (email) | $0–$20/mo | Hostinger SMTP (included) |
| Cloudinary (storage) | $0–$89/mo | Hostinger disk `public/uploads/` (included) |
| Upstash Redis | $0–$10/mo | In-memory LRU cache (code — no cost) |
| Vercel (hosting) | $0–$20/mo | Hostinger Node.js (included) |

**Total monthly savings: up to $158/month. Total additional cost: $0.**

---

### 16.3 Strict "Hostinger-Only" Rules for AI Agents

```
❌ Do NOT add Upstash Redis — use lib/cache.ts in-memory LRU (§5.5)
❌ Do NOT add Resend — use nodemailer + Hostinger SMTP (§7, HOSTINGER_DEPLOYMENT §5)
❌ Do NOT add Cloudinary — use local disk at public/uploads/ (HOSTINGER_DEPLOYMENT §6)
❌ Do NOT add Neon, PlanetScale, or any external DB — use Hostinger MySQL (§7)
❌ Do NOT add Vercel Analytics — use Hostinger logs + Sentry free tier
❌ Do NOT add any paid third-party service without explicit client approval
❌ Do NOT suggest "just add Redis" or "Cloudinary is easier" — it violates this constraint

✅ DO use: Hostinger MySQL, Hostinger SMTP, Hostinger disk storage, Hostinger cron jobs
✅ DO use: Cloudflare Free (not paid) for CDN — $0
✅ DO use: Sentry free tier (5,000 errors/month free) for error monitoring
✅ DO use: In-memory solutions (LRU cache, rate limiter) for single-instance Hostinger Node.js
```

---

### 16.4 Nodemailer SMTP Configuration (Hostinger Email)

**File:** `lib/email.ts` — Replace the existing Resend implementation with this:

```typescript
// lib/email.ts
import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,       // smtp.hostinger.com
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: process.env.SMTP_SECURE === 'true', // true for port 465
  auth: {
    user: process.env.SMTP_USER,     // noreply@yourdomain.com
    pass: process.env.SMTP_PASS,     // mailbox password from hPanel
  },
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string; // Plain text fallback
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn('Email not configured — SMTP env vars missing. Email skipped.', {
      to: options.to,
      subject: options.subject,
    });
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,   // "Evershaheen Academy <noreply@yourdomain.com>"
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    logger.info('Email sent', { messageId: info.messageId, to: options.to });
    return true;
  } catch (error) {
    logger.error('Email send failed', error, { to: options.to, subject: options.subject });
    return false; // Graceful degradation — app does not crash on email failure
  }
}
```

**Install dependency:**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

**Remove from `package.json`:**

```bash
npm uninstall resend
```

**✅ Done When:**
- [ ] `POST /api/auth/forgot-password` delivers reset email via Hostinger SMTP
- [ ] Email lands in inbox (not spam — verify SPF/DKIM configured in hPanel DNS)
- [ ] App does not crash when SMTP is misconfigured — logs warning and returns `false`
- [ ] `resend` package is removed from `package.json`

---

### 16.5 Hostinger DNS — SPF, DKIM, DMARC

Required so emails from Hostinger SMTP do not land in spam. Configure in **hPanel → DNS Zone**.

| Record Type | Name | Value |
|---|---|---|
| TXT (SPF) | `@` | `v=spf1 include:_spf.hostinger.com ~all` |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@yourdomain.com` |
| CNAME (DKIM) | (Hostinger provides the name) | (Hostinger provides the value in hPanel → Email → DKIM) |

**After adding records:** Allow 24–48 hours for DNS propagation. Test using [MXToolbox SPF Checker](https://mxtoolbox.com/spf.aspx) — no cost.

---

### 16.6 Final Zero-Cost Stack Diagram

```
                    ┌──────────────────────────────────────┐
                    │        HOSTINGER BUSINESS PLAN       │
                    │         (Single subscription)        │
                    │                                      │
  Users ──HTTPS──▶ │  Node.js 20.x (Next.js 16 SSR)      │
                    │         ↓                            │
                    │  MySQL / MariaDB (included)          │
                    │         ↓                            │
                    │  public/uploads/ disk (50GB)         │
                    │         ↓                            │
                    │  SMTP noreply@yourdomain.com         │
                    │         ↓                            │
                    │  hPanel Cron Jobs (4 jobs)           │
                    │         ↓                            │
                    │  Git Auto-Deploy (GitHub webhook)    │
                    └──────────────────────────────────────┘
                              ↑
                    Cloudflare Free CDN (optional, $0)
                    Sentry Free Tier (error tracking, $0)

                    Total extra monthly cost: $0
```

---

## 17. Updated Priority Matrix (Full)

This extends §8 with the new sections. Execute in order.

| Priority | ID | Task | Effort | Section |
|---|---|---|---|---|
| 🔴 P0-1 | `SEC-01` | CSP + security headers | 2h | §3.1 |
| 🔴 P0-2 | `SEC-02` | Rate limiter wiring | 3h | §3.2 |
| 🔴 P0-3 | `SEC-03` | Session token rotation | 2h | §3.3 |
| 🔴 P0-4 | `SEC-04` | Session expiry + re-auth flow | 4h | §4.2 |
| 🔴 P0-5 | `ERR-01` | Create `lib/errors.ts` + `AppError` class | 2h | §14.2 |
| 🔴 P0-6 | `ERR-02` | Apply `handleApiError()` to all API routes | 4h | §14.3 |
| 🔴 P0-7 | `ERR-03` | Create `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` | 2h | §14.4 |
| 🟠 P1-1 | `PERF-01` | Fix N+1 queries in badge routes | 1 day | §5.1 |
| 🟠 P1-2 | `PERF-02` | Composite DB indexes | 2h | §5.2 |
| 🟠 P1-3 | `UX-01` | Skeleton screens + `loading.tsx` | 1 day | §6.1–6.2 |
| 🟠 P1-4 | `PERF-03` | Dynamic imports | 3h | §5.4 |
| 🟠 P1-5 | `ERR-04` | Client-side `useApiMutation` / `callApi` hook | 2h | §14.5 |
| 🟠 P1-6 | `SEC-05` | Body size limits | 1h | §3.4 |
| 🟠 P1-7 | `SEC-06` | CORS hardening | 2h | §3.5 |
| 🟡 P2-1 | `HOST-01` | MySQL migration + Prisma | 4h | §7, HOSTINGER §4 |
| 🟡 P2-2 | `HOST-02` | Nodemailer SMTP (replace Resend) | 3h | §16.4 |
| 🟡 P2-3 | `HOST-03` | Disk uploads (remove Cloudinary) | 4h | HOSTINGER §6 |
| 🟡 P2-4 | `HOST-04` | Health check endpoint | 1h | §7.2 |
| 🟡 P2-5 | `HOST-05` | Hostinger env vars + Node.js app config | 2h | §7.1 |
| 🟡 P2-6 | `HOST-06` | hPanel cron jobs | 1h | HOSTINGER §10 |
| 🟡 P2-7 | `GIT-01` | Connect GitHub → Hostinger auto-deploy | 1h | §15.2 |
| 🟡 P2-8 | `UX-02` | Navigation progress bar | 1h | §6.3 |
| 🟡 P2-9 | `UX-03` | Error boundaries | 2h | §6.4 |
| 🟢 P3-1 | `PERF-04` | Server Component migration | 3 days | §5.3 |
| 🟢 P3-2 | `PERF-05` | Async report queue | 1 day | §5.6 |
| 🟢 P3-3 | `PERF-06` | Static data caching | 3h | §5.5 |
| 🟢 P3-4 | `SEC-07` | CI dependency scanning | 1h | §3.6 |
| 🟢 P3-5 | `MON-01` | Sentry free tier setup | 2h | §10 |

---

## 18. Document Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-20 | 1.0 | Initial production optimization + security report |
| 2026-06-20 | 1.1 | Added §14 (humanized error handling), §15 (Git auto-deploy), §16 (Hostinger-only stack), §17 (updated priority matrix) |

---

**End of document.**

> For agents: Begin execution at `SEC-01` (§3.1). Error handling tasks `ERR-01` through `ERR-04` are P0 alongside security — complete them before any P1 work. Every `git push origin main` to the connected repository auto-deploys to Hostinger. Update `docs/.CHAT_MEMORY.md` after each completed task. Zero external paid services — Hostinger Business only.
