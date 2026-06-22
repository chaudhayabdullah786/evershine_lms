# 🎓 Evershine Academy Management System

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-3.0.0-blue)

> **Enterprise-grade Academy Management System** for multi-campus educational institutions — featuring multi-shift academic workflows, institutional finance, attendance tracking, recruitment pipeline, and branded document generation.

---

## 📌 Problem Statement

Educational institutions in Pakistan struggle with fragmented manual systems for managing admissions, academics, attendance, fees, payroll, and reporting. Data silos, paper-based workflows, and lack of real-time visibility lead to operational inefficiencies, delayed decision-making, and poor student outcomes.

**Evershine Academy Management System** solves this by providing:

- ✅ Unified academic workflow (enrollment → attendance → grading → results → reporting)
- ✅ Multi-shift scheduling (Morning 9am–12pm, Evening 3pm–6pm, Night 6pm–9pm)
- ✅ Institutional finance with profit/loss tracking and reserve fund management
- ✅ Multi-role dashboards (SuperAdmin, Admin, Teacher, Accountant, Student, Parent, Guardian)
- ✅ Landing page recruitment pipeline (visitor inquiries, admissions, staff applications)
- ✅ Branded Excel/PDF reporting for administrative transparency
- ✅ Audit-ready compliance and immutable transaction logs

---

## ✨ Key Features

### 🎓 Academic Management

| Feature | Details |
|---------|---------|
| **Multi-Shift Scheduling** | 9am–9pm operating window: Morning, Evening, Night shifts with canonical validation |
| **Student Enrollment & Attendance** | Multi-campus enrollment with daily/period-wise attendance tracking; Excel export |
| **Exam Date Sheets** | Per-section exam scheduling with student-level overrides |
| **Grade Entry & Results** | Teacher-owned result entry with draft/declare workflow; view-only for SuperAdmin |
| **Daily Performance Tracking** | Teacher scoring: attendance %, discipline, homework; aggregate by class |
| **Monthly Comparison** | Side-by-side monthly test results with trend analysis |
| **Target vs Achievement** | Marks targets per student/subject with visual performance gaps |
| **Result Card PDF** | Branded result cards with signature blocks and custom fields |

### 💰 Finance & Accounting

| Feature | Details |
|---------|---------|
| **Fee Management** | Monthly challan generation, payment tracking, proof uploads, automated penalties |
| **Expense Ledger** | Unified ledger of operational expenses + paid salary slips; branded Excel export |
| **Salary Slip Generation** | Monthly salary slips with audit trail, PDF download |
| **Profit/Loss & Reserve Fund** | Monthly P&L snapshots with SuperAdmin 15%/5% allocation; append-only ledger |

### 📋 Recruitment & Leads

| Feature | Details |
|---------|---------|
| **Visitor Inquiry System** | Contact form → database with auto-acknowledgement, admin reply/resolve/spam |
| **Student Admission Pipeline** | Full online admission wizard (6-step) with admin review, branded Excel export |
| **Staff Application Pipeline** | Teacher/Accountant/Admin recruitment with CNIC dedup, 90-day cooldown, atomic provisioning |
| **Branded Excel Reports** | Server-side `.xlsx` with academy branding, zebra striping, status coloring |

### 🏗️ Core Infrastructure

