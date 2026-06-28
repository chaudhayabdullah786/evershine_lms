# EverShine Academy LMS — Project Overview
> **Version**: 3.0.0 | **Last Updated**: 2026-06-27 | **Maintainer**: Ibadat Ali
> **Repo**: https://github.com/chaudhayabdullah786/evershine_lms
> **Branch**: `main` | **Production Host**: Hostinger (evershineacademy.com)
> **Stack**: Next.js 16 (App Router) · TypeScript · Prisma 5 · MySQL · NextAuth v5

---

## 1. Repository Root Structure

```
evershine_lms/
├── app/                    # Next.js App Router — pages, layouts, API routes
│   ├── api/                # 72 API route directories
│   ├── dashboard/          # Protected dashboard routes (32 sub-routes)
│   ├── admissions/         # Public admissions flow
│   ├── login/              # Auth pages
│   ├── offline/            # PWA offline fallback page
│   ├── layout.tsx          # Root layout — PWA metadata, SessionProvider, PWARegister
│   ├── page.tsx            # Landing page (20-section, dynamically loaded)
│   ├── icon.svg            # Next.js app icon
│   └── favicon.ico         # Browser tab favicon
├── components/             # Reusable UI components
│   ├── AcademyLogo.tsx     # Logo renderer — reads /brand/bglogo.png
│   ├── providers/
│   │   └── PWARegister.tsx # Client-side SW registration + online/offline toasts
│   ├── landing/            # 20 landing page section components
│   ├── auth/               # Login, forgot-password components
│   └── ui/                 # shadcn/ui primitives
├── public/                 # Static assets served at root URL
│   ├── manifest.json       # PWA manifest — references /brand/pwa-icon-*.png
│   ├── sw.js               # Service worker (v1.4.0)
│   ├── favicon.svg         # SVG favicon (crest design)
│   ├── favicon.ico         # ICO fallback
│   ├── favicon-16x16.png   # 16px PNG
│   ├── favicon-32x32.png   # 32px PNG
│   ├── favicon-48x48.png   # 48px PNG
│   ├── favicon-128x128.png # 128px PNG
│   ├── apple-touch-icon.png# iOS legacy fallback
│   └── brand/              # Full brand asset library
│       ├── pwa-icon-128.png  # PWA manifest icon (128×128) — from evershinelogo.png
│       ├── pwa-icon-180.png  # Apple Touch Icon (180×180) — from evershinelogo.png
│       ├── pwa-icon-192.png  # PWA manifest icon (192×192, maskable) — from evershinelogo.png
│       ├── pwa-icon-512.png  # PWA manifest icon (512×512, maskable) — from evershinelogo.png
│       └── ...              # Other brand variants (bglogo.png, logo-compact, etc.)
├── prisma/
│   ├── schema.prisma       # Primary MySQL schema (97 KB)
│   └── seed.ts             # DB seed script
├── lib/                    # Shared utilities, auth config, DB client
├── scripts/
│   ├── setup-pwa-icons.js  # Resize evershinelogo.png → PWA PNG sizes (run once)
│   ├── postbuild-sync.js   # Syncs static assets into .next/standalone
│   └── ...
├── docs/
│   └── PROJECT_OVERVIEW.md # ← THIS FILE
├── server.js               # Hostinger production entry point
├── next.config.ts          # Next.js configuration (output: standalone)
├── middleware.ts            # Edge auth guard (NextAuth v5)
├── tailwind.config.ts      # TailwindCSS v4 config
└── package.json            # v3.0.0
```

---

## 2. Dependencies & Versions

