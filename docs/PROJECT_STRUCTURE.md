# Project Structure Guide

This repository is organized to separate the application, documentation, and operational tooling clearly.

## Top-Level Layout

```text
app/              # Next.js application routes and pages
components/       # Reusable UI components
lib/              # Shared utilities, APIs, validation, and helpers
prisma/           # Prisma schema, migrations, and seed logic
scripts/          # Maintenance and data setup scripts
tests/            # Automated test suites
docs/             # Operational, deployment, and architecture docs
Documentation/    # Extended project implementation documentation
```

## What Each Area Is Responsible For

- `app/` — end-user pages, dashboards, and API routes
- `components/` — presentational and shared interface components
- `lib/` — business logic, validation, authentication helpers, and integrations
- `prisma/` — database models and data seeding
- `scripts/` — setup, migration, and admin automation utilities
- `tests/` — smoke tests, API tests, and regression coverage
- `docs/` and `Documentation/` — the repository’s operating and implementation guidance

## Recommended Workflow

1. Update application code in the relevant feature area.
2. Keep supporting documentation in sync with behavior changes.
3. Verify scripts and tests before publishing changes.
4. Commit only production-safe and non-secret content.
