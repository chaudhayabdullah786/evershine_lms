# 🎓 Evershine Academy Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![MySQL](https://img.shields.io/badge/MySQL-Production-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Deployment](https://img.shields.io/badge/Deployment-Hostinger-673DE6?logo=hostinger&logoColor=white)](https://www.hostinger.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-3.0.0-blue.svg)](package.json)

> A production-deployed academy management, learning management, and education ERP platform for multi-campus educational institutions.

<p align="center">
  <a href="https://evershineacademy.com/"><strong>🌐 Live Application</strong></a>
  ·
  <a href="https://github.com/chaudhayabdullah786/evershine_lms"><strong>💻 Source Code</strong></a>
  ·
  <a href="docs/HOSTINGER_DEPLOYMENT.md"><strong>🚀 Deployment Guide</strong></a>
</p>

---

## 📖 Overview

**Evershine Academy Management System** centralizes the academic and administrative operations of an educational institution in one full-stack web application.

The platform supports admissions, student enrollment, attendance, academic scheduling, examinations, performance tracking, fees, payroll, expenses, recruitment, reports, certificates, notifications, and role-based dashboards.

It is designed for institutions that operate multiple campuses and shifts while requiring secure access for administrators, teachers, accountants, students, parents, and guardians.

---

## 🎯 Problem Statement

Many educational institutions still manage critical workflows through spreadsheets, paper records, messaging applications, and disconnected software.

This creates several problems:

- Duplicate and inconsistent records
- Slow admission and approval workflows
- Limited visibility into attendance and performance
- Difficult fee, payroll, and expense reconciliation
- Weak access control between campuses and user roles
- Time-consuming PDF and Excel report preparation
- Poor auditability of administrative actions

Evershine Academy Management System addresses these issues through a centralized, permission-based platform with structured academic, financial, recruitment, and reporting workflows.

---

## ✨ Core Features

### 🎓 Academic Management

- Multi-campus academic structure
- Morning, evening, and night shift scheduling
- Student enrollment and section allocation
- Subject offerings and teacher assignments
- Student and teacher attendance
- Timetable and room allocation
- Examination date sheets
- Teacher-managed grade entry
- Draft and declared result workflows
- Daily performance scoring
- Monthly result comparison
- Target-versus-achievement tracking
- Student promotion and academic-year workflows
- Branded result cards and academic reports

### 💰 Finance and Accounting

- Monthly fee invoice and challan generation
- Payment and payment-proof tracking
- Partial payment and overdue status handling
- Configurable penalties and late fees
- Operational expense ledger
- Salary-slip generation
- Profit-and-loss reporting
- Reserve-fund ledger
- Branded PDF and Excel exports
- Transaction-based financial operations

### 📝 Admissions, Recruitment, and Leads

- Public contact and inquiry forms
- Multi-step online student admission workflow
- Admin review, approval, and rejection
- Staff application pipeline
- Teacher, accountant, and admin recruitment
- Applicant status management
- CNIC-based duplicate protection
- Document upload support
- Administrative Excel exports

### 👥 Role-Based Portals

The application includes permission-based experiences for:

| Role | Primary Access |
|---|---|
| `SUPER_ADMIN` | System-wide configuration, users, reports, audits, and financial oversight |
| `ADMIN` | Campus-scoped operations, admissions, staff, academics, and approvals |
| `TEACHER` | Attendance, classes, grades, performance, tasks, and leave requests |
| `ACCOUNTANT` | Fees, payments, salary slips, expenses, and finance reports |
| `STUDENT` | Personal profile, attendance, fees, tasks, and published results |
| `PARENT` | Linked student information, fees, attendance, and academic progress |
| `GUARDIAN` | Authorized access to linked student records and feedback workflows |

### 📄 Documents and Communication

- Student and teacher ID cards
- Result cards
- Certificates and bonafide letters
- Exam date sheets
- Salary slips
- Fee challans
- Excel administrative reports
- Email notification workflows
- In-app notifications
- Announcements and calendar events
- QR code generation

### 🔐 Platform Infrastructure

- Role-based access control
- Campus-scoped data access
- Prisma-backed relational data model
- Zod validation at API boundaries
- Argon2id password hashing
- NextAuth.js session management
- Audit logging
- Cloudinary file storage
- Redis-compatible rate-limiting support
- Unit and end-to-end testing
- Responsive public landing page
- Production deployment on Hostinger

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Presentation Layer                                          │
│ Next.js App Router + React + TypeScript + Tailwind CSS      │
│ Role-based dashboards, forms, tables, charts, and reports   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Application and API Layer                                   │
│ Next.js Route Handlers + Zod Validation + RBAC              │
│ Authentication, authorization, APIs, notifications, exports │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Service Layer                                                │
│ Academic, finance, recruitment, reporting, and audit logic   │
│ Prisma transactions for consistency-sensitive operations    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Data Layer                                                   │
│ Prisma ORM + MySQL                                           │
│ Relational models, indexes, constraints, and audit records   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧰 Technology Stack

