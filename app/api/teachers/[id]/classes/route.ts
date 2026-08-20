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

function isSuperAdminOrAdmin(role?: string): boolean {
  if (!role) return false
  const r = role.toUpperCase().replace(/[^A-Z]/g, '')
  return r.includes('SUPERADMIN') || r.includes('ADMIN')
}

function isStrictAdmin(role?: string): boolean {
  if (!role) return false
  const r = role.toUpperCase().replace(/[^A-Z]/g, '')
  return r === 'ADMIN' || r === 'ADMINISTRATOR'
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
  isClassTeacher?: boolean
}) {
  const { teacherId, classSection, academicYear, isClassTeacher = false } = params
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
    update: { isClassTeacher },
    create: {
      classId: legacyClass.id,
      teacherId,
      academicYear,
      isClassTeacher,
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
  if (isStrictAdmin(session.user.role) && teacher.campusId !== session.user.campusId) {
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

    if (isStrictAdmin(session.user.role) && teacher.campusId !== session.user.campusId) {
      return errors.forbidden('Admin can only manage teachers in their assigned campus')
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
        if (isSuperAdminOrAdmin(session.user.role)) {
          // Auto-align teacher's primary campus when Superadmin/Admin assigns section from another campus
          await prisma.teacher.update({
            where: { id },
            data: { campusId: section.campusId },
          })
        } else {
          return errors.forbidden('Class section does not belong to the teacher\'s campus')
        }
      }

      let academicYearRecord = await prisma.academicYear.findFirst({
        where: { name: academicYear },
        select: { id: true, name: true },
      })
      if (!academicYearRecord) {
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

      const result = await prisma.$transaction(async (tx) => {
        const assignment = await tx.teacherSectionAssignment.upsert({
          where: {
            teacherId_classSectionId_academicYearId: {
              teacherId: id,
              classSectionId,
              academicYearId: academicYearRecord.id,
            },
          },
          update: { isClassTeacher, status: 'ACTIVE' },
          create: {
            teacherId: id,
            classSectionId,
            academicYearId: academicYearRecord.id,
            isClassTeacher,
            status: 'ACTIVE',
          },
        })
        return { assignment, offering: null }
      })

      const assignment = result.assignment

      // Non-blocking audit log
      try {
        if (session.user.id) {
          await prisma.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'UPDATE',
              entityType: 'TeacherSectionAssignment',
              entityId: assignment.id,
              changes: {
                teacherId: id,
                classSectionId,
                academicYear: academicYearRecord.name,
                isClassTeacher,
              },
            },
          })
        }
      } catch (auditErr) {
        console.warn('[TEACHER_ASSIGNMENT_AUDIT_LOG_WARNING]', auditErr)
      }

      // Non-blocking legacy bridge sync
      try {
        await ensureLegacyClassTeacherBridge({
          teacherId: id,
          classSection: section,
          academicYear: academicYearRecord.name,
          isClassTeacher,
        })
      } catch (bridgeError) {
        console.error('[TEACHER_ASSIGNMENT_LEGACY_BRIDGE]', bridgeError)
      }

      return createdResponse(
        result,
        `Teacher assigned to ${section.className}-${section.sectionName} (${section.shift?.name || 'Default'}) for ${academicYearRecord.name}`
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
      if (isSuperAdminOrAdmin(session.user.role)) {
        await prisma.teacher.update({
          where: { id },
          data: { campusId: cls.campusId },
        })
      } else {
        return errors.forbidden('Class does not belong to the teacher\'s campus')
      }
    }

    const existing = await prisma.classTeacher.findUnique({
      where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
      select: { id: true },
    })

    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        return tx.classTeacher.update({
          where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
          data: { isClassTeacher },
        })
      })

      try {
        if (session.user.id) {
          await prisma.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'UPDATE',
              entityType: 'ClassTeacher',
              entityId: updated.id,
              changes: { teacherId: id, classId, isClassTeacher, academicYear },
            },
          })
        }
      } catch (auditErr) {
        console.warn('[TEACHER_ASSIGNMENT_AUDIT_LOG_WARNING]', auditErr)
      }

      return successResponse(updated, `Class assignment updated for ${cls.name}`)
    }

    const assignment = await prisma.$transaction(async (tx) => {
      return tx.classTeacher.create({
        data: { classId, teacherId: id, isClassTeacher, academicYear },
      })
    })

    try {
      if (session.user.id) {
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'CREATE',
            entityType: 'ClassTeacher',
            entityId: assignment.id,
            changes: { teacherId: id, classId, isClassTeacher, academicYear },
          },
        })
      }
    } catch (auditErr) {
      console.warn('[TEACHER_ASSIGNMENT_AUDIT_LOG_WARNING]', auditErr)
    }

    return createdResponse(assignment, `Teacher assigned to ${cls.name}`)
  } catch (err: any) {
    console.error('[TEACHER_CLASS_ASSIGN_POST]', err)
    return errors.badRequest(err?.message || 'Failed to assign class section')
  }
}

