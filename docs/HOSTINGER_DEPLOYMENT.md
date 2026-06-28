# Hostinger Deployment Guide — Optimized Single-Vendor Stack

**Document ID:** `HOSTINGER_DEPLOYMENT`  
**Project:** Evershaheen Academy Management System (LMS)  
**Audience:** Human operators, DevOps, and AI coding agents  
**Last updated:** 2026-05-24  
**Status:** Planning / pre-migration (execute after local testing is complete)

---

## 0. Agent execution contract

> **For AI agents:** Read this entire document before changing infrastructure code. Follow phases in order. Do not skip verification steps. Do not commit secrets. Cross-check [`docs/.SYSTEM_INSTRUCTIONS.md`](./.SYSTEM_INSTRUCTIONS.md) and [`docs/ACADEMIC_SMOKE_TEST.md`](./ACADEMIC_SMOKE_TEST.md) before marking deployment complete.

| Rule | Detail |
|------|--------|
| **When to run** | After the application passes local/staging tests on the target branch — not mid-feature. |
| **Scope** | Infrastructure + env + optional refactors listed in §8 — not unrelated features. |
| **Secrets** | Never commit `.env`, SMTP passwords, or `CRON_SECRET` to Git. |
| **Database** | PostgreSQL migrations in `prisma/migrations/` are **not** portable to MySQL. Generate a **new** MySQL migration history. |
| **Rollback** | Keep Vercel + Neon available until Hostinger smoke tests pass (§11). |

**Agent task index**

| ID | Phase | Summary |
|----|-------|---------|
| `HOST-01` | §4 | Switch Prisma to MySQL; regenerate migrations |
| `HOST-02` | §5 | Replace Resend with Hostinger SMTP (`nodemailer`) |
| `HOST-03` | §6 | Consolidate file uploads on disk; remove Cloudinary dependency |
| `HOST-04` | §7 | Remove unused Upstash rate-limit wiring (or implement in-memory limiter) |
| `HOST-05` | §9 | Configure Hostinger Node.js app + env vars |
| `HOST-06` | §10 | Configure hPanel cron jobs |
| `HOST-07` | §12 | Run production smoke tests |

---

## 1. Executive summary

### Current stack (typical)

| Layer | Service | Cost model |
|-------|---------|------------|
| App hosting | Vercel | Free / Pro |
| Database | Neon PostgreSQL | Free tier or paid |
| Images | Cloudinary | Free tier (optional) |
| Email | Resend | Free tier (optional) |
| Rate limit | Upstash Redis | Free tier (**not wired in routes today**) |
| Cron | `vercel.json` | Included on Vercel |

### Target stack (optimized — Hostinger Business)

| Layer | Service | Notes |
|-------|---------|--------|
| App hosting | **Hostinger Node.js Web App** | Business plan; Next.js SSR + API routes |
| Database | **Hostinger MySQL / MariaDB** | Included; Prisma `provider = "mysql"` |
| Images & files | **Server disk** (`public/uploads/`) | Uses plan storage (50 GB on Business) |
| Email | **Hostinger Business SMTP** | 5 mailboxes included; `nodemailer` |
| Rate limit | **None or in-memory** | Upstash optional; not required at current scale |
| Cron | **hPanel Cron** → `curl` API routes | Replaces `vercel.json` crons |
| CDN / DDoS (optional) | **Cloudflare Free** | Recommended; $0 extra vendor |

**Goal:** One primary bill (Hostinger) + zero mandatory SaaS subscriptions for core LMS operation.

---

## 2. Architecture comparison

```mermaid
flowchart LR
  subgraph before [Current - Vercel Stack]
    U1[Users] --> V[Vercel Edge]
    V --> N[Neon PostgreSQL]
    V --> C[Cloudinary]
    V --> R[Resend]
    V --> U[Upstash Redis]
    VC[Vercel Cron] --> V
  end

  subgraph after [Target - Hostinger Stack]
    U2[Users] --> H[Hostinger Node.js]
    H --> M[(MySQL)]
    H --> D[public/uploads]
    H --> S[SMTP Hostinger]
    CR[hPanel Cron curl] --> H
  end
```

---

## 3. Prerequisites