| Layer | Technology |
|---|---|
| Full-stack framework | Next.js 16 |
| Frontend | React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4, ShadCN/Radix UI |
| Client state | Zustand |
| Server state | TanStack React Query |
| Forms | React Hook Form |
| Validation | Zod |
| Authentication | NextAuth.js 5 |
| Password hashing | Argon2id |
| ORM | Prisma 5 |
| Database | MySQL |
| Charts | Recharts |
| Animation | Framer Motion |
| PDF generation | jsPDF, html2canvas |
| Spreadsheet generation | ExcelJS, SheetJS |
| File storage | Cloudinary |
| Email | Resend |
| Rate limiting/cache | Upstash Redis |
| Testing | Vitest, Playwright, Testing Library |
| Deployment | Hostinger Node.js hosting |

---

## 🗃️ Main Data Domains

The Prisma schema is organized around the following domains:

| Domain | Representative Models |
|---|---|
| Identity and access | `User`, `Session`, `Admin`, `Teacher`, `Accountant`, `Student`, `Parent`, `Guardian` |
| Campus structure | `Campus`, `Batch`, `House`, `Class`, `Room` |
| Academic engine | `AcademicYear`, `Shift`, `ClassSection`, `SubjectOffering`, `StudentEnrollment` |
| Attendance | `Attendance`, `TeacherAttendance`, `TeacherAvailability` |
| Results and performance | `TermResult`, `SubjectResult`, `DailyPerformanceScore`, `AssessmentScore` |
| Finance | `FeeInvoice`, `FeePayment`, `Expense`, `SalarySlip`, `ProfitLossStatement` |
| Admissions and recruitment | `AdmissionRequest`, `LandingInquiry`, `StaffApplicationRequest` |
| Communication | `Notification`, `Announcement`, `CalendarEvent` |
| Documents | `Certificate`, result cards, ID cards, reports, and export records |
| Governance | `AuditLog`, permissions, role-assumption records, and workflow histories |

---

## 🚀 Local Development

### Prerequisites

Install the following before starting:

- Node.js 20 or newer
- npm 10 or newer
- MySQL 8-compatible database
- Git

Optional external services:

- Cloudinary for images and documents
- Resend for transactional email
- Upstash Redis for distributed rate limiting and caching

### 1. Clone the Repository

```bash
git clone https://github.com/chaudhayabdullah786/evershine_lms.git
cd evershine_lms
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Update `.env` using your own credentials:

```env
# MySQL
DATABASE_URL="mysql://DATABASE_USER:DATABASE_PASSWORD@DATABASE_HOST:3306/DATABASE_NAME"

# Authentication
NEXTAUTH_SECRET="generate-a-long-random-secret"
NEXTAUTH_URL="http://localhost:5000"

# Public application settings
NEXT_PUBLIC_APP_URL="http://localhost:5000"
NEXT_PUBLIC_APP_NAME="Evershine Academy LMS"
NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY="true"

# Cloudinary
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
CLOUDINARY_UPLOAD_FOLDER="evershine"

# Resend
RESEND_API_KEY=""
RESEND_FROM_EMAIL=""
RESEND_FROM_NAME="Evershine Academy"

# Upstash Redis
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Protected scheduled endpoints
CRON_SECRET=""
```

> **Security:** Never commit `.env`, production credentials, API secrets, private keys, database passwords, or real user records to GitHub.

Generate a secure authentication secret:

```bash
openssl rand -hex 32
```

### 4. Generate the Prisma Client

```bash
npm run db:generate
```

### 5. Apply the Database Schema

For a local or controlled development database:

```bash
npm run db:push
```

For a migration-based development workflow:

```bash
npm run db:migrate
```

### 6. Seed Development Data

```bash
npm run db:seed
```

Academic-engine scripts are also available:

```bash
npm run db:seed:academic
npm run db:migrate:academic
```

Review existing legacy data and back up the database before running migration scripts against a shared or production database.

### 7. Start the Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:5000
```

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server on port 5000 |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest test suite |
| `npm run test:academic` | Run academic-engine tests |
| `npm run test:academic:api` | Run academic API tests with Playwright |
| `npm run test:visual` | Run Playwright end-to-end tests |
| `npm run test:export` | Test document export behavior |
| `npm run db:generate` | Generate the Prisma Client |
| `npm run db:push` | Synchronize the schema in a development environment |
| `npm run db:migrate` | Create/apply development migrations |
| `npm run db:seed` | Seed initial development data |
| `npm run db:seed:academic` | Seed academic-engine data |
| `npm run db:migrate:academic` | Migrate compatible legacy academic data |
| `npm run db:setup:academic` | Run academic seed and legacy migration scripts |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset the development database |

---

## 📁 Project Structure