### 2.1 Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | ^16.2.6 | Framework (App Router, standalone output) |
| `react` / `react-dom` | ^19.2.4 | UI runtime |
| `next-auth` | ^5.0.0-beta.25 | Authentication (JWT strategy, Edge-compatible) |
| `@auth/prisma-adapter` | ^2.7.0 | NextAuth ↔ Prisma session adapter |
| `@prisma/client` | ^5.22.0 | MySQL ORM client |
| `@node-rs/argon2` | ^1.7.2 | Password hashing (Argon2id) |
| `@tanstack/react-query` | ^5.101.0 | Server state management |
| `@upstash/ratelimit` | ^1.2.1 | API rate limiting |
| `@upstash/redis` | ^1.34.0 | Redis client (Upstash) |
| `cloudinary` | ^2.5.1 | Image hosting/CDN |
| `resend` | ^3.4.0 | Transactional email |
| `framer-motion` | ^11.18.2 | Animations |
| `zod` | ^3.25.76 | Schema validation |
| `zustand` | ^4.5.5 | Client state management |
| `recharts` | ^3.8.1 | Dashboard charts |
| `exceljs` | ^4.4.0 | Excel export |
| `jspdf` | ^4.2.1 | PDF generation |
| `html2canvas` | ^1.4.1 | DOM-to-canvas (report cards) |
| `qrcode` / `qrcode.react` | ^1.5.4 / ^4.2.0 | QR code generation |
| `date-fns` | ^4.1.0 | Date utilities |
| `lucide-react` | ^1.16.0 | Icon library |
| `shadcn` / `radix-ui` | ^4.7.0 / ^1.4.3 | UI component primitives |
| `sonner` | ^2.0.7 | Toast notifications |
| `tailwind-merge` | ^3.6.0 | Tailwind class merging |
| `react-hook-form` | ^7.76.0 | Form management |
| `xlsx` | ^0.18.5 | Excel read/write |
| `browser-image-compression` | ^2.0.2 | Client-side image compression |
| `dotenv` | ^17.4.2 | Env var loading |

### 2.2 Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5 | Type system |
| `tailwindcss` | ^4 | CSS framework |
| `prisma` | ^5.22.0 | ORM CLI + migrations |
| `sharp` | latest | PWA icon resize (run `npm run setup:pwa-icons`) |
| `vitest` | ^4.1.7 | Unit test runner |
| `@playwright/test` | ^1.44.0 | E2E + visual regression tests |
| `eslint` | ^9 | Linter |
| `ts-node` | ^10.9.2 | Script runner |

---

## 3. PWA Implementation

### 3.1 Manifest (`public/manifest.json`)