### 3.1 Hostinger plan requirements

Confirm the account has **Business Web Hosting** (or higher) with:

- [ ] **Node.js Web App** deployment (not PHP-only static upload)
- [ ] **MySQL database** creation in hPanel
- [ ] **Cron Jobs** in hPanel
- [ ] **Free SSL** + domain connected
- [ ] **Business email** mailbox (e.g. `noreply@yourdomain.com`)

Official references (verify current limits on Hostinger docs):

- [Deploy Node.js on Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Connect MySQL to Node.js](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

Supported Node.js versions on Hostinger: **18.x, 20.x, 22.x, 24.x** — use **20.x** for this project (Next.js 16 + Prisma 5).

### 3.2 Repository readiness

- [ ] All features tested locally (`npm run dev`, `npm run build`, `npm run start`)
- [ ] Academic smoke checklist drafted: [`docs/ACADEMIC_SMOKE_TEST.md`](./ACADEMIC_SMOKE_TEST.md)
- [ ] GitHub repo accessible for Hostinger Git deploy (recommended)
- [ ] Production secrets generated offline (see §9.2)

### 3.3 What you are *not* deploying

| Do not use on Hostinger | Why |
|-------------------------|-----|
| Static export-only (`next export`) | App needs API routes, Auth.js, Prisma |
| Upload only `out/` folder | Same reason |
| Existing `prisma/migrations/*.sql` as-is | Written for PostgreSQL |

---

## 4. Database migration (`HOST-01`)

### 4.1 Prisma datasource change

**File:** `prisma/schema.prisma`

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
  // REMOVE directUrl — Neon/PgBouncer only
}
```

**Remove from `.env`:** `DIRECT_URL`

**Set `DATABASE_URL` (Hostinger example):**

```env
DATABASE_URL="mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME"
```

> Hostinger Node.js apps often use `localhost` for the MySQL host when DB and app are on the same account. Use exact values from hPanel → Databases.

### 4.2 Migration history strategy

| Scenario | Action |
|----------|--------|
| **New production (no live users)** | Archive `prisma/migrations/` (backup), create fresh MySQL migrations |
| **Existing Neon data** | Requires custom ETL (out of scope for greenfield guide); contact operator before cutover |

**Greenfield commands (local, against dev MySQL/MariaDB):**

```bash
# 1. Backup old migrations (optional)
mv prisma/migrations prisma/migrations.postgresql.backup

# 2. Create fresh migration
npx prisma migrate dev --name init_mysql

# 3. Generate client
npx prisma generate

# 4. Seed (adjust order per your ops)
npm run db:seed
npm run db:setup:academic
```

**Production (once per environment):**

```bash
npx prisma migrate deploy
```

Alternative for first deploy only (not ideal long-term): `npx prisma db push`

### 4.3 Schema portability notes

This project's Prisma schema is largely MySQL-compatible:

- String IDs with `@default(cuid())` — OK
- `Json` fields — OK on MySQL
- `Decimal`, `@db.Date` — OK
- Enums — Prisma maps to MySQL enums

No application-wide raw PostgreSQL SQL was detected; Prisma Client covers data access.

### 4.4 Verification (`HOST-01`)

- [ ] `npx prisma validate` succeeds
- [ ] `npm run build` succeeds
- [ ] Login works against MySQL locally
- [ ] `npx prisma studio` shows expected tables

---

## 5. Email — Resend → Hostinger SMTP (`HOST-02`)

### 5.1 Current behavior

- **Module:** `lib/email.ts` uses **Resend**
- **Callers:** password reset, teacher welcome, announcements, fee/birthday crons, `lib/notifications.ts`
- **Graceful degradation:** If `RESEND_API_KEY` is missing, emails log a warning and return `false` — app does not crash

### 5.2 Target behavior

Replace Resend with **nodemailer** + Hostinger SMTP.

**hPanel → Emails →** create mailbox: `noreply@yourdomain.com`

**Typical SMTP settings (confirm in hPanel):**

| Variable | Example |
|----------|---------|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` (SSL) or `587` (TLS) |
| `SMTP_USER` | `noreply@yourdomain.com` |
| `SMTP_PASS` | mailbox password |
| `SMTP_FROM` | `"Evershaheen Academy <noreply@yourdomain.com>"` |