// ── DELETE /api/teachers/[id]/classes ────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

    if (isStrictAdmin(session.user.role) && teacher.campusId !== session.user.campusId) {
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

      const assignment = await prisma.teacherSectionAssignment.updateMany({
        where: {
          teacherId: id,
          classSectionId,
          academicYearId: academicYearRecord.id,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED' },
      })

      const offerings = await prisma.subjectOffering.findMany({
        where: {
          teacherId: id,
          classSectionId,
          academicYearId: academicYearRecord.id,
        },
        select: { id: true },
      })

      if (offerings.length > 0) {
        await prisma.subjectOffering.updateMany({
          where: {
            teacherId: id,
            classSectionId,
            academicYearId: academicYearRecord.id,
          },
          data: { teacherId: null },
        })

        try {
          if (session.user.id) {
            await prisma.auditLog.create({
              data: {
                userId: session.user.id,
                action: 'DELETE',
                entityType: 'SubjectOffering',
                entityId: offerings[0].id,
                changes: { teacherId: id, classSectionId, academicYear, count: offerings.length },
              },
            })
          }
        } catch (auditErr) {
          console.warn('[TEACHER_ASSIGNMENT_DELETE_AUDIT_LOG_WARNING]', auditErr)
        }
      }

      await prisma.timetableSlot.updateMany({
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
        const removed = await prisma.classTeacher.deleteMany({
          where: {
            classId: legacyClass.id,
            teacherId: id,
            academicYear,
          },
        })
        classTeacherRemoved = removed.count
      }

      if (assignment.count > 0) {
        try {
          if (session.user.id) {
            await prisma.auditLog.create({
              data: {
                userId: session.user.id,
                action: 'UPDATE',
                entityType: 'TeacherSectionAssignment',
                entityId: `${id}:${classSectionId}:${academicYearRecord.id}`,
                changes: { teacherId: id, classSectionId, academicYear, status: 'REVOKED' },
              },
            })
          }
        } catch (auditErr) {
          console.warn('[TEACHER_ASSIGNMENT_DELETE_AUDIT_LOG_WARNING]', auditErr)
        }
      }

      return successResponse(
        { classSectionId, teacherId: id },
        `Removed teacher from this section (${assignment.count} assignment revoked, ${offerings.length} subject assignment(s) cleared)`
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

    await prisma.classTeacher.delete({
      where: { classId_teacherId_academicYear: { classId, teacherId: id, academicYear } },
    })

    try {
      if (session.user.id) {
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'DELETE',
            entityType: 'ClassTeacher',
            entityId: assignment.id,
            changes: { teacherId: id, classId, academicYear },
          },
        })
      }
    } catch (auditErr) {
      console.warn('[TEACHER_ASSIGNMENT_DELETE_AUDIT_LOG_WARNING]', auditErr)
    }

    return successResponse({ classId, teacherId: id }, 'Class assignment removed')
  } catch (err: any) {
    console.error('[TEACHER_CLASS_ASSIGN_DELETE]', err)
    return errors.badRequest(err?.message || 'Failed to remove class assignment')
  }
}

