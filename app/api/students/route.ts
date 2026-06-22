/**
 * GET  /api/students  — paginated student list
 * POST /api/students  — create student (Admin/Super Admin only)
 *
 * WHY $transaction for student creation: Creates both User and Student
 * records atomically. A partial write (User created but Student fails)
 * would leave an orphaned auth account with no profile.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { createStudentSchema, studentQuerySchema } from '@/lib/validation/student'
import { ensureActiveYearEnrollment } from '@/lib/students/enrollment-sync'
import { linkGuardianToStudentDirect } from '@/lib/students/guardian-link'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { hash } from '@node-rs/argon2'
import type { Role } from '@prisma/client'

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

// ── GET /api/students ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'students', 'read')) return errors.forbidden()
  if (role === 'STUDENT') return errors.forbidden('Students cannot access the directory')

  const { searchParams } = new URL(request.url)
  const parsed = studentQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const {
    page,
    limit,
    search,
    campusId,
    batchId,
    classId,
    section,
    enrollmentStatus,
    feeStatus,
    academicYear,
    houseId,
    shift,
    classSectionId,
    includeEnrollments,
  } = parsed.data

  // WHY campus scoping: Admin and Teacher can only see their campus students
  const scopedCampusId =
    role === 'SUPER_ADMIN' ? campusId : (session.user.campusId ?? undefined)

  const isNumericSearch = search ? /^\d+$/.test(search) : false;

  const where = {
    isActive: true,
    ...(scopedCampusId && { campusId: scopedCampusId }),
    ...(batchId && { batchId }),
    ...(classId && { classId }),
    ...(section && { section }),
    ...(enrollmentStatus && { enrollmentStatus }),
    ...(feeStatus && { feeStatus }),
    ...(academicYear && { academicYear }),
    ...(houseId && { houseId }),
    ...(shift && { shift }),
    ...(classSectionId && {
      enrollments: {
        some: {
          classSectionId,
          status: 'ACTIVE' as const,
        },
      },
    }),
    ...(search && {
      OR: isNumericSearch
        ? [
            { rollNumber: { contains: search } },
            { registrationNumber: { contains: search, mode: 'insensitive' as const } },
            { cnicBForm: { contains: search } },
          ]
        : [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { fatherName: { contains: search, mode: 'insensitive' as const } },
            { registrationNumber: { contains: search, mode: 'insensitive' as const } },
          ],
    }),
  }

  // Execute database operations in parallel (Promise.all is 2-3x faster than sequential transaction)
  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        registrationNumber: true,
        firstName: true,
        lastName: true,
        fatherName: true,
        gender: true,
        dateOfBirth: true,
        profilePicture: true,
        section: true,
        rollNumber: true,
        idCardQRCode: true,
        academicYear: true,
        enrollmentStatus: true,
        feeStatus: true,
        dueAmount: true,
        admissionDate: true,
        campus: { select: { id: true, name: true, code: true } },
        batch: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true, grade: true } },
        house: { select: { id: true, name: true, color: true } },
      },
    }),
  ])

  if (includeEnrollments && students.length > 0) {
    const activeYear = await getActiveAcademicYear()
    if (activeYear) {
      const studentIds = students.map((s) => s.id)
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId: activeYear.id,
          status: 'ACTIVE',
        },
        include: {
          classSection: {
            include: { shift: { select: { code: true, name: true } } },
          },
        },
      })
      const byStudent = new Map<string, typeof enrollments>()
      for (const e of enrollments) {
        const list = byStudent.get(e.studentId) ?? []
        list.push(e)
        byStudent.set(e.studentId, list)
      }
      const enriched = students.map((s) => ({
        ...s,
        activeEnrollments: byStudent.get(s.id) ?? [],
      }))
      return paginatedResponse(enriched, { page, limit, total })
    }
  }

  return paginatedResponse(students, { page, limit, total })
}

// ── POST /api/students ───────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'students', 'create')) return errors.forbidden()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = createStudentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  // Check for CNIC duplicate before starting transaction (avoids a wasted tx roundtrip)
  const existingCnic = await prisma.student.findUnique({
    where: { cnicBForm: data.cnicBForm },
    select: { id: true },
  })
  if (existingCnic) return errors.conflict('A student with this B-Form/CNIC already exists')

  // Generate registration number: ESA/YYYY/NNNN
  const year = new Date().getFullYear()
  const count = await prisma.student.count()
  const registrationNumber = `ESA/${year}/${String(count + 1).padStart(4, '0')}`

  // WHY hash before transaction: argon2 with memoryCost=65536 takes 2-4 seconds CPU-bound.
  // Running it inside $transaction consumes most of Prisma's 5-second interactive tx timeout,
  // leaving almost no budget for actual DB writes. Compute it here, outside any tx.
  const studentPasswordHash = await hash(
    data.parentEmail ? `ESA${data.cnicBForm.slice(-4)}` : `Student@${year}!`,
    ARGON2_OPTIONS
  )

  // WHY $transaction: User + Student must be created atomically.
  // If Student creation fails after User succeeds, the orphaned User
  // would allow login with no profile — a security and data integrity issue.
  let student: Awaited<ReturnType<typeof prisma.student.create>>
  try {
    student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email ?? `${registrationNumber.replace(/\//g, '.')}@students.evershineacademy.edu.pk`,
          passwordHash: studentPasswordHash,
          role: 'STUDENT',
          isActive: true,
        },
      })

      const newStudent = await tx.student.create({
        data: {
          userId: user.id,
          registrationNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          fatherName: data.fatherName,
          cnicBForm: data.cnicBForm,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          religion: data.religion,
          nationality: data.nationality,
          requestedLevel: data.requestedLevel,
          requestedClass: data.requestedClass ?? null,
          requestedGroup: data.requestedGroup || null,
          requestedGroupOther: data.requestedGroupOther || null,
          requestedCourses: data.requestedCourses || [],
          requestedCoursesOther: data.requestedCoursesOther || null,
          interviewInstitute: data.interviewInstitute || null,
          interviewMarksObtained: data.interviewMarksObtained ?? null,
          interviewPercentage: data.interviewPercentage || null,
          interviewYear: data.interviewYear ?? null,
          interviewGroup: data.interviewGroup || null,
          interviewDate: data.interviewDate ? new Date(data.interviewDate) : null,
          interviewerName: data.interviewerName || null,
          interviewOutcome: data.interviewOutcome || null,
          interviewNotes: data.interviewNotes || null,
          address: data.address,
          city: data.city,
          province: data.province,
          postalCode: data.postalCode,
          phoneNumber: data.phoneNumber,
          emergencyContact: data.emergencyContact,
          email: data.email || null,
          campusId: data.campusId,
          batchId: data.batchId,
          classId: data.classId || null,
          section: data.section || null,
          rollNumber: data.rollNumber || null,
          shift: data.shift ?? 'MORNING',
          deliveryMode: data.deliveryMode ?? 'PHYSICAL',
          houseId: data.houseId || null,
          academicYear: data.academicYear,
          totalFeeAmount: data.totalFeeAmount,
          dueAmount: data.totalFeeAmount,
          profilePicture: data.profilePicture || null,
          idCardQRCode: `ESA-QR-${registrationNumber.replace(/\//g, '-')}`,
        },
      })

      // Guardian linking intentionally NOT inside the transaction.
      // WHY: resolveGuardianId calls argon2 hash (CPU-bound, 2-4s) which
      // reliably exceeds Prisma's 5-second interactive transaction timeout,
      // producing P2028. Guardian link is non-atomic with student creation.
      // It runs after the tx commits via linkGuardianToStudentDirect.

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'Student',
          entityId: newStudent.id,
          changes: { registrationNumber, campusId: data.campusId },
        },
      })

      return newStudent
    })
  } catch (txErr: unknown) {
    // WHY: Prisma P2002 = unique constraint violation. Surface it as a 409 so the
    // frontend can show a field-level error (e.g. email already registered).
    const err = txErr as { code?: string; meta?: { target?: string[] } }
    if (err.code === 'P2002') {
      const target = err.meta?.target?.join(', ') ?? 'field'
      return errors.conflict(`Duplicate value for ${target}. Please check the email or CNIC.`)
    }
    console.error('[STUDENTS_POST] transaction error', txErr)
    return errors.internal()
  }

  // ── Guardian linking (post-transaction) ─────────────────────────────────
  // Runs AFTER the student tx commits. Argon2 hashing inside a tx causes P2028.
  let guardianId: string | null = null
  let guardianNote: string | null = null

  if (data.guardianCnic && data.guardianFirstName) {
    try {
      const result = await linkGuardianToStudentDirect(student.id, {
        firstName: data.guardianFirstName,
        lastName: data.guardianLastName,
        cnic: data.guardianCnic.replace(/\D/g, ''),
        phoneNumber: data.guardianPhone ?? data.emergencyContact,
        email: data.guardianEmail || undefined,
        relationship: data.guardianRelationship,
      })
      guardianId = result.guardianId
    } catch (guardianErr: unknown) {
      // Non-fatal: student created, guardian can be linked from profile
      console.error('[STUDENTS_POST] guardian link error', guardianErr)
      guardianNote = `Guardian account setup failed: ${getErrorMessage(guardianErr)}`
    }
  }

  let enrollmentId: string | null = null
  let enrollmentNote: string | null = null

  if (data.classSectionId) {
    try {
      const result = await ensureActiveYearEnrollment({
        studentId: student.id,
        rollNumber: data.rollNumber ?? student.registrationNumber.replace(/\//g, '-'),
        classSectionId: data.classSectionId,
        classId: data.classId,
        section: data.section,
        campusId: data.campusId,
        batchId: data.batchId,
        shift: data.shift,
        deliveryMode: data.deliveryMode,
      })
      enrollmentId = result?.enrollmentId ?? null
      if (!enrollmentId) {
        // No active/unlocked academic year — enrollment silently skipped
        enrollmentNote = 'No active academic year found. Enrollment was not created.'
      }
    } catch (enrollmentErr: unknown) {
      // Non-fatal: student created; admin can enroll manually from student profile
      console.error('[STUDENTS_POST] enrollment error', enrollmentErr)
      enrollmentNote = `Enrollment skipped: ${getErrorMessage(enrollmentErr)}`
    }
  }

  return createdResponse(
    {
      id: student.id,
      registrationNumber: student.registrationNumber,
      enrollmentId,
      guardianId,
      ...(enrollmentNote && { enrollmentNote }),
      ...(guardianNote && { guardianNote }),
    },
    `Student ${data.firstName} ${data.lastName} admitted successfully`
  )
}
