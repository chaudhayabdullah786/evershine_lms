# Installation Guide

Complete setup guide for the Evershine Academy LMS.

---

## System Requirements

| Requirement | Version |
|-------------|---------|
| **Node.js** | 20+ (LTS recommended) |
| **npm** | 10+ |
| **PostgreSQL** | 16+ (or [Neon](https://neon.tech) serverless) |
| **Git** | 2.30+ |

---

## Quick Setup

### 1. Clone & Install

```bash
git clone https://github.com/Ibadat-Ali86/evershine_lms.git
cd evershine_lms
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `DIRECT_URL` | Direct DB connection (for migrations) | `postgresql://user:pass@host:5432/db` |
| `NEXTAUTH_SECRET` | Auth session secret | Generate with: `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Application URL | `http://localhost:5000` |
| `RESEND_API_KEY` | Email service API key | From [resend.com](https://resend.com) |
| `CLOUDINARY_*` | Image hosting credentials | From [cloudinary.com](https://cloudinary.com) |
| `CRON_SECRET` | Cron job authorization | Generate with: `openssl rand -hex 32` |

### 3. Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed sample data (optional)
npm run db:seed
```

### 4. Academic Engine Bootstrap

```bash
# Create shifts, sections, and demo enrollments
npm run db:setup:academic
```

This creates:
- Academic Year (2025-2026)
- Three shifts: Morning (9am–12pm), Evening (3pm–6pm), Night (6pm–9pm)
- Sample class sections and subject offerings

### 5. Start Development Server

```bash
npm run dev
# Application available at http://localhost:5000
```

---

## Post-Setup Verification

1. Open `http://localhost:5000` — landing page should load
2. Navigate to `/login` — login page should render
3. Open Prisma Studio: `npm run db:studio` — verify tables are created
4. Check Academic Engine: tables `AcademicYear`, `Shift`, `ClassSection` should have data

---

## Troubleshooting

### Prisma Client not found
```bash
npx prisma generate
```

### Database connection errors
- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL server is reachable
- For Neon: check that the project is not suspended

### Build failures
```bash
npm run lint       # Check for code issues
npm run test       # Run unit tests
npm run build      # Attempt production build
```

### Academic Engine missing data
```bash
npm run db:seed:academic         # Seed shifts and sections
npm run db:migrate:academic      # Migrate legacy data
```

---

## Available Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server (port 5000) |
| `npm run build` | Create production build |
| `npm run start` | Run production server |
| `npm run lint` | Run ESLint checks |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes directly |
| `npm run db:seed` | Seed sample data |
| `npm run db:setup:academic` | Bootstrap academic engine |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:create-accountant` | Create accountant user |
| `npm run test` | Run Vitest unit tests |
| `npm run test:academic` | Run academic engine tests |
| `npm run test:visual` | Run Playwright E2E tests |