### 5.3 Agent implementation checklist

- [ ] Add `nodemailer` + `@types/nodemailer` to `package.json`
- [ ] Refactor `lib/email.ts` to use SMTP env vars
- [ ] Update `.env.example` — remove `RESEND_*`, add `SMTP_*`
- [ ] Remove `resend` package if unused elsewhere
- [ ] Configure **SPF, DKIM, DMARC** in Hostinger DNS for the domain
- [ ] Send test: password reset + one cron email path

### 5.4 Verification (`HOST-02`)

- [ ] Test email arrives in inbox (not spam)
- [ ] `POST /api/auth/forgot-password` delivers reset link
- [ ] Teacher create sends welcome mail (if enabled in flow)

---

## 6. File storage — Cloudinary → disk (`HOST-03`)

### 6.1 Current behavior

| Path | Storage |
|------|---------|
| Online admissions photo | `public/uploads/admissions/` (already local) |
| Teacher/student profile (many flows) | Base64 or URL string in DB |
| `GET /api/upload` | Cloudinary signed upload (**minimal UI usage**) |

Cloudinary was primarily justified for **Vercel 4.5 MB body limits** — not a hard requirement on Hostinger Node.js.

### 6.2 Target layout

```text
public/uploads/
├── admissions/     # existing
├── students/       # new — profile photos
├── teachers/       # new — profile photos
├── fee-proofs/     # new — payment screenshots (if not URL-only)
└── documents/      # optional — generated PDF archives
```

**Rules:**

1. Never commit uploaded files to Git — add to `.gitignore` if needed:
   ```gitignore
   /public/uploads/**
   !/public/uploads/.gitkeep
   ```
2. Create `.gitkeep` in each folder so structure exists on deploy
3. Store **public URL path** in DB (e.g. `/uploads/students/abc.jpg`), not base64 for new records (reduces DB size)
4. Resize/compress on upload (existing teacher form already resizes to 400×400 client-side — reuse pattern server-side for API uploads)

### 6.3 Agent implementation checklist

- [ ] Add shared upload helper (e.g. `lib/uploads.ts`) — validate MIME, max size, sanitize filename
- [ ] Add `POST /api/uploads/[type]` or extend existing admission pattern
- [ ] Migrate teacher/student forms from base64-in-DB to file path (optional phased)
- [ ] Remove or deprecate `lib/cloudinary.ts`, `app/api/upload/route.ts`
- [ ] Remove `cloudinary` from `package.json` when unused
- [ ] Document backup: **DB dump + `public/uploads/` tarball** on schedule

### 6.4 Verification (`HOST-03`)

- [ ] Admission photo displays after deploy
- [ ] New teacher photo persists across restart
- [ ] ID card / report PDF generation still works (client-side `html2canvas` + `jsPDF` unchanged)

---

## 7. Rate limiting — Upstash optional (`HOST-04`)

### 7.1 Current state

- `lib/rate-limit.ts` exists (Upstash sliding window)
- **No route imports it** — safe to omit Upstash entirely on Hostinger

### 7.2 Options (pick one)

| Option | Effort | When |
|--------|--------|------|
| **A. None** | Zero | Single-school deployment, trusted network |
| **B. In-memory** | Low | Single Node instance; resets on restart |
| **C. MySQL table** | Medium | Persistent limits without Redis |

**Do not** add Upstash on Hostinger unless you explicitly want a second vendor.

### 7.3 Verification (`HOST-04`)

- [ ] Login and write APIs work without `UPSTASH_*` env vars
- [ ] If limiter added: brute-force login test returns 429 after threshold

---

## 8. Code & dependency change summary

Execute after testing branch is stable. Order matters.