| Component | Details |
|-----------|---------|
| **Multi-Campus Isolation** | Independent Boys/Girls campuses with data segregation |
| **RBAC System** | 7 roles with fine-grained permission matrix |
| **Academic Engine** | AcademicYear → Shift → ClassSection → SubjectOffering → StudentEnrollment |
| **Timetable Management** | Shift-based scheduling with room allocation and teacher assignments |
| **Notification System** | Email notifications via Resend for all status transitions |
| **Audit Logging** | Immutable transaction log for all mutations with JSON delta |
| **Certificate Generation** | Bonafide letters, ID cards, achievement certificates, date sheets |
| **Landing Page** | Conversion-optimized with 20+ sections, WhatsApp widget, dynamic content |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Next.js 16 App Router (React 19) + Tailwind 4 + ShadCN UI │
│  • Role-based dashboards (Admin, Teacher, Student, Parent)  │
│  • TanStack React Query for server state                    │
│  • Framer Motion animations on landing page                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  API LAYER                                                   │
│  Next.js API Routes + Zod Validation + RBAC Middleware       │
│  • 70+ RESTful endpoints                                    │
│  • Input validation at system boundary                      │
│  • Rate limiting (Upstash Redis)                             │
│  • Audit logging on all mutations                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  SERVICE LAYER                                               │
│  Business logic (Prisma + Transactions)                      │
│  • AcademicUpgradesService (results, performance)            │
│  • FinanceService (P&L, reserve fund ledger)                 │
│  • RecruitmentService (staff approval, account provisioning) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  DATA LAYER                                                  │
│  Prisma ORM → PostgreSQL 16+ (Neon Serverless)              │
│  • 90+ models (2,400+ lines schema)                         │
│  • Soft deletes for audit compliance                         │
│  • Connection pooling (PgBouncer)                            │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16, React 19, TypeScript 5 | Full-stack framework with App Router |
| **UI** | Tailwind CSS 4, ShadCN UI | Responsive, accessible components |
| **State** | Zustand (client), React Query (server) | Client + server state management |
| **Animation** | Framer Motion | Landing page transitions and micro-interactions |
| **ORM** | Prisma 5 | Type-safe database access |
| **Database** | PostgreSQL 16+ (Neon) | Relational DB with serverless scaling |
| **Auth** | NextAuth.js v5 + Argon2id | Session-based auth with strong hashing |
| **Validation** | Zod 3.x | Schema validation at all API boundaries |
| **Documents** | jsPDF, ExcelJS | Branded PDF/Excel generation |
| **Email** | Resend | Transactional email notifications |
| **Storage** | Cloudinary | Cloud asset management |
| **Rate Limiting** | Upstash Redis | Serverless rate limiting |
| **Testing** | Vitest, Playwright | Unit + E2E testing |
| **Deployment** | Vercel | Serverless hosting with auto-scaling |

---

## 📊 Data Model (90+ Models)

Seven core domains:

