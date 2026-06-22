/**
 * GET  /api/teacher-portal/targets?classSectionId={id}
 * POST /api/teacher-portal/targets
 *
 * Teacher-scoped target assignment CRUD.
 *
 * GET  — Returns all TargetAssignment records for a given class section,
 *        enriched with student name, roll number, and current daily performance.
 *
 * POST — Bulk upserts targets for students in a class section.
 *        Uses @@unique([studentId, subjectOfferingId]) for idempotent upsert.
 *
 * Authorization: TEACHER (own sections only), ADMIN, SUPER_ADMIN
 *
 * WHY separate from grade-entry: Targets are motivational/aspirational goals,
 * not academic evaluation records. They influence student portal UI but have
 * no bearing on official results or transcripts.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

// ─── Validation Schemas ─────────────────────────────────────────────────────

const getQuerySchema = z.object({
  classSectionId: z.string().min(1, 'classSectionId is required'),
})

const targetItemSchema = z.object({
  studentId: z.string().min(1),
  subjectOfferingId: z.string().min(1),
  targetGrade: z.string().min(1).max(5), // e.g. "A+", "A", "B", "C", "D", "F"
  minPercentage: z.coerce.number().min(0).max(100),
  maxPercentage: z.coerce.number().min(0).max(100),
})

const postBodySchema = z.object({
  classSectionId: z.string().min(1),
  targets: z.array(targetItemSchema).min(1, 'At least one target is required'),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verifies the requesting user has access to the given class section.
 * Teachers: must have at least one SubjectOffering in that section.
 * Admin/SuperAdmin: unrestricted.
 */
async function verifyAccess(
  userId: string,
  role: string,
  classSectionId: string
): Promise<{ authorised: boolean; teacherId?: string }> {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return { authorised: true }
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!teacher) return { authorised: false }

  const offeringCount = await prisma.subjectOffering.count({
    where: {
      teacherId: teacher.id,
      classSectionId,
    },
  })

  return { authorised: offeringCount > 0, teacherId: teacher.id }
}

// ─── GET Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()

    const allowedRoles = ['TEACHER', 'ADMIN', 'SUPER_ADMIN']
    if (!allowedRoles.includes(session.user.role as string)) {
      return errors.forbidden()
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) return errors.validation(parsed.error)

    const { classSectionId } = parsed.data

    // Verify access
    const { authorised } = await verifyAccess(
      session.user.id,
      session.user.role as string,
      classSectionId
    )
    if (!authorised) {
      return errors.forbidden('You are not assigned to this class section')
    }

    // Fetch enrolled students with their targets and current performance
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
      },
      select: {
        studentId: true,
        rollNumber: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            registrationNumber: true,
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })

    // Fetch subject offerings for this section
    const offerings = await prisma.subjectOffering.findMany({
      where: { classSectionId },
      select: {
        id: true,
        subject: { select: { id: true, name: true, code: true } },
      },
    })

    // Fetch existing targets for all students in this section
    const studentIds = enrollments.map((e) => e.studentId)
    const offeringIds = offerings.map((o) => o.id)

    const existingTargets = await prisma.targetAssignment.findMany({
      where: {
        studentId: { in: studentIds },
        subjectOfferingId: { in: offeringIds },
      },
      select: {
        id: true,
        studentId: true,
        subjectOfferingId: true,
        targetGrade: true,
        minPercentage: true,
        maxPercentage: true,
        updatedAt: true,
      },
    })

    // Build a lookup map: studentId:subjectOfferingId -> target
    const targetMap = new Map(
      existingTargets.map((t) => [
        `${t.studentId}:${t.subjectOfferingId}`,
        {
          id: t.id,
          targetGrade: t.targetGrade,
          minPercentage: Number(t.minPercentage),
          maxPercentage: Number(t.maxPercentage),
          updatedAt: t.updatedAt,
        },
      ])
    )

    // Build response
    const studentsWithTargets = enrollments.map((enr) => ({
      studentId: enr.studentId,
      rollNumber: enr.rollNumber,
      name: `${enr.student.firstName} ${enr.student.lastName}`,
      registrationNumber: enr.student.registrationNumber,
      targets: offerings.map((off) => {
        const existing = targetMap.get(`${enr.studentId}:${off.id}`)
        return {
          subjectOfferingId: off.id,
          subjectName: off.subject.name,
          subjectCode: off.subject.code,
          targetGrade: existing?.targetGrade ?? null,
          minPercentage: existing?.minPercentage ?? null,
          maxPercentage: existing?.maxPercentage ?? null,
        }
      }),
    }))

    return successResponse({
      classSectionId,
      offerings: offerings.map((o) => ({
        id: o.id,
        subjectName: o.subject.name,
        subjectCode: o.subject.code,
      })),
      students: studentsWithTargets,
    })
  } catch (err) {
    console.error('[TEACHER_TARGETS_GET]', err)
    return errors.internal()
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()

    const allowedRoles = ['TEACHER', 'ADMIN', 'SUPER_ADMIN']
    if (!allowedRoles.includes(session.user.role as string)) {
      return errors.forbidden()
    }

    const body = await request.json()
    const parsed = postBodySchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const { classSectionId, targets } = parsed.data

    // Verify access
    const { authorised } = await verifyAccess(
      session.user.id,
      session.user.role as string,
      classSectionId
    )
    if (!authorised) {
      return errors.forbidden('You are not assigned to this class section')
    }

    // Validate all subjectOfferingIds belong to this section
    const validOfferings = await prisma.subjectOffering.findMany({
      where: {
        classSectionId,
        id: { in: targets.map((t) => t.subjectOfferingId) },
      },
      select: { id: true },
    })
    const validOfferingIds = new Set(validOfferings.map((o) => o.id))

    const invalidTargets = targets.filter(
      (t) => !validOfferingIds.has(t.subjectOfferingId)
    )
    if (invalidTargets.length > 0) {
      return errors.badRequest(
        `Invalid subjectOfferingIds: ${invalidTargets.map((t) => t.subjectOfferingId).join(', ')}`
      )
    }

    // Validate all studentIds are enrolled in this section
    const validEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
        studentId: { in: targets.map((t) => t.studentId) },
      },
      select: { studentId: true },
    })
    const validStudentIds = new Set(validEnrollments.map((e) => e.studentId))

    const invalidStudents = targets.filter(
      (t) => !validStudentIds.has(t.studentId)
    )
    if (invalidStudents.length > 0) {
      return errors.badRequest(
        `Students not enrolled in this section: ${invalidStudents.map((t) => t.studentId).join(', ')}`
      )
    }

    // Bulk upsert targets in a single transaction
    const results = await prisma.$transaction(
      targets.map((t) =>
        prisma.targetAssignment.upsert({
          where: {
            studentId_subjectOfferingId: {
              studentId: t.studentId,
              subjectOfferingId: t.subjectOfferingId,
            },
          },
          create: {
            studentId: t.studentId,
            subjectOfferingId: t.subjectOfferingId,
            targetGrade: t.targetGrade,
            minPercentage: t.minPercentage,
            maxPercentage: t.maxPercentage,
            assignedById: session.user.id,
          },
          update: {
            targetGrade: t.targetGrade,
            minPercentage: t.minPercentage,
            maxPercentage: t.maxPercentage,
            assignedById: session.user.id,
          },
        })
      )
    )

    return successResponse({
      message: `${results.length} target(s) assigned successfully`,
      count: results.length,
    })
  } catch (err) {
    console.error('[TEACHER_TARGETS_POST]', err)
    return errors.internal()
  }
}