| Step | Files / packages | Action |
|------|------------------|--------|
| 1 | `prisma/schema.prisma` | `provider = "mysql"`, remove `directUrl` |
| 2 | `prisma/migrations/` | New MySQL history (§4.2) |
| 3 | `package.json` | Add `"engines": { "node": ">=20 <23" }` |
| 4 | `lib/email.ts`, `.env.example` | SMTP / nodemailer |
| 5 | Upload helpers + API | Disk storage (§6) |
| 6 | `lib/cloudinary.ts`, `app/api/upload/route.ts` | Remove or deprecate |
| 7 | `package.json` | Remove `cloudinary`, `@upstash/*`, `resend` when unused |
| 8 | `vercel.json` | Keep in repo for reference; **ignored on Hostinger** — document crons in §10 |
| 9 | `README.md` | Point deployment section to this doc |

**Keep (no Hostinger replacement required):**

- In-app **notifications** (database) — independent of email
- Client-side **PDF** generation — no server PDF farm needed
- **Argon2** password hashing — unchanged

---

## 9. Hostinger deployment (`HOST-05`)

### 9.1 Create MySQL database (hPanel)

1. hPanel → **Databases** → **MySQL Databases**
2. Create database + user + strong password
3. Grant user **ALL PRIVILEGES** on that database
4. Note: host, port, database name, username, password

### 9.2 Environment variables (production)

Set in **hPanel → Node.js Web App → Environment variables**:

```env
# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL="mysql://USER:PASS@localhost:3306/DBNAME"

# ── Auth ──────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET="<openssl rand -hex 32>"
NEXTAUTH_URL="https://evershineacademy.com"

# ── App ─────────────────────────────────────────────────────────────────
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://evershineacademy.com"
NEXT_PUBLIC_APP_NAME="Evershaheen Academy LMS"
NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY="true"

# ── Cron security ─────────────────────────────────────────────────────────
CRON_SECRET="<openssl rand -hex 32>"

# ── Email (Hostinger SMTP) ────────────────────────────────────────────────
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="noreply@evershineacademy.com"
SMTP_PASS="<mailbox-password>"
SMTP_FROM="Evershaheen Academy <noreply@evershineacademy.com>"

# ── Optional: legacy flags ───────────────────────────────────────────────
# LEGACY_API_ENABLED="false"
# ACADEMIC_SEED_DEMO="false"
```

**Do not set on Hostinger (optimized stack):**

```env
# REMOVE — not used
DIRECT_URL=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 9.3 Node.js Web App setup

| Setting | Value |
|---------|--------|
| Source | GitHub repository (recommended) or ZIP |
| Framework | Next.js (auto-detect) |
| Node version | **20.x** |
| Install command | `npm ci` or `npm install` |
| Build command | `npm run build` |
| Start command | `npm run start` |
| Root directory | `/` (repo root) |
| Auto-deploy branch | `main` |
| Public domain | `evershineacademy.com` and `www.evershineacademy.com` |

`postinstall` already runs `prisma generate` — required for build.

Before declaring a deploy successful, verify the domain is serving this Node.js app, not a parked/default Hostinger document root:

```bash
curl -fsS https://evershineacademy.com/api/version
curl -fsS https://evershineacademy.com/api/health
```

Both endpoints must return JSON from this repository. A Hostinger `403 Forbidden`, `/lander` redirect, parked page, or non-JSON response means DNS/app binding is wrong even if the GitHub deploy hook fired.

### 9.4 First-time database on server

Before running migrations against Hostinger MySQL, check migration provider consistency:

```bash
npx prisma validate
npx prisma migrate status
```

This project was migrated from PostgreSQL to MySQL. If `prisma/migrations/migration_lock.toml` still reports `provider = "postgresql"`, do **not** blindly run `prisma migrate deploy` against production MySQL. Choose one of these paths first:

| Production data state | Required action |
|---|---|
| Fresh/disposable DB | Regenerate a clean MySQL migration baseline, then run `npx prisma migrate deploy` and seed. |
| Live DB with real records | Back up MySQL, introspect the current schema, create a reviewed forward-only MySQL migration for missing columns/tables/indexes, then mark the baseline deliberately. |

After the MySQL migration history is correct, run **once** (SSH, Hostinger terminal, or local machine with remote DB access if allowed):

```bash
npx prisma migrate deploy
npm run db:seed          # only if fresh DB
npm run db:setup:academic  # academic engine + optional demo
```

Create initial admin via seed or existing admin creation flow.

### 9.5 Domain & SSL

1. Point domain A record to Hostinger
2. Enable **SSL** (Let's Encrypt) in hPanel
3. Ensure `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` use `https://`

