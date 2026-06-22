/**
 * GET /api/teacher-portal/my-students
 *
 * Returns students enrolled in classes the requesting teacher is assigned to.
 *
 * WHY scoped endpoint instead of reusing /api/students:
 *   1. The global students endpoint exposes fee/financial data that teachers
 *      must never see (data minimisation principle, OWASP ASVS L2).
 *   2. The admin endpoint returns ALL students; teachers must only see students
 *      in their assigned classes — enforced at the DB query level, not in the UI.
 *
 * Security guarantees:
 *   - No feeStatus, totalFeeAmount, paidAmount, dueAmount fields returned.
 *   - classIds are derived from the teacher's own ClassTeacher / SubjectTeacher
 *     assignments — a teacher cannot inject arbitrary classIds to see other students.
 *   - Role guard: TEACHER only.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse } from '@/lib/api-response'
import { z } from 'zod'

const querySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(100).default(25),
  classId:          z.string().optional(),
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

  // ── Collect authorised class IDs for this teacher ──────────────────────────
  // [FACT] A teacher is authorised to see students in classes where they are
  //        either the ClassTeacher OR a SubjectTeacher.
  const [classTeacherRows, subjectTeacherRows, subjectOfferingRows, timetableSlotRows] = await Promise.all([
    prisma.classTeacher.findMany({
      where: { teacherId: teacher.id },
      select: { classId: true },
    }),
    prisma.subjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: {
        subject: {
          select: { classId: true },
        },
      },
    }),
    prisma.subjectOffering.findMany({
      where: { teacherId: teacher.id },
      select: { classSectionId: true },
    }),
    prisma.timetableSlot.findMany({
      where: { teacherId: teacher.id, isPublished: true },
      select: { classSectionId: true },
    }),
  ])

  const authorisedClassIds = Array.from(
    new Set([
      ...classTeacherRows.map(r => r.classId),
      ...subjectTeacherRows.map(r => r.subject.classId),
    ])
  )

  const authorisedClassSectionIds = Array.from(
    new Set([
      ...subjectOfferingRows.map(r => r.classSectionId),
      ...timetableSlotRows.map(r => r.classSectionId),
    ].filter(Boolean))
  )

  if (authorisedClassIds.length === 0 && authorisedClassSectionIds.length === 0) {
    return paginatedResponse([], { page: 1, limit: 25, total: 0 })
  }

  // ── Parse & validate query params ──────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, classId, classSectionId, search, enrollmentStatus } = parsed.data

  // Use the explicit section ID when the caller is on the section-based attendance flow.
  // Fall back to the legacy classId filter for older teacher screens.
  const selectedClassSectionId = classSectionId ?? classId

  const effectiveClassIds = classId
    ? authorisedClassIds.filter(id => id === classId)
    : authorisedClassIds

  const effectiveClassSectionIds = selectedClassSectionId
    ? authorisedClassSectionIds.filter(id => id === selectedClassSectionId)
    : authorisedClassSectionIds

  if (effectiveClassIds.length === 0 && effectiveClassSectionIds.length === 0) {
    return paginatedResponse([], { page: 1, limit, total: 0 })
  }

  // ── Build WHERE predicate ──────────────────────────────────────────────────
  const searchOr = search ? [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName:  { contains: search, mode: 'insensitive' } },
    { registrationNumber: { contains: search, mode: 'insensitive' } },
    { rollNumber: { contains: search, mode: 'insensitive' } },
    { fatherName: { contains: search, mode: 'insensitive' } },
  ] : null

  const classOr = [
    { classId: { in: effectiveClassIds } },
    { enrollments: { some: { classSectionId: { in: effectiveClassSectionIds }, status: 'ACTIVE' } } }
  ]

  const where: Record<string, any> = {
    isActive: true,
    ...(enrollmentStatus && { enrollmentStatus }),
    AND: [
      { OR: classOr },
      ...(searchOr ? [{ OR: searchOr }] : [])
    ]
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
      //   the Student model gains new financial fields in future migrations.
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
          // WHY: city is a Student-level field, not Campus. Campus only has name/code/address.
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
          where: { status: 'ACTIVE' },
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
          take: 1,
        },
      },
    }),
  ])

  return paginatedResponse(students, { page, limit, total })
}
