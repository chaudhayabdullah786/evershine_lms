/**
 * GET    /api/teachers/[id]/classes  — list all class assignments for a teacher
 * POST   /api/teachers/[id]/classes  — add a class assignment
 * DELETE /api/teachers/[id]/classes  — remove a class assignment
 *
 * WHY dual-path writes: legacy Class → ClassTeacher remains available for
 * older integrations, while current portal reads use the Academic Engine's
 * canonical TeacherSectionAssignment table. POST/DELETE accept either a
 * legacy classId or an engine classSectionId for compatibility.
 *
 * RBAC: SUPER_ADMIN and ADMIN only for writes; read is open to TEACHER (own).
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { addClassAssignmentSchema } from '@/lib/validation/teacher'
import { sessionShiftSchema, type SessionShift } from '@/lib/validation/shift'
import { findLegacyClassForSection } from '@/lib/teacher-access'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ── Normalized assignment shape for the frontend ─────────────────────────────
// WHY: The frontend needs one stable shape for canonical engine assignments.
interface NormalizedAssignment {
  id: string
  source: 'legacy' | 'academic_engine'
  classId?: string
  classSectionId?: string
  className: string
  sectionName?: string
  shift?: string       // SessionShift code: MORNING | EVENING | NIGHT
  shiftLabel?: string  // Display label
  grade?: number | null
  academicYear: string
  isClassTeacher: boolean
  campusName?: string
  campusCode?: string
  batchName?: string
  studentCount?: number
  deliveryMode?: string
}

function extractLegacySectionName(sectionName: string): string {
  const parenthesized = sectionName.match(/\(([^)]+)\)/)
  if (parenthesized) return parenthesized[1].trim()
  const parts = sectionName.trim().split(/\s+/)
  return parts.length > 1 && parts.at(-1)?.length === 1
    ? parts.at(-1)!
    : sectionName.trim()
}

async function ensureLegacyClassTeacherBridge(params: {
  teacherId: string
  classSection: {
    grade: number | null
    sectionName: string
    campusId: string
    batchId: string
    shift: { code: string; name: string } | null
  }
  academicYear: string
}) {
  const { teacherId, classSection, academicYear } = params
  const shiftCode = (classSection.shift?.code ?? classSection.shift?.name ?? 'MORNING')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/SHIFT$/, '')
  const matched = await findLegacyClassForSection({
    grade: classSection.grade,
    sectionName: classSection.sectionName,
    campusId: classSection.campusId,
    batchId: classSection.batchId,
    shiftCode,
    academicYear,
  })

  let legacyClass = matched
  if (!legacyClass) {
    const parsedShift = sessionShiftSchema.safeParse(shiftCode)
    const shift: SessionShift = parsedShift.success ? parsedShift.data : 'MORNING'
    const grade = classSection.grade ?? 0
    const section = extractLegacySectionName(classSection.sectionName)
    legacyClass = await prisma.class.upsert({
      where: {
        grade_section_campusId_academicYear_shift: {
          grade,
          section,
          campusId: classSection.campusId,
          academicYear,
          shift,
        },
      },
      update: { isActive: true },
      create: {
        name: `Class ${grade} - ${shift} (${section})`,
        grade,
        section,
        campusId: classSection.campusId,
        batchId: classSection.batchId,
        academicYear,
        shift,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        section: true,
        batchId: true,
        shift: true,
        campusId: true,
        grade: true,
        academicYear: true,
      },
    })
  }

  return prisma.classTeacher.upsert({
    where: {
      classId_teacherId_academicYear: {
        classId: legacyClass.id,
        teacherId,
        academicYear,
      },
    },
    update: { isClassTeacher: true },
    create: {
      classId: legacyClass.id,
      teacherId,
      academicYear,
      isClassTeacher: true,
    },
    select: { id: true, classId: true, teacherId: true, academicYear: true, isClassTeacher: true },
  })
}

// ── GET /api/teachers/[id]/classes ───────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'read')) return errors.forbidden()

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, campusId: true, userId: true },
  })
  if (!teacher) return errors.notFound('Teacher')

  // Row-level: teachers can only see their own class list
  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }

  // Campus scope for ADMIN
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const requestedYear = searchParams.get('academicYear')
  const activeYear = requestedYear
    ? await prisma.academicYear.findFirst({ where: { name: requestedYear }, select: { id: true, name: true } })
    : await getActiveAcademicYear()
  if (!activeYear) return successResponse([])

  const assignments = await prisma.teacherSectionAssignment.findMany({
    where: {
      teacherId: id,
      academicYearId: activeYear.id,
      status: 'ACTIVE',
      classSection: { isActive: true },
    },
    include: {
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          campusId: true,
          batchId: true,
          deliveryMode: true,
          campus: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true } },
          shift: { select: { code: true, name: true } },
          _count: { select: { enrollments: true } },
        },
      },
    },
    orderBy: [{ classSection: { grade: 'asc' } }, { classSection: { className: 'asc' } }],
  })

  const normalized: NormalizedAssignment[] = assignments.map((assignment) => {
    const section = assignment.classSection
    return {
      id: assignment.id,
      source: 'academic_engine',
      classSectionId: section.id,
      className: section.className,
      sectionName: section.sectionName,
      shift: section.shift?.code,
      shiftLabel: section.shift?.name,
      grade: section.grade,
      academicYear: activeYear.name,
      isClassTeacher: assignment.isClassTeacher,
      campusName: section.campus?.name,
      campusCode: section.campus?.code,
      batchName: section.batch?.name,
      studentCount: section._count.enrollments,
      deliveryMode: section.deliveryMode,
    }
  })

  return successResponse(normalized)
}

// ── POST /api/teachers/[id]/classes ──────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'update')) return errors.forbidden()

  const { id } = await params

  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { id: true, campusId: true, isActive: true },
    })
    if (!teacher) return errors.notFound('Teacher')
    if (!teacher.isActive) return errors.forbidden('Cannot assign classes to an inactive teacher')

    if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
      return errors.forbidden()
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
    }

    const parsed = addClassAssignmentSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const { classId, classSectionId, isClassTeacher, academicYear } = parsed.data

    // ── Academic Engine path (preferred) ──────────────────────────────────────
    if (classSectionId) {
      const section = await prisma.classSection.findUnique({
        where: { id: classSectionId },
        select: {
          id: true,
          campusId: true,
          className: true,
          sectionName: true,
          grade: true,
          batchId: true,
          shift: { select: { code: true, name: true } },
        },
      })
      if (!section) return errors.notFound('Class Section')
      if (section.campusId !== teacher.campusId) {
        if (['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
          // Auto-align teacher's primary campus when Superadmin/Admin assigns section from another campus
          await prisma.teacher.update({
            where: { id },
            data: { campusId: section.campusId },
          })
        } else {
          return errors.forbidden('Class section does not belong to the teacher\'s campus')
        }
      }

      // WHY: Resolve the academic year from the supplied string. If the client
      // sends a year that doesn't exist in DB (e.g., default 2026-2027 while
      // the active year is 2025-2026), fall back to the currently-active year
      // rather than hard-failing. This prevents 500s from frontend year defaults
      // that lag behind the actual active academic year in the system.
      let academicYearRecord = await prisma.academicYear.findFirst({
        where: { name: academicYear },
        select: { id: true, name: true },
      })
      if (!academicYearRecord) {
        // Fallback: use the active academic year
        academicYearRecord = await prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true, name: true },
        })
      }
      if (!academicYearRecord) {
        return errors.badRequest(
          `Academic year '${academicYear}' was not found and no active academic year exists. ` +
          'Please create and activate an academic year in the Academic Engine first.'
        )
      }

      // Section scope and subject ownership are separate concerns. Persist only
      // the canonical section assignment here; a subject offering must be
      // assigned explicitly through the subject-offering workflow and must never
      // be selected arbitrarily as a side effect of assigning a section.
      const result = await prisma.$transaction(async (tx) => {
        const assignment = await tx.teacherSectionAssignment.upsert({
          where: {
            teacherId_classSectionId_academicYearId: {
              teacherId: id,
              classSectionId,
              academicYearId: academicYearRecord!.id,
            },
          },
          update: { isClassTeacher, status: 'ACTIVE' },
          create: {
            teacherId: id,
            classSectionId,
            academicYearId: academicYearRecord!.id,
            isClassTeacher,
            status: 'ACTIVE',
          },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'TeacherSectionAssignment',
            entityId: assignment.id,
            changes: {
              teacherId: id,
              classSectionId,
              academicYear: academicYearRecord!.name,
              isClassTeacher,
            },
          },
        })

        return { assignment, offering: null }
      })

      // Keep the legacy bridge available for old declaration workflows, but do
      // it after the canonical write so a bridge failure can never leave a
      // legacy assignment that grants access without a canonical assignment.
      if (isClassTeacher) {
        try {
          await ensureLegacyClassTeacherBridge({
            teacherId: id,
            classSection: section,
            academicYear: academicYearRecord.name,
          })
        } catch (bridgeError) {
          console.error('[TEACHER_ASSIGNMENT_LEGACY_BRIDGE]', bridgeError)
        }
      }

      return createdResponse(
        result,
        `Teacher assigned to ${section.className}-${section.sectionName} (${section.shift?.name}) for ${academicYearRecord.name}`
      )
    }

    // ── Legacy path (classId) ───────────────────────────────────────────────
    if (!classId) {
      return errors.validation({ errors: [{ path: ['classId'], message: 'classId or classSectionId is required' }] } as never)
    }

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, campusId: true, name: true },
    })
    if (!cls) return errors.notFound('Class')
    if (cls.campusId !== teacher.campusId) {
      if (['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
        await prisma.teacher.update({
          where: { id },
          data: { campusId: cls.campusId },
        })
      } else {
        return errors.forbidden('Class does not belong to the teacher\'s campus')
      }
    }

    // Check for existing assignment — prevent duplicate
    const existing = await prisma.classTeacher.findUnique({
      where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
      select: { id: true },
    })
    if (existing) {
      // If already exists, do an update (promote/demote class teacher status)
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.classTeacher.update({
          where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
          data: { isClassTeacher },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'ClassTeacher',
            entityId: result.id,
            changes: { teacherId: id, classId, isClassTeacher, academicYear },
          },
        })

        return result
      })

      return successResponse(updated, `Class assignment updated for ${cls.name}`)
    }

    // Create new legacy assignment
    const assignment = await prisma.$transaction(async (tx) => {
      const result = await tx.classTeacher.create({
        data: { classId, teacherId: id, isClassTeacher, academicYear },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'ClassTeacher',
          entityId: result.id,
          changes: { teacherId: id, classId, isClassTeacher, academicYear },
        },
      })

      return result
    })

    return createdResponse(assignment, `Teacher assigned to ${cls.name}`)
  } catch (err) {
    console.error('[TEACHER_CLASS_ASSIGN_POST]', err)
    return errors.internal()
  }
}

// ── DELETE /api/teachers/[id]/classes ────────────────────────────────────────
// Body: { classId?: string, classSectionId?: string, academicYear: string }
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  // WHY outer try/catch: Prisma transaction errors must never escape as
  // unhandled exceptions — Next.js returns a structureless 500 in that case.
  try {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'update')) return errors.forbidden()

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, campusId: true },
  })
  if (!teacher) return errors.notFound('Teacher')

  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const { classId, classSectionId, academicYear } = body as {
    classId?: string
    classSectionId?: string
    academicYear?: string
  }

  if (!academicYear) {
    return errors.validation({
      errors: [{ path: ['academicYear'], message: 'academicYear is required' }],
    } as never)
  }

  // ── Academic Engine deletion path ─────────────────────────────────────────
  if (classSectionId) {
    const academicYearRecord = await prisma.academicYear.findFirst({
      where: { name: academicYear },
      select: { id: true },
    })

    if (!academicYearRecord) {
      return errors.notFound('Academic year')
    }

    const section = await prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: {
        grade: true,
        sectionName: true,
        campusId: true,
        batchId: true,
        shift: { select: { code: true, name: true } },
      },
    })
    const legacyClass = section
      ? await findLegacyClassForSection({
          grade: section.grade,
          sectionName: section.sectionName,
          campusId: section.campusId,
          batchId: section.batchId,
          shiftCode: section.shift?.code ?? section.shift?.name ?? 'MORNING',
          academicYear,
        })
      : null

    // Revoke the canonical section assignment. Historical records remain for
    // audit, but they must no longer grant current portal access.
    const deleted = await prisma.$transaction(async (tx) => {
      const assignment = await tx.teacherSectionAssignment.updateMany({
        where: {
          teacherId: id,
          classSectionId,
          academicYearId: academicYearRecord.id,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED' },
      })

      const offerings = await tx.subjectOffering.findMany({
        where: {
          teacherId: id,
          classSectionId,
          academicYearId: academicYearRecord.id,
        },
        select: { id: true },
      })

      if (offerings.length > 0) {
        // Unassign teacher from offerings (set teacherId to null) rather than deleting
        // WHY: SubjectOffering may have linked SubjectEnrollments, scores, etc.
        // Deleting would cascade-orphan student data. Nulling teacherId is safer.
        await tx.subjectOffering.updateMany({
          where: {
            teacherId: id,
            classSectionId,
            academicYearId: academicYearRecord.id,
          },
          data: { teacherId: null },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'DELETE',
            entityType: 'SubjectOffering',
            entityId: offerings[0].id,
            changes: { teacherId: id, classSectionId, academicYear, count: offerings.length },
          },
        })
      }

      // Do not rewrite published historical slots. Unpublish/remove the
      // teacher reference only on drafts; published records remain immutable
      // audit history and are excluded by current assignment scope.
      await tx.timetableSlot.updateMany({
        where: {
          teacherId: id,
          classSectionId,
          academicYearId: academicYearRecord.id,
          isPublished: false,
        },
        data: { teacherId: null },
      })

      let classTeacherRemoved = 0
      if (legacyClass) {
        const removed = await tx.classTeacher.deleteMany({
          where: {
            classId: legacyClass.id,
            teacherId: id,
            academicYear,
            isClassTeacher: true,
          },
        })
        classTeacherRemoved = removed.count
      }

      if (assignment.count > 0) {
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'TeacherSectionAssignment',
            entityId: `${id}:${classSectionId}:${academicYearRecord.id}`,
            changes: { teacherId: id, classSectionId, academicYear, status: 'REVOKED' },
          },
        })
      }

      return { count: offerings.length, classTeacherRemoved, assignmentRevoked: assignment.count }
    })

    return successResponse(
      { classSectionId, teacherId: id },
      `Removed teacher from this section (${deleted.assignmentRevoked} assignment revoked, ${deleted.count} subject assignment(s) cleared)`
    )
  }

  // ── Legacy deletion path ──────────────────────────────────────────────────
  if (!classId) {
    return errors.validation({
      errors: [{ path: ['classId', 'classSectionId'], message: 'classId or classSectionId is required' }],
    } as never)
  }

  const assignment = await prisma.classTeacher.findUnique({
    where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
    select: { id: true },
  })
  if (!assignment) return errors.notFound('Class assignment')

  await prisma.$transaction(async (tx) => {
    await tx.classTeacher.delete({
      where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'ClassTeacher',
        entityId: assignment.id,
        changes: { teacherId: id, classId, academicYear },
      },
    })
  })

    return successResponse({ classId, teacherId: id }, 'Class assignment removed')
  } catch (err) {
    console.error('[TEACHER_CLASS_ASSIGN_DELETE]', err)
    return errors.internal()
  }
}