### 9.6 Optional: Cloudflare (free)

1. Add site to Cloudflare
2. Proxy DNS through Cloudflare
3. SSL mode: **Full (strict)**
4. Cache static assets; do not cache `/api/*` by default

### 9.7 Verification (`HOST-05`)

- [ ] `https://yourdomain.com` loads login page
- [ ] `npx prisma generate` ran during build (no `prisma.* undefined` errors)
- [ ] Admin login succeeds
- [ ] API health: academic bootstrap or campuses list returns 200

---

## 10. Cron jobs — Vercel → hPanel (`HOST-06`)

`vercel.json` crons **do not run** on Hostinger. Replace with hPanel **Cron Jobs** → type **Custom**.

**Auth:** All cron routes expect:

```http
Authorization: Bearer <CRON_SECRET>
```

### 10.1 Cron schedule matrix

| Job | Path | Vercel schedule | Suggested hPanel cron (UTC) | Command |
|-----|------|-----------------|-----------------------------|---------|
| Fee penalties | `/api/cron/fee-penalties` | `0 2 * * *` | Daily 02:00 | See below |
| Teacher attendance | `/api/cron/teacher-attendance` | `0 * * * *` | Every hour `:00` | See below |
| Fee reminder | `/api/cron/fee-reminder` | `0 9 * * *` | Daily 09:00 | See below |
| Birthday check | `/api/cron/birthday-check` | `0 8 * * *` | Daily 08:00 | See below |

**Example command (replace domain and secret):**

```bash
curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" "https://yourdomain.com/api/cron/fee-penalties"
```

Create **four separate** cron entries in hPanel.

> **Timezone:** hPanel may use server local time. Adjust schedules to match campus expectations (Pakistan: PKT = UTC+5).

### 10.2 Manual cron test (before relying on schedule)

```bash
export CRON_SECRET="your-secret"
export APP="https://yourdomain.com"

curl -sS -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/fee-penalties" | jq .
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/teacher-attendance" | jq .
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/fee-reminder" | jq .
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/birthday-check" | jq .
```

Expected: HTTP 200 JSON (not 401).

### 10.3 Verification (`HOST-06`)

- [ ] Unauthorized request without header returns **401**
- [ ] Authorized curl returns **200**
- [ ] hPanel cron logs show success after 24h

---

## 11. Cutover procedure

### 11.1 Recommended timeline

| Day | Activity |
|-----|----------|
| D-7 | Complete `HOST-01`–`HOST-04` on `hostinger-prep` branch; test locally with MariaDB |
| D-3 | Deploy to Hostinger staging subdomain; run §12 smoke tests |
| D-1 | DNS TTL lowered; final data sync if migrating from Neon |
| D0 | Switch DNS to Hostinger; monitor errors |
| D+1 | Disable Vercel production; keep Neon read-only backup 7–30 days |

### 11.2 Data cutover scenarios

**A — Fresh school launch (no production data on Neon)**

1. Deploy to Hostinger
2. `prisma migrate deploy` + seed
3. Admin creates campuses, users, academic bootstrap
4. No Neon export needed

**B — Existing production on Vercel + Neon**

1. Freeze writes (maintenance banner)
2. Export Neon data (pg_dump or Prisma-based export scripts — **custom work**)
3. Transform and import to MySQL (table-by-table; watch enums and JSON)
4. Deploy app pointing to MySQL
5. Reconcile file uploads if any were on Cloudinary (download URLs → disk)

> **Agent note:** Scenario B is not automated in this repo. Escalate to human operator before executing.

### 11.3 Rollback

If critical failure within 24h of cutover:

1. Revert DNS to Vercel
2. Restore `DATABASE_URL` to Neon on Vercel env
3. Investigate Hostinger logs before retry

---

## 12. Production smoke test checklist (`HOST-07`)

Use alongside [`docs/ACADEMIC_SMOKE_TEST.md`](./ACADEMIC_SMOKE_TEST.md).

### 12.1 Core platform

