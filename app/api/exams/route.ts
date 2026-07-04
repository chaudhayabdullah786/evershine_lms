/**
 * GET  /api/exams
 * POST /api/exams
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import type { Prisma, Role, SessionShift } from '@prisma/client'
import { z } from 'zod'

// WHY: Extract a numeric grade from className strings like "Class 9", "Class 10th",
// "Class 9th Parwaz" — covers all naming conventions used in this institution.
function inferGradeFromClassName(className: string): number | null {
  const match = className.match(/\b(\d+)(?:st|nd|rd|th)?\b/)
  return match ? parseInt(match[1], 10) : null
}

const createExamSchema = z.object({
  name: z.string().min(2),
  classIds: z.array(z.string().min(1)).default([]),
  classSectionIds: z.array(z.string().min(1)).default([]),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  totalMarks: z.number().int().min(10).default(100),
}).refine((data) => data.classIds.length > 0 || data.classSectionIds.length > 0, {
  path: ['classIds'],
  message: 'Select at least one class or Academic Engine section',
})

function canAccessCampus(sessionUser: { role: string; campusId?: string | null }, campusId: string) {
  if (sessionUser.role === 'SUPER_ADMIN') return true
  if (sessionUser.role === 'ADMIN') return !sessionUser.campusId || sessionUser.campusId === campusId
  return sessionUser.campusId === campusId
}

function toSessionShift(code: string | null | undefined): SessionShift {
  if (code === 'EVENING' || code === 'NIGHT') return code
  return 'MORNING'
}

function buildLegacyClassName(section: {
  className: string
  sectionName: string
  shift?: { name: string; code: string } | null
}) {
  const bits = [section.className, section.sectionName, section.shift?.name].filter(Boolean)
  return bits.join(' - ')
}

async function resolveExamClassTargets(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof createExamSchema>,
  sessionUser: { id: string; role: string; campusId?: string | null },
) {
  const legacyClassIds = [...new Set(data.classIds)]
  const sectionIds = [...new Set(data.classSectionIds)]

  const legacyClasses = legacyClassIds.length > 0
    ? await tx.class.findMany({
        where: { id: { in: legacyClassIds }, isActive: true },
        select: { id: true, campusId: true },
      })
    : []

  if (legacyClasses.length !== legacyClassIds.length) {
    return { error: errors.notFound('One or more classes not found') }
  }

  const deniedLegacyClass = legacyClasses.find((cls) => !canAccessCampus(sessionUser, cls.campusId))
  if (deniedLegacyClass) return { error: errors.forbidden() }

  const resolvedClassIds = new Set(legacyClasses.map((cls) => cls.id))

  if (sectionIds.length > 0) {
    const sections = await tx.classSection.findMany({
      where: { id: { in: sectionIds }, isActive: true },
      include: { shift: { select: { name: true, code: true } } },
    })

    if (sections.length !== sectionIds.length) {
      return { error: errors.notFound('One or more Academic Engine class sections not found') }
    }

    for (const section of sections) {
      if (!canAccessCampus(sessionUser, section.campusId)) {
        return { error: errors.forbidden() }
      }
      if (!section.grade) {
        // WHY: Sections created in the Academic Engine without an explicit numeric grade
        // are still schedulable — attempt to infer the grade from the className
        // (e.g. "Class 10th Parwaz" → 10). Only reject if inference also fails.
        const inferred = inferGradeFromClassName(section.className)
        if (!inferred) {
          return {
            error: errors.validation({
              errors: [{
                path: ['classSectionIds'],
                message: `${section.className} ${section.sectionName} has no numeric grade. Set a grade in Academic Engine before scheduling exams.`,
              }],
            } as never),
          }
        }
        // Mutate in-memory only — no DB write. The auto-bridge Class record below
        // will carry the inferred grade; the ClassSection record itself is not modified
        // here to avoid unintended side effects on other academic workflows.
        ;(section as { grade: number | null }).grade = inferred
      }

      const shift = toSessionShift(section.shift?.code)
      const legacySection = section.sectionName?.trim() || null
      const existing = await tx.class.findUnique({
        where: {
          grade_section_campusId_academicYear_shift: {
            grade: section.grade,
            section: legacySection ?? '',
            campusId: section.campusId,
            academicYear: data.academicYear,
            shift,
          },
        },
        select: { id: true },
      })

      if (existing) {
        resolvedClassIds.add(existing.id)
        continue
      }

      const created = await tx.class.create({
        data: {
          name: buildLegacyClassName(section),
          grade: section.grade,
          section: legacySection,
          shift,
          campusId: section.campusId,
          batchId: section.batchId,
          academicYear: data.academicYear,
          capacity: section.capacity,
        },
        select: { id: true },
      })

      await tx.auditLog.create({
        data: {
          userId: sessionUser.id,
          action: 'CREATE',
          entityType: 'Class',
          entityId: created.id,
          changes: {
            source: 'AcademicEngineClassSectionExamBridge',
            classSectionId: section.id,
            academicYear: data.academicYear,
          },
        },
      })

      resolvedClassIds.add(created.id)
    }
  }

  return { classIds: [...resolvedClassIds] }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('classId')
  const academicYear = searchParams.get('academicYear')

  const scopedCampusId = (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') ? session.user.campusId : undefined

  let scopedClassId = undefined
  if (session.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: session.user.id }, select: { classId: true } })
    if (student?.classId) scopedClassId = student.classId
  }

  const where = {
    ...(classId && { classId }),
    ...(academicYear && { academicYear }),
    ...(session.user.role === 'STUDENT'
      ? (scopedClassId ? { classId: scopedClassId } : { id: 'no-match' })
      : (scopedCampusId ? { class: { campusId: scopedCampusId } } : {})),
    isActive: true,
  }

  const exams = await prisma.exam.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      class: { select: { name: true, campusId: true, grade: true, section: true } },
      _count: { select: { results: true } },
    },
  })

  return successResponse(exams)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createExamSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const result = await prisma.$transaction(async (tx) => {
    const resolved = await resolveExamClassTargets(tx, data, session.user)
    if ('error' in resolved) return { error: resolved.error }

    const exams = []
    for (const classId of resolved.classIds) {
      const examData = {
        name: data.name,
        academicYear: data.academicYear,
        startDate: data.startDate,
        endDate: data.endDate,
        totalMarks: data.totalMarks,
        classId,
      }
      const newExam = await tx.exam.create({ data: examData })
      exams.push(newExam)

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'Exam',
          entityId: newExam.id,
          changes: examData,
        },
      })
    }

    return { exams }
  })

  if ('error' in result) return result.error
  return createdResponse(result.exams, `${result.exams.length} exam(s) scheduled successfully`)
}