```json
{
  "name": "EverShine Academy LMS",
  "short_name": "EverShine LMS",
  "display": "standalone",
  "start_url": "/",
  "background_color": "#0f172a",
  "theme_color": "#1d4ed8",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/brand/pwa-icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/brand/pwa-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/brand/pwa-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Active icon files used by manifest** (generated from `evershinelogo.png`):
- `/brand/pwa-icon-128.png` — 128×128 PWA icon
- `/brand/pwa-icon-192.png` — 192×192 PWA icon (**maskable**, Android home screen)
- `/brand/pwa-icon-512.png` — 512×512 PWA icon (**maskable**, splash screen)
- `/brand/pwa-icon-180.png` — 180×180 Apple Touch Icon (iOS home screen)

### 3.2 Service Worker (`public/sw.js` — v1.4.0)

| Route pattern | Strategy | Rationale |
|---|---|---|
| `/_next/*` | **Bypass** | Next.js content-hashed; SW cache causes ChunkLoadError |
| `/brand/`, `/assets/`, images, fonts | **Cache-First** | Static brand assets, safe to cache |
| `/api/*` | **Network-Only** (503 on fail) | Stale LMS data harmful |
| Navigation (HTML) | **Network-First** → `/offline` | Graceful offline fallback |

**Pre-cached on install:** `/offline`, `/favicon.ico`, `/brand/pwa-icon-192.png`, `/brand/pwa-icon-512.png`

### 3.3 Service Worker Registration (`components/providers/PWARegister.tsx`)

- Production-only (skips in dev to prevent Turbopack cache conflicts)
- Shows update toast when new SW version is available
- Handles `online`/`offline` events with user-facing toasts

### 3.4 HTML Metadata (`app/layout.tsx`)

```tsx
manifest: "/manifest.json",
appleWebApp: { capable: true, statusBarStyle: "default", title: "EverShine LMS" },
icons: { apple: "/brand/pwa-icon-180.png" },
other: {
  "mobile-web-app-capable": "yes",          // Android Chrome install prompt
  "apple-mobile-web-app-capable": "yes",    // iOS Safari Add to Home Screen
  "apple-mobile-web-app-title": "EverShine LMS",
  "msapplication-TileColor": "#0f172a",
  "msapplication-TileImage": "/brand/pwa-icon-192.png"
}
```

### 3.5 Icon Generation Script

```bash
node scripts/setup-pwa-icons.js
```

Run once before `npm run build` when deploying with a new logo. Uses `sharp` for
high-quality resize; falls back to full-res copy if sharp is not installed.
Source: `evershinelogo.png` (repo root, 1784×1784px).

---

## 4. Deployment Architecture (Hostinger)

### Build Pipeline

```
npm run setup:pwa-icons   # Generate PWA icons (run once after logo change)
npm run build             # next build (output: "standalone")
node server.js            # Validate env → sync assets → start Next.js
```

### Required Environment Variables

| Variable | Required |
|---|---|
| `DATABASE_URL` (`mysql://` prefix) | ✅ |
| `NEXTAUTH_SECRET` | ✅ |
| `NEXTAUTH_URL` | ✅ |
| `NODE_ENV=production` | ✅ |
| `CLOUDINARY_*`, `RESEND_*`, `UPSTASH_*`, `CRON_SECRET` | Optional |

---

## 5. Active API Route Modules (72 endpoints)

**Academic**: `academic`, `academic-subjects`, `academic-upgrades`, `academic-years`,
`assessments`, `attendance`, `batches`, `calendar`, `class-sections`, `classes`,
`elective-groups`, `enrollment-attendance`, `exams`, `grading-schemes`, `promotions`,
`report-cards`, `results`, `shifts`, `subject-enrollments`, `subject-offerings`, `timetable`

**People**: `students`, `student`, `teachers`, `admins`, `users`, `guardian`,
`guardian-portal`, `student-portal`, `teacher-portal`, `staff-applications`

**Finance**: `fees`, `fee-penalties`, `expenses`, `salaries`, `accountant`

**Admin**: `admin`, `superadmin`, `campuses`, `rooms`, `houses`, `policies`,
`admissions`, `announcements`, `notifications`, `complaints`, `queries`, `feedback`,
`leaves`, `documents`, `certificates`, `exports`, `upload`, `audit-logs`

**System**: `auth`, `health`, `cron`, `qr-codes`, `verify`, `dashboard`, `logo`, `landing`

---

## 6. Authentication & Security

- **Strategy**: JWT (NextAuth v5 beta.25) with Prisma adapter
- **Hashing**: Argon2id (`@node-rs/argon2`)
- **Edge middleware**: Guards `/dashboard/*`, redirects authenticated users away from `/login`
- **RBAC**: admin, teacher, student, guardian, accountant, superadmin
- **Rate limiting**: Upstash Redis-backed (`@upstash/ratelimit`)
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`

---

## 7. Critical Configurations — DO NOT Modify Without Review

> [!CAUTION]
> These files contain production-critical configuration.

| File | Risk if modified |
|---|---|
| `server.js` | Asset sync + env validation; Hostinger startup fails |
| `next.config.ts` | `output: "standalone"` required for Hostinger |
| `middleware.ts` | Auth guard; can expose protected routes or cause redirect loops |
| `prisma/schema.prisma` | 97 KB schema; destructive migrations risk data loss |
| `public/sw.js` | Cache strategy; stale cache causes data/auth issues for PWA users |
| `public/manifest.json` | PWA identity; icon path 404s break home screen installs |
| `app/layout.tsx` | Root providers; must retain SessionProvider + PWARegister |
| `lib/auth.config.ts` | Edge-compatible auth; Node.js imports crash Edge runtime |

---

## 8. Change Log

| Date | Change | Files |
|---|---|---|
| 2026-06-27 | Initial PROJECT_OVERVIEW.md created | This file |
| 2026-06-27 | PWA icon replacement — evershinelogo.png → pwa-icon-*.png | `manifest.json`, `sw.js`, `layout.tsx`, `package.json`, `scripts/setup-pwa-icons.js`, `public/brand/pwa-icon-*.png` |