```text
evershine_lms/
├── app/
│   ├── api/                     # API route handlers
│   ├── dashboard/               # Role-based dashboards
│   ├── admissions/              # Public admission workflow
│   └── page.tsx                 # Public landing page
├── components/
│   ├── ui/                      # Shared UI components
│   ├── landing/                 # Landing-page sections
│   ├── academic/                # Academic UI components
│   └── layout/                  # Navigation and layouts
├── content/                     # Configurable site content
├── designs/                     # Document and report designs
├── docs/                        # Technical and deployment documentation
├── hooks/                       # Reusable React hooks
├── lib/
│   ├── services/                # Business services
│   ├── validation/              # Zod schemas
│   ├── excel/                   # Spreadsheet generation
│   ├── pdf/                     # PDF generation
│   ├── notifications.ts         # Notification helpers
│   └── rbac.ts                  # Authorization helpers
├── prisma/
│   ├── migrations/              # Database migrations
│   ├── schema.prisma            # MySQL Prisma schema
│   └── seed.ts                  # Seed script
├── public/                      # Static assets
├── scripts/                     # Maintenance and migration scripts
├── tests/                       # Unit, API, export, and E2E tests
├── types/                       # Shared TypeScript types
├── .env.example                 # Safe environment template
├── next.config.ts               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── playwright.config.ts         # Playwright configuration
├── tailwind.config.ts           # Tailwind configuration
└── vitest.config.ts             # Vitest configuration
```

---

## 🚢 Production Deployment

The live application is deployed on **Hostinger**:

**https://evershineacademy.com/**

### Production Requirements

- Node.js 20-compatible runtime
- MySQL production database
- HTTPS-enabled domain
- Production environment variables
- Persistent process management provided by the hosting environment
- Cloudinary credentials when uploads are enabled
- Resend credentials when email delivery is enabled
- Secure cron secret for scheduled endpoints

### Typical Hostinger Deployment Flow

```bash
npm ci
npm run db:generate
npm run build
npm run start
```

Database schema changes should be reviewed, backed up, and applied separately before or during a controlled deployment.

For detailed hosting instructions, see:

- [Hostinger Deployment Guide](docs/HOSTINGER_DEPLOYMENT.md)
- [Installation Guide](INSTALLATION.md)
- [Project Structure](docs/PROJECT_STRUCTURE.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Notification System](docs/NOTIFICATION_SYSTEM.md)

### Scheduled Jobs

The repository includes protected cron endpoints for workflows such as:

- Fee penalties
- Fee reminders
- Teacher attendance processing
- Birthday notifications

On Hostinger, configure these routes through Hostinger cron jobs or another trusted scheduler and send the configured `CRON_SECRET` securely.

---

## 🔐 Security Practices

Implemented or supported security controls include:

- Argon2id password hashing
- Session-based authentication
- Role-based authorization
- Campus-scoped data access
- Zod request validation
- Prisma parameterized queries
- Audit logs for sensitive mutations
- Database transactions for consistency-sensitive workflows
- Restricted file-storage credentials
- Protected scheduled routes
- Optional distributed rate limiting

### Deployment Security Checklist

Before every production deployment:

- Confirm `.env` is excluded from Git
- Rotate any credential exposed in chat, logs, screenshots, or repository history
- Use a unique production `NEXTAUTH_SECRET`
- Restrict MySQL remote access to trusted hosts
- Enforce HTTPS
- Disable or replace demo credentials
- Back up the database
- Run dependency and security checks
- Review uploaded-file restrictions
- Verify authorization on sensitive API routes
- Avoid displaying real student or staff data in public screenshots

---

## 🧪 Testing

Run the standard test suite:

```bash
npm run test
```

Run academic tests:

```bash
npm run test:academic
```

Run end-to-end tests:

```bash
npm run test:visual
```

Install Playwright browsers when required:

```bash
npm run playwright:install
```

Before merging a change:

```bash
npm run lint
npm run test
npm run build
```

---

## 🤝 Contributing

1. Fork or clone the repository.
2. Create a focused branch.
3. Implement and test the change.
4. Run linting and relevant tests.
5. Commit using a descriptive message.
6. Push the branch.
7. Open a pull request.

Example:

```bash
git checkout -b feat/feature-name
npm run lint
npm run test
git add .
git commit -m "feat: add feature-name"
git push origin feat/feature-name
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for additional guidance.

---

## 👥 Project Team

| Team Member | Profile |
|---|---|
| **Ibadat Ali** | [GitHub](https://github.com/Ibadat-Ali86) |
| **Muhammad Abdullah** | [GitHub](https://github.com/chaudhayabdullah786) |
| **Shawaiz Ali** | [GitHub](https://github.com/Shawaiz-Project) |

---

## 🗺️ Future Improvements

Potential areas for continued development include:

- Centralized error tracking and application monitoring
- Automated database-backup verification
- CI dependency and vulnerability scanning
- Stronger Content Security Policy headers
- Expanded accessibility testing
- API-level load and performance testing
- Background queues for large reports
- Additional server-side rendering and caching
- Automated deployment checks
- Multi-tenant institution support

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🔗 Project Links

- **Live Application:** https://evershineacademy.com/
- **Repository:** https://github.com/chaudhayabdullah786/evershine_lms
- **Deployment Documentation:** [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md)

---

<p align="center">
  Built by <strong>Ibadat Ali</strong>, <strong>Muhammad Abdullah</strong>, and <strong>Shawaiz Ali</strong>.
</p>

<p align="center">
  <strong>Evershine Academy Management System · Version 3.0.0</strong>
</p>
