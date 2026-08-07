/**
 * GET /api/teacher-portal/my-students
 *
 * Returns students enrolled in class sections the requesting teacher is
 * assigned to for the current academic year.
 *
 * WHY scoped endpoint instead of reusing /api/students:
 *   1. The global students endpoint exposes fee/financial data that teachers
 *      must never see (data minimisation principle, OWASP ASVS L2).
 *   2. Teachers must only see students from their authorized ClassSections —
 *      enforced at the DB query level, not only in the UI.
 *
 * Security guarantees:
 *   - No feeStatus, totalFeeAmount, paidAmount, dueAmount fields returned.
 *   - Authorized classSectionIds are derived exclusively from the Academic
 *     Engine (SubjectOffering, TimetableSlot) and legacy assignments
 *     (ClassTeacher, SubjectTeacher) for the active academic year.
 *     A teacher cannot inject arbitrary IDs to see other students.
 *   - Role guard: TEACHER only.
 *   - Shift isolation: `classSectionId` scoping ensures Morning teachers
 *     never see Evening students, even in the same grade/section.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse } from '@/lib/api-response'
import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { z } from 'zod'

const querySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(100).default(25),
  classSectionId:   z.string().optional(),
  search:           z.string().optional(),
  enrollmentStatus: z.enum(['ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN', 'ON_LEAVE']).optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  // ── Resolve teacher record ──────────────────────────────────────────────────
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  // ── Resolve active academic year ───────────────────────────────────────────
  // WHY: We scope the authorized section IDs to the current academic year so
  // that reassignments from a prior year do not grant residual access.
  const activeYear = await getActiveAcademicYear()

  // ── Collect authorised ClassSection IDs ────────────────────────────────────
  // [FACT] A teacher is authorised only for sections they are explicitly
  // assigned to through SubjectOffering, TimetableSlot, ClassTeacher, or
  // SubjectTeacher assignments, resolved via the canonical scope function.
  const authorisedClassSectionIds = await getTeacherClassSectionIds(
    teacher.id,
    activeYear?.id
  )

  if (authorisedClassSectionIds.length === 0) {
    return paginatedResponse([], { page: 1, limit: 25, total: 0 })
  }

  // ── Parse & validate query params ──────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, classSectionId, search, enrollmentStatus } = parsed.data

  // Validate that a requested classSectionId falls within the teacher's scope.
  // SECURITY: A teacher cannot bypass this by injecting a foreign ID in the
  // query string — the allowed set is resolved server-side from DB assignments.
  const effectiveClassSectionIds = classSectionId
    ? authorisedClassSectionIds.includes(classSectionId)
      ? [classSectionId]
      : []
    : authorisedClassSectionIds

  if (effectiveClassSectionIds.length === 0) {
    return paginatedResponse([], { page: 1, limit, total: 0 })
  }

  // WHY no mode: 'insensitive' — MySQL utf8mb4_unicode_ci collation handles
  // case-insensitive LIKE natively. mode: 'insensitive' is PostgreSQL-only.
  const searchOr = search
    ? [
        { firstName:          { contains: search } },
        { lastName:           { contains: search } },
        { registrationNumber: { contains: search } },
        { rollNumber:         { contains: search } },
        { fatherName:         { contains: search } },
      ]
    : null

  // WHY strictly ClassSection-based: The old implementation also matched on
  // legacy `Student.classId`. We no longer do so here because:
  //   1. `getTeacherClassSectionIds` already bridges legacy Class assignments
  //      and returns the equivalent ClassSection IDs.
  //   2. Querying `Student.classId` bypasses shift enforcement — a teacher
  //      assigned to 9-A Morning would also see 9-A Evening students if both
  //      share the same legacy classId.
  const where: Record<string, unknown> = {
    isActive: true,
    enrollments: {
      some: {
        classSectionId: { in: effectiveClassSectionIds },
        status: 'ACTIVE',
      },
    },
    ...(enrollmentStatus && { enrollmentStatus }),
    ...(searchOr ? { AND: [{ OR: searchOr }] } : {}),
  }

  // ── Execute in transaction for consistency ─────────────────────────────────
  const [total, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
      // WHY explicit select: ensures fee fields are NEVER returned even if
      // the Student model gains new financial fields in future migrations.
      select: {
        id:                 true,
        registrationNumber: true,
        rollNumber:         true,
        firstName:          true,
        lastName:           true,
        fatherName:         true,
        gender:             true,
        dateOfBirth:        true,
        enrollmentStatus:   true,
        profilePicture:     true,
        phoneNumber:        true,
        email:              true,
        section:            true,
        academicYear:       true,
        admissionDate:      true,
        campus: {
          select: { id: true, name: true, code: true },
        },
        batch: {
          select: { id: true, name: true, code: true, academicLevel: true },
        },
        class: {
          select: { id: true, name: true, grade: true },
        },
        house: {
          select: { id: true, name: true, color: true },
        },
        enrollments: {
          where: {
            classSectionId: { in: effectiveClassSectionIds },
            status: 'ACTIVE',
          },
          select: {
            id: true,
            rollNumber: true,
            status: true,
            classSection: {
              select: {
                id: true,
                className: true,
                sectionName: true,
                shift: { select: { name: true, code: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
  ])

  return paginatedResponse(students, { page, limit, total })
}