| Domain | Key Models |
|--------|-----------|
| **Identity & Access** | `User`, `Session`, `Account`, `Student`, `Teacher`, `Admin`, `Accountant`, `Parent`, `Guardian` |
| **Academic Structure** | `AcademicYear`, `Shift`, `Campus`, `ClassSection`, `SubjectOffering`, `StudentEnrollment`, `Batch`, `House` |
| **Grading & Results** | `TermResult`, `SubjectResult`, `DailyPerformanceScore`, `AssessmentScore`, `ExamDateSheet` |
| **Finance & Payroll** | `FeeInvoice`, `FeePayment`, `SalarySlip`, `Expense`, `ProfitLossStatement`, `ReserveFundLedger` |
| **Attendance** | `Attendance`, `TeacherAttendance`, `LeaveRequest`, `StudentLeaveRequest` |
| **Recruitment** | `LandingInquiry`, `StaffApplicationRequest`, `AdmissionRequest` |
| **Communication** | `Announcement`, `CalendarEvent`, `Notification`, `Certificate`, `MonthlyMonitoringReport` |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ (LTS)
- **npm** 10+
- **PostgreSQL** 16+ (or [Neon](https://neon.tech) serverless)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Ibadat-Ali86/evershine_lms.git
cd evershine_lms

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, NEXTAUTH_SECRET, etc.

# 4. Generate Prisma Client and apply schema
npx prisma generate
npx prisma db push

# 5. Seed initial data
npm run db:seed

# 6. Bootstrap Academic Engine (shifts, sections, enrollments)
npm run db:setup:academic

# 7. Start development server
npm run dev
# Open http://localhost:5000
```

### Available Commands

```bash
# Development
npm run dev                  # Start dev server (port 5000)
npm run build                # Production build
npm run start                # Run production server
npm run lint                 # ESLint checks

# Database
npm run db:generate          # Generate Prisma Client
npm run db:migrate           # Run migrations
npm run db:push              # Push schema changes
npm run db:seed              # Seed sample data
npm run db:setup:academic    # Bootstrap academic engine
npm run db:studio            # Open Prisma Studio GUI

# Testing
npm run test                 # Run Vitest unit tests
npm run test:academic        # Run academic engine tests
npm run test:visual          # Run Playwright E2E tests
```

---

## 📁 Project Structure

```
evershine-academy/
├── app/                        # Next.js App Router
│   ├── api/                    # 70+ RESTful API endpoints
│   │   ├── academic-upgrades/  # Results, performance, date sheets
│   │   ├── teacher-portal/     # Teacher-scoped APIs
│   │   ├── student-portal/     # Student published results
│   │   ├── accountant/         # Finance: salary, P&L, expenses
│   │   ├── landing/            # Visitor inquiry APIs
│   │   ├── staff-applications/ # Staff recruitment pipeline
│   │   ├── admissions/         # Student admission APIs
│   │   ├── cron/               # Scheduled jobs (fee penalties, reminders)
│   │   └── ...
│   ├── dashboard/              # Role-based dashboard pages
│   ├── admissions/apply/       # Public 6-step admission wizard
│   └── page.tsx                # Landing page entry
│
├── components/                 # React components
│   ├── ui/                     # ShadCN UI primitives
│   ├── landing/                # 20+ landing page sections
│   ├── academic/               # Academic-specific components
│   └── layout/                 # Sidebar, navbar wrappers
│
├── lib/                        # Business logic & utilities
│   ├── services/               # Service layer
│   ├── excel/                  # Branded Excel export builders
│   ├── pdf/                    # PDF generation (result cards, certificates)
│   ├── validation/             # Zod schemas + shift constants
│   ├── notifications.ts        # Email templates (Resend)
│   └── rbac.ts                 # Role-based access control
│
├── prisma/
│   └── schema.prisma           # 90+ models, 2400+ lines
│
├── content/
│   └── site-config.ts          # Landing page content (config-first)
│
├── designs/                    # Academy-branded PDF templates
├── scripts/                    # DB seeding & migration scripts
├── tests/                      # Vitest + Playwright tests
├── public/                     # Static assets & images
├── docs/                       # API, schema, deployment docs
│
├── .env.example                # Environment variable template
├── package.json                # Dependencies & scripts
├── next.config.ts              # Next.js configuration
├── vercel.json                 # Cron job schedules
├── CONTRIBUTING.md             # Contribution guidelines
├── INSTALLATION.md             # Detailed setup guide
└── LICENSE                     # MIT License
```

---

## 🔐 Security Posture

### ✅ What's Implemented

| Control | Implementation | Status |
|---------|---------------|--------|
| **Password Hashing** | Argon2id via `@node-rs/argon2` (memoryCost: 65536, timeCost: 3) | ✅ Strong |
| **Authentication** | NextAuth.js v5 with CSRF protection | ✅ Production-ready |
| **Input Validation** | Zod schemas on all 70+ API routes; reject-by-default | ✅ Comprehensive |
| **Authorization** | RBAC at route + data layer; campus-scoped isolation | ✅ Enforced |
| **SQL Injection** | Parameterized queries via Prisma ORM — zero raw SQL | ✅ Eliminated |
| **Audit Logging** | Immutable `AuditLog` table: user, action, before/after, timestamp | ✅ Complete |
| **ACID Transactions** | Prisma `$transaction` for fee, payroll, and staff provisioning | ✅ Atomic |
| **CNIC Protection** | Staff CNIC masked in list views; full value only in detail | ✅ Implemented |
| **File Uploads** | Cloudinary signed URLs; client-side compression | ✅ Secure |

### ⚠️ Known Security Gaps (Production Hardening Needed)

| Gap | Risk | Recommended Fix |
|-----|------|----------------|
| **No CSP Headers** | XSS amplification | Add `Content-Security-Policy` in `next.config.ts` headers |
| **Rate Limiter Wiring** | Brute-force login | Wire `lib/rate-limit.ts` into auth + public POST routes |
| **No Request Size Limits** | DoS via large payloads | Add `bodyParser: { sizeLimit: '1mb' }` to API routes |
| **Session Token Rotation** | Session fixation | Enable refresh token rotation in NextAuth config |
| **CORS Configuration** | Cross-origin attacks | Restrict `allowedDevOrigins` to production domains only |
| **Dependency Scanning** | Supply chain vulnerabilities | Add `npm audit` to CI pipeline; enable Dependabot |

### OWASP Top 10 Coverage

| OWASP Category | Coverage |
|---------------|----------|
| A01 — Broken Access Control | ✅ RBAC + campus isolation |
| A02 — Cryptographic Failures | ✅ Argon2id + TLS |
| A03 — Injection | ✅ Prisma ORM (parameterized) |
| A04 — Insecure Design | ⚠️ Partial (no threat model documented) |
| A05 — Security Misconfiguration | ⚠️ Missing CSP, CORS hardening |
| A06 — Vulnerable Components | ⚠️ No automated dependency scanning |
| A07 — Auth Failures | ✅ NextAuth + Argon2id |
| A08 — Data Integrity | ✅ Audit logs + transactions |
| A09 — Logging & Monitoring | ⚠️ No centralized logging (stdout only) |
| A10 — SSRF | ✅ No outbound user-controlled requests |

---

## ⚡ Performance Analysis & Known Bottlenecks

### Why the System Can Feel Slow

| Bottleneck | Cause | Impact |
|-----------|-------|--------|
| **Client-Side Rendering** | All dashboard pages use `'use client'` with `useEffect` + `fetch` | Extra round-trip; no SSR benefit; visible loading spinners |
| **N+1 Query Patterns** | Some API routes fetch related data in loops instead of joins | Database round-trips scale linearly with data size |
| **No Server-Side Caching** | Every API call hits PostgreSQL directly | Redundant queries for static data (campuses, shifts, academic year) |
| **Large JavaScript Bundle** | ShadCN + Framer Motion + Recharts loaded eagerly | ~800KB+ initial JS payload; slow first load on 3G/4G |
| **Unoptimized Images** | Landing page images served as raw PNG/JPEG (1-2MB each) | Slow page load; high bandwidth consumption |
| **No Database Connection Pooling Config** | Default Prisma connection settings | Connection exhaustion under concurrent load |
| **ExcelJS Server-Side Generation** | Large reports generated synchronously in API routes | Blocks event loop; timeouts on 500+ row exports |

### Database Query Patterns Needing Optimization

```
# ISSUE: These patterns exist in multiple API routes:

1. Fetching all students → then looping to get each student's attendance
   FIX: Use Prisma `include` with `select` for single-query joins

2. Dashboard badge counts make 6+ separate COUNT queries
   FIX: Combine into a single raw SQL with CASE-WHEN aggregation

3. Monthly report generation loads full student + result trees
   FIX: Add database views or materialized queries for reporting
```

---

## 🔧 Optimization Roadmap

### Priority 1 — Quick Wins (1-2 days each)

| Optimization | Expected Impact |
|-------------|----------------|
| **Next.js Image Optimization** | Use `<Image>` component with WebP auto-conversion; 60-80% size reduction |
| **Dynamic Imports** | Lazy-load Recharts, Framer Motion, ExcelJS; reduce initial bundle by ~300KB |
| **API Response Caching** | Cache static data (campuses, shifts, subjects) with `Cache-Control` headers |
| **Prisma `select` Optimization** | Replace `include: { ... }` with explicit `select` to fetch only needed fields |

### Priority 2 — Medium Effort (1 week each)

| Optimization | Expected Impact |
|-------------|----------------|
| **Server Components Migration** | Convert read-only dashboard pages to RSC; eliminate client-side fetch waterfalls |
| **Redis Caching Layer** | Cache frequently-read data (academic year, user profiles) with TTL invalidation |
| **Database Indexing Audit** | Add composite indexes for common query patterns (status + campus + date) |
| **Report Queue** | Move Excel/PDF generation to background jobs; return download link |

### Priority 3 — Architectural (2-4 weeks)

| Optimization | Expected Impact |
|-------------|----------------|
| **ISR for Landing Page** | Incremental Static Regeneration; serve landing page from CDN edge |
| **Database Read Replicas** | Route read-heavy reporting queries to replica; reduce primary load |
| **WebSocket Notifications** | Replace polling-based notification checks with real-time push |
| **Edge Middleware Caching** | Cache auth session verification at Vercel edge |

---

## 📈 Scalability Strategy

### Current Capacity

| Metric | Current Estimate | Bottleneck |
|--------|-----------------|------------|
| **Concurrent Users** | ~50-100 | Serverless cold starts + DB connections |
| **Database Size** | <1GB | Well within Neon free tier |
| **API Throughput** | ~100 req/sec | Single Prisma client instance |
| **File Storage** | <500MB | Cloudinary free tier limit |

### Scaling Path

```
Phase 1: Vertical (Current → 500 users)
├── Enable Prisma connection pooling (PgBouncer)
├── Add Redis cache for session + static data
├── Optimize top 10 slowest API routes
└── Enable Vercel Edge Functions for auth

Phase 2: Horizontal (500 → 5,000 users)
├── Database read replicas for reporting
├── Background job queue (BullMQ or Inngest)
├── CDN for static assets (Cloudflare)
└── Multi-region deployment

Phase 3: Multi-Tenant (5,000+ users)
├── Schema-per-tenant or row-level security
├── Dedicated database per institution
├── API gateway with tenant routing
└── Observability stack (OpenTelemetry)
```

### Multi-Campus Architecture

The system already supports multi-campus isolation (`Boys Campus`, `Girls Campus`). Extending to a true multi-tenant SaaS would require:

1. **Tenant Identifier** — Add `tenantId` to all models; enforce at query layer
2. **Subdomain Routing** — `school-a.evershine.app`, `school-b.evershine.app`
3. **Isolated Database** — Separate Neon branches or schemas per tenant
4. **Billing** — Per-tenant usage tracking and subscription management

---

## 🏭 Production Readiness Checklist

### ✅ Production-Ready

- [x] Authentication & authorization (NextAuth + RBAC)
- [x] Input validation on all API routes (Zod)
- [x] Audit logging for all mutations
- [x] Atomic transactions for financial operations
- [x] Strong password hashing (Argon2id)
- [x] Multi-campus data isolation
- [x] Branded document generation (PDF/Excel)
- [x] Automated cron jobs (fee penalties, reminders, attendance)
- [x] Landing page with conversion-optimized CTAs
- [x] Multi-shift academic scheduling (9am–9pm)

### ⚠️ Needs Work Before Production

- [ ] **Monitoring** — No APM, error tracking, or centralized logging (add Sentry + Vercel Analytics)
- [ ] **Health Checks** — No `/api/health` endpoint for load balancer probes
- [ ] **Rate Limiting** — Module exists but not wired into routes
- [ ] **CSP Headers** — Not configured (XSS mitigation)
- [ ] **Backup Strategy** — No automated database backup schedule documented
- [ ] **Load Testing** — No performance baseline established
- [ ] **Dependency Scanning** — No automated CVE checks in CI
- [ ] **Error Boundaries** — Missing React error boundaries on dashboard pages
- [ ] **Accessibility** — Landing page has skip navigation; dashboards need WCAG audit

---

## 👥 Role-Based Access Control

| Role | Key Permissions | Dashboard |
|------|----------------|-----------|
| **SUPER_ADMIN** | System config, user management, reserve fund ledger (view-only grades) | System admin, audit logs |
| **ADMIN** | Campus-scoped user creation, approvals, expense review, leads | Campus dashboard, staff mgmt |
| **TEACHER** | Attendance marking, grade entry, leave requests, feedback | Teacher portal: HR, grades |
| **ACCOUNTANT** | Salary slips, expense recording, P&L snapshots, fee proofs | Finance dashboard |
| **STUDENT** | View own records, pay fees, submit feedback, access results | Student portal |
| **PARENT / GUARDIAN** | View child's records, pay fees | Parent portal |

---

## 🚢 Deployment

### Vercel (Primary — Recommended)

```bash
# 1. Connect GitHub repo to Vercel
# 2. Set environment variables in Vercel dashboard:
#    DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
#    RESEND_API_KEY, CLOUDINARY_*, UPSTASH_*, CRON_SECRET

# 3. Auto-deploys on push to main
git push origin main
```

### Self-Hosted (Hostinger — Alternative)

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) for the complete migration guide (MySQL conversion, SMTP setup, disk storage).

### Cron Jobs (Vercel)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/cron/fee-penalties` | Daily 2:00 AM | Apply late fee penalties |
| `/api/cron/teacher-attendance` | Hourly | Process teacher check-ins |
| `/api/cron/fee-reminder` | Daily 9:00 AM | Send fee payment reminders |
| `/api/cron/birthday-check` | Daily 8:00 AM | Send birthday notifications |

---

## 🔗 External Services

| Service | Purpose | Required |
|---------|---------|----------|
| **Neon PostgreSQL** | Database hosting | Yes |
| **Cloudinary** | File/image storage | Yes (for uploads) |
| **Resend** | Transactional email | Yes (for notifications) |
| **Upstash Redis** | Rate limiting | Optional |
| **Vercel** | Hosting & deployment | Recommended |

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [API Documentation](docs/API_DOCUMENTATION.md) | 70+ endpoint reference with auth requirements |
| [Database Schema](docs/DATABASE_SCHEMA.md) | Core entity definitions and relationships |
| [Notification System](docs/NOTIFICATION_SYSTEM.md) | Email notification architecture |
| [Hostinger Deployment](docs/HOSTINGER_DEPLOYMENT.md) | Alternative self-hosted deployment guide |
| [Project Structure](docs/PROJECT_STRUCTURE.md) | Architecture and directory reference |
| [Installation Guide](INSTALLATION.md) | Step-by-step setup instructions |
| [Contributing](CONTRIBUTING.md) | Contribution guidelines and PR process |

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git checkout -b feat/your-feature
# make changes
npm run test && npm run lint
git commit -m "feat: add [feature] for [reason]"
git push origin feat/your-feature
# Open a Pull Request
```

---

## 📜 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org) & [Vercel](https://vercel.com) — Framework & hosting
- [Prisma](https://prisma.io) — Database ORM
- [NextAuth.js](https://next-auth.js.org) — Authentication
- [ShadCN UI](https://ui.shadcn.com) — Component library
- [Tailwind CSS](https://tailwindcss.com) — Styling
- [TanStack React Query](https://tanstack.com/query) — Data fetching
- [ExcelJS](https://github.com/exceljs/exceljs) — Branded Excel generation
- [Resend](https://resend.com) — Email delivery

---

> **Version:** 3.0.0 — Multi-Shift Academic Engine Release
> **Last Updated:** June 2026
> **Author:** [Ibadat Ali](https://github.com/Ibadat-Ali86)