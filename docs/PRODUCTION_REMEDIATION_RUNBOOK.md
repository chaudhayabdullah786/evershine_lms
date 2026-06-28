# Production Remediation Runbook - Hostinger LMS

Use this when GitHub merges do not appear on production, the UI loads without the expected Next.js assets, or student admission fails in production.

## 1. Confirm the live domain serves the LMS

Run these from any machine:

```bash
curl -fsS https://evershineacademy.com/api/version
curl -fsS https://evershineacademy.com/api/health
```

Expected result: JSON from this repository. If the response is `403 Forbidden`, a `/lander` redirect, a parked page, or non-JSON HTML, fix DNS and Hostinger Node.js app binding before debugging application code.

Required Hostinger settings:

- Domain: `evershineacademy.com` and `www.evershineacademy.com` bound to the Node.js app
- Auto-deploy branch: `main`
- Node version: `20.x`
- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm run start`
- Startup entrypoint: root `server.js`

Required production env vars:

```env
DATABASE_URL="mysql://USER:PASS@HOST:3306/DBNAME"
NEXTAUTH_SECRET="<openssl rand -hex 32>"
NEXTAUTH_URL="https://evershineacademy.com"
NEXT_PUBLIC_APP_URL="https://evershineacademy.com"
NODE_ENV="production"
NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY="true"
CRON_SECRET="<openssl rand -hex 32>"
```

## 2. Verify deploy and asset freshness

After every merge to `main`, compare the build ID before and after deploy:

```bash
curl -fsS https://evershineacademy.com/api/version
```

The `buildId` must change after Hostinger finishes building. Hostinger logs must include:

```text
[postbuild] Done. Standalone build is deployment-ready.
[SERVER] OK  .next/static -> standalone/.next/static synced
[SERVER] Starting Next.js on port ...
```

If the page is blank or distorted:

- Check browser DevTools for failed `/_next/static/*` requests.
- Clear Hostinger/CDN cache.
- Unregister the old service worker once from DevTools -> Application -> Service Workers.
- Reload and confirm `/sw.js` has a build-specific cache version in the deployed standalone output.

## 3. Fix student admission failures

The admission API now returns controlled diagnostic errors for common production failures:

| Error code | Meaning | Operator action |
|---|---|---|
| `SCHEMA_OUT_OF_DATE` | MySQL is missing a table or column used by the current app | Back up DB, fix MySQL migration history, run reviewed migration |
| `DATABASE_UNAVAILABLE` | Prisma cannot reach MySQL | Verify `DATABASE_URL`, DB user privileges, host, and Hostinger DB availability |
| `CONFLICT` | Duplicate unique field, usually email or CNIC | Correct the form data or use the existing student record |

Before running production migrations, check:

```bash
npx prisma validate
npx prisma migrate status
```

If `prisma/migrations/migration_lock.toml` still says `provider = "postgresql"`, do not run `prisma migrate deploy` blindly against Hostinger MySQL. For a fresh database, regenerate a clean MySQL baseline. For live data, create a reviewed forward-only migration after a verified backup.

Admission smoke test:

1. Log in as Super Admin.
2. Open `/dashboard/students/admission`.
3. Select level, campus, batch, and optionally class section.
4. Submit a unique CNIC/email.
5. Confirm a new `User` and `Student` are created.
6. If guardian CNIC/name were supplied, confirm guardian link or inspect the non-fatal guardian note.
7. If section was supplied, confirm `StudentEnrollment` exists for the active academic year.

## 4. Rollback

- App rollback: revert the faulty commit on `main` and push; verify `/api/version` changes after Hostinger deploy.
- DB rollback: restore from the pre-migration MySQL backup. Do not attempt destructive schema changes without a tested restore path.
- Cache rollback: clear Hostinger/CDN cache and unregister the service worker if users still receive stale chunks.
