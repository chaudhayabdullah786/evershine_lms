# 📡 API DOCUMENTATION — Evershine Academy LMS

> **Last Updated**: 2026-05-23
> **Base URL**: `/api`
> **Response Format**: JSON Envelope
> **Authentication**: Auth.js v5 JWT Session Cookie

---

## 1. 📦 RESPONSE FORMAT

All API responses follow a strict, standardized JSON envelope to ensure predictable client-side consumption and error handling.

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-05-23T18:00:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided.",
    "details": [ ... ]
  },
  "meta": {
    "timestamp": "2026-05-23T18:00:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 2. 🛣️ ENDPOINTS

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/login` | ❌ Public | Authenticates user and issues a JWT session token. |
| POST | `/api/auth/logout` | ✅ Any | Revokes the current session and clears cookies. |
| POST | `/api/auth/refresh` | ✅ Any | Refreshes the access token using rotation strategies. |
| GET | `/api/auth/me` | ✅ Any | Retrieves the current authenticated user context and roles. |

---

### 🎓 Student Management (`/api/students`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/students` | ✅ ADMIN+ | Retrieves a paginated and filterable list of active students. |
| POST | `/api/students` | ✅ ADMIN+ | Provisions a new student profile and generates an ID. |
| GET | `/api/students/:id` | ✅ ADMIN+ | Fetches comprehensive details for a specific student. |
| PATCH | `/api/students/:id` | ✅ ADMIN+ | Updates an existing student profile. |
| DELETE | `/api/students/:id` | ✅ SUPER_ADMIN | Soft-deletes (suspends) a student record. |

---

### 📋 Admission Workflow (`/api/admissions`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/admissions` | ✅ ADMIN+ | Lists all admission requests with status filter. |
| POST | `/api/admissions/apply` | ❌ Public | Submits a new admission application form. |
| POST | `/api/admissions/:id/approve` | ✅ ADMIN+ | Atomically creates Student + User + Guardian + FeeInvoice and sends credentials via Resend. |
| POST | `/api/admissions/:id/decline` | ✅ ADMIN+ | Marks admission as declined with admin remarks. |
| DELETE | `/api/admissions/:id` | ✅ ADMIN+ | Permanently removes a pending admission request. |

---

### 👩‍🏫 Teacher Management (`/api/teachers`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/teachers` | ✅ ADMIN+ | Paginated, searchable teacher directory. |
| POST | `/api/teachers` | ✅ ADMIN+ | Creates a new teacher profile and linked User account (Argon2id). |
| GET | `/api/teachers/:id` | ✅ ADMIN+ | Fetches full teacher profile with class assignments. |
| PATCH | `/api/teachers/:id` | ✅ ADMIN+ | Updates teacher details. Cannot mutate `User.email` (auth login). |
| DELETE | `/api/teachers/:id` | ✅ SUPER_ADMIN | Suspends teacher and cascades `User.isActive = false`. |
| GET | `/api/teachers/:id/attendance` | ✅ ADMIN/TEACHER | Monthly attendance grid (`?month=5&year=2026`). |
| POST | `/api/teachers/:id/attendance` | ✅ ADMIN | Upserts attendance record for a given date. |
| GET | `/api/teachers/:id/classes` | ✅ ADMIN/TEACHER | Lists class assignments. |
| POST | `/api/teachers/:id/classes` | ✅ ADMIN | Adds a class assignment (campus cross-validated). |
| DELETE | `/api/teachers/:id/classes` | ✅ ADMIN | Removes a class assignment. |
| GET | `/api/teachers/:id/timetable` | ✅ ADMIN/TEACHER | Weekly schedule grouped by day (0-indexed Mon=0). |

---

### 🎓 Teacher Portal (`/api/teacher-portal`) — RBAC-Scoped Namespace
All routes in this namespace require `TEACHER` role. Data is scoped exclusively to the authenticated teacher's assignments.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teacher-portal/my-classes` | Returns only the classes this teacher is assigned to (includes campus + batch metadata). |
| GET | `/api/teacher-portal/my-students` | Returns students from the teacher's assigned classes. |
| POST | `/api/teacher-portal/attendance` | Marks attendance for students in teacher's own classes. |
| GET | `/api/teacher-portal/tasks` | Lists tasks/assignments the teacher has created. |
| POST | `/api/teacher-portal/tasks` | Creates a task for a specific class and subject. |
| GET | `/api/teacher-portal/marks` | Retrieves marks submitted by this teacher. |
| POST | `/api/teacher-portal/marks` | Submits marks for a student on a specific task. |
| GET | `/api/teacher-portal/grading-schemas` | ⚠ Legacy | Retired legacy endpoint; use `/api/grading-schemes` or `/dashboard/teacher/grade-entry`. |
| POST | `/api/teacher-portal/grading-schemas` | ⚠ Legacy | Retired legacy endpoint; grading schema creation is now handled through the academic grading engine. |

---

### 💳 Fee Management (`/api/fees`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/fees/invoices` | ✅ ADMIN/ACCOUNTANT | Lists all generated fee invoices. |
| POST | `/api/fees/invoices` | ✅ ADMIN/ACCOUNTANT | Generates batched or single student invoices. |
| POST | `/api/fees/payments` | ✅ ADMIN/ACCOUNTANT | Records a new fee payment (partial or full). |
| POST | `/api/fees/proofs` | ✅ STUDENT/GUARDIAN | Uploads manual payment proof for admin verification. |
| POST | `/api/fees/generate-challan/:id` | ✅ ADMIN/ACCOUNTANT | Dynamically generates a PDF fee challan. |

---

### 📅 Attendance (`/api/attendance`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/attendance/mark` | ✅ ADMIN/TEACHER | Bulk marks student attendance for a specific class/date. |
| POST | `/api/attendance/verify-qr` | ✅ TEACHER | Verifies student attendance via QR code scan. |
| GET | `/api/attendance/report` | ✅ ADMIN+ | Aggregated daily/monthly attendance reports. |

---

### 📊 Results & Exams (`/api/results`, `/api/exams`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/results` | ✅ ADMIN/TEACHER | Retrieves student examination results. |
| POST | `/api/results` | ✅ ADMIN/TEACHER | Publishes results with automated grade + percentage calculation. |
| GET | `/api/exams` | ✅ ADMIN/TEACHER | Lists scheduled exams. |
| POST | `/api/exams` | ✅ ADMIN | Creates a new exam schedule entry. |

---

### 📣 Announcements & Notifications (`/api/announcements`, `/api/notifications`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/announcements` | ✅ Any | Fetches active global or class-specific announcements. |
| POST | `/api/announcements` | ✅ ADMIN+ | Creates an announcement and triggers Resend email to all active users. |
| GET | `/api/notifications` | ✅ Any | Fetches unread in-app notifications for the current user (polled every 30s). |
| PATCH | `/api/notifications/read-all` | ✅ Any | Marks all notifications as read. |

---

### 📁 Leaves, Complaints & Salaries
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/leaves` | ✅ TEACHER/ACCOUNTANT | Submit a leave request (Casual, Sick, Maternity, Emergency). |
| PATCH | `/api/leaves/:id` | ✅ ADMIN+ | Approve or reject a leave; dispatches in-app notification atomically. |
| POST | `/api/complaints` | ✅ Any | File a formal complaint. |
| PATCH | `/api/complaints/:id` | ✅ ADMIN+ | Resolve a complaint with remarks; notifies complainant. |
| GET | `/api/salaries` | ✅ ADMIN/ACCOUNTANT | List salary slips. |
| POST | `/api/salaries` | ✅ ADMIN/ACCOUNTANT | Generate a salary voucher with allowances/deductions. |

---

### 🗓️ Academic Calendar (`/api/calendar`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/calendar` | ✅ Any | Campus-scoped event list (students/teachers see own campus only). |
| POST | `/api/calendar` | ✅ ADMIN+ | Creates a new calendar event with start/end datetime. |
| GET | `/api/calendar/:id` | ✅ Any | Event detail. |
| PATCH | `/api/calendar/:id` | ✅ ADMIN+ | Updates event. |
| DELETE | `/api/calendar/:id` | ✅ ADMIN+ | Soft-deletes event. |

---

### 🛠️ Admin & Audit (`/api/admin`, `/api/dashboard`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/dashboard` | ✅ Any | Aggregate institutional stats; also checks `isActive` — returns 401 for suspended accounts. |
| GET | `/api/admin/reports/fees` | ✅ ADMIN+ | Downloadable fees outstanding deficit report (Excel). |
| GET | `/api/admin/reports/attendance` | ✅ ADMIN+ | Campus attendance summary (Excel). |
| GET | `/api/admin/reports/performance` | ✅ ADMIN+ | Academic grade distribution report (Excel). |

---

### 🌱 Utilities (`/api/seed-*`)
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/seed-girls` | ✅ SUPER_ADMIN | Seeds the `SUPER_ADMIN` account for Girls campus. |
| GET | `/api/seed-teacher` | ✅ ADMIN+ | Seeds `teacher1` with ClassTeacher + SubjectTeacher assignments. Idempotent. |

---

## 3. 🛡️ SECURITY & PROTOCOLS

| Control | Implementation |
|---------|----------------|
| **Authentication** | Auth.js v5 JWT session cookie — `auth()` in API routes (Node.js), `auth.config.ts` in middleware (Edge) |
| **Authorization** | `checkPermission(role, resource, action)` called at every route handler before any data access |
| **Input Validation** | Zod schemas at all API boundaries — reject by default, permit by exception |
| **Parameterized Queries** | Prisma ORM — zero raw SQL string interpolation |
| **Rate Limiting** | Sliding window (100 req/min per IP) via `lib/rate-limiter.ts` |
| **Audit Logging** | All `POST / PATCH / DELETE` mutations write to `AuditLog` with JSON delta, userId, entity type, and UTC timestamp |
| **Atomic Transactions** | Multi-step mutations run in `prisma.$transaction()` — prevents partial state |
| **Password Hashing** | Argon2id via `@node-rs/argon2` — `memoryCost: 65536, timeCost: 3` |
| **Secrets** | `.env` excluded from VCS; all secrets referenced from environment only |

---

## 4. ⚠️ SCHEMA CONSTRAINTS (Reference for API Consumers)

| Field | Constraint |
|-------|-----------|
| `AttendanceStatus` | `PRESENT \| ABSENT \| LATE \| EXCUSED` — **no `ON_LEAVE`** |
| `TeacherAttendance` | Fields: `id, teacherId, date, status, remarks, createdAt` only — no `markedBy` / `markedAt` |
| `Timetable.dayOfWeek` | `0` = Monday … `5` = Saturday (0-indexed) |
| `Timetable.subjectName` | `String` field — no FK to Subject table |
| `ClassTeacher` unique key | `@@unique([classId, teacherId, academicYear])` |
| `Teacher.email` | Mutable contact email. `User.email` is immutable auth login — never PATCH via teacher endpoint |