- [ ] Login / logout all roles (admin, teacher, student, guardian)
- [ ] Password reset email received (SMTP)
- [ ] Session persists across page navigation
- [ ] Campus-scoped data isolation (boys vs girls)

### 12.2 Academic engine

- [ ] Academic bootstrap or existing year visible
- [ ] Create class section + student enrollment
- [ ] Section attendance save
- [ ] Grade entry + report card PDF
- [ ] Student feedback gate (if cycle active)

### 12.3 Finance & admissions

- [ ] Admission apply + photo upload
- [ ] Approve admission → student record
- [ ] Fee invoice + payment proof flow
- [ ] Cron: fee-penalties (manual curl)

### 12.4 Operations

- [ ] Upload folder writable and served (`/uploads/...`)
- [ ] Email: announcement or notification path
- [ ] All four crons authorized via curl
- [ ] SSL valid; no mixed-content warnings

---

## 13. Backup & maintenance

| Asset | Frequency | Method |
|-------|-----------|--------|
| MySQL database | Daily | hPanel backups or `mysqldump` cron |
| `public/uploads/` | Daily | Tarball to off-site storage |
| Env secrets | On change | Password manager (not Git) |
| Git code | Per release | GitHub tags |

**Restore drill:** Quarterly test DB restore + sample upload file recovery.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `prisma.academicYear is undefined` | Client not generated | `npx prisma generate`; rebuild; restart app |
| Build fails on Hostinger | Wrong Node version | Set Node **20.x** in deploy settings |
| DB connection refused | Wrong host in `DATABASE_URL` | Use hPanel exact host (`localhost` vs remote) |
| 401 on cron | `CRON_SECRET` mismatch | Align env var and curl header |
| Emails not sent | SMTP / DNS | Verify SPF/DKIM; test with simple nodemailer script |
| Uploads 404 after deploy | Ephemeral filesystem | Ensure uploads on persistent disk path; not rebuilt away |
| 502 / timeout on PDF | Memory limit | Reduce concurrent exports; upgrade plan if needed |
| Login works locally, fails prod | `NEXTAUTH_URL` http vs https or wrong domain | Must match `https://evershineacademy.com` exactly |
| PR merged but production unchanged | Hostinger watching wrong branch/domain or serving parked document root | Set auto-deploy branch to `main`; verify `/api/version` build ID changes |
| Broken/blank UI after deploy | Missing standalone static assets or stale service worker | Confirm postbuild/server static sync logs; clear Hostinger/CDN cache; unregister old service worker once |
| Student admission returns `SCHEMA_OUT_OF_DATE` | MySQL schema missing fields used by current app | Run reviewed MySQL migration after DB backup |

---

## 15. Local development parity

Develop against MariaDB/MySQL locally to match production:

```bash
# Docker example
docker run -d --name lms-mysql \
  -e MYSQL_ROOT_PASSWORD=devroot \
  -e MYSQL_DATABASE=evershaheen \
  -e MYSQL_USER=lms \
  -e MYSQL_PASSWORD=lmsdev \
  -p 3306:3306 mariadb:11
```

```env
DATABASE_URL="mysql://lms:lmsdev@localhost:3306/evershaheen"
```

Keep PostgreSQL branch only if maintaining dual support temporarily — not recommended long-term.

---

## 16. Related documentation

| Document | Purpose |
|----------|---------|
| [`docs/ACADEMIC_SMOKE_TEST.md`](./ACADEMIC_SMOKE_TEST.md) | Functional test checklist |
| [`docs/ACADEMIC_MIGRATION.md`](./ACADEMIC_MIGRATION.md) | Legacy → academic engine |
| [`docs/.SYSTEM_INSTRUCTIONS.md`](./.SYSTEM_INSTRUCTIONS.md) | Backend rules for agents |
| [`.env.example`](../.env.example) | Env template (update when SMTP lands) |
| [`vercel.json`](../vercel.json) | Reference cron schedules (pre-migration) |

---

## 17. Document changelog

| Date | Change |
|------|--------|
| 2026-05-24 | Initial Hostinger optimized deployment guide |

---

**End of document.** Agents: mark tasks `HOST-01`–`HOST-07` complete only when verification checkboxes for each phase are satisfied.
