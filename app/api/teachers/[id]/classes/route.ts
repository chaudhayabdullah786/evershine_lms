/**
 * GET    /api/teachers/[id]/classes  — list all class assignments for a teacher
 * POST   /api/teachers/[id]/classes  — add a class assignment
 * DELETE /api/teachers/[id]/classes  — remove a class assignment
 *
 * WHY dual-path: The system maintains two class assignment models:
 * 1. Legacy: Class → ClassTeacher (no shift/delivery-mode awareness)
 * 2. Academic Engine: ClassSection → SubjectOffering (shift + delivery aware)
 *
 * GET returns a unified list from both sources.
 * POST accepts either classId (legacy) or classSectionId (new).
 * DELETE accepts either classId or classSectionId.
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
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ── Normalized assignment shape for the frontend ─────────────────────────────
// WHY: The frontend must render assignments from both legacy and new models
// in a single unified list. This shape abstracts the underlying storage model.
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
export async function GET(_req: NextRequest, { params }: RouteParams) {
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

  // ── Fetch from both sources in parallel ─────────────────────────────────
  const [legacyAssignments, subjectOfferings] = await Promise.all([
    // Legacy ClassTeacher records
    prisma.classTeacher.findMany({
      where: { teacherId: id },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            shift: true,
            academicYear: true,
            batch: { select: { id: true, name: true } },
            campus: { select: { id: true, name: true, code: true } },
            _count: { select: { students: true } },
          },
        },
      },
      orderBy: [{ academicYear: 'desc' }, { class: { grade: 'asc' } }],
    }),
    // Academic Engine SubjectOffering records
    prisma.subjectOffering.findMany({
      where: { teacherId: id },
      select: {
        id: true,
        classSectionId: true,
        academicYear: { select: { id: true, name: true } },
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
        subject: { select: { name: true, code: true } },
      },
      orderBy: [{ classSection: { grade: 'asc' } }, { classSection: { className: 'asc' } }],
    }),
  ])

  // ── Normalize legacy assignments ────────────────────────────────────────
  const legacyNormalized: NormalizedAssignment[] = legacyAssignments.map((a) => {
    const cls = a.class
    return {
      id: a.id,
      source: 'legacy' as const,
      classId: a.classId,
      className: cls?.name ?? 'Unknown',
      sectionName: cls?.section ?? undefined,
      shift: cls?.shift ?? undefined,
      shiftLabel: cls?.shift ?? undefined,
      grade: cls?.grade ?? null,
      academicYear: a.academicYear,
      isClassTeacher: a.isClassTeacher,
      campusName: cls?.campus?.name,
      campusCode: cls?.campus?.code,
      batchName: cls?.batch?.name,
      studentCount: cls?._count?.students ?? 0,
    }
  })

  // ── Normalize Academic Engine assignments ───────────────────────────────
  // WHY deduplicate by classSectionId: A teacher may have multiple SubjectOfferings
  // for the same section (e.g., Physics + Chemistry). We group by section and show
  // the section once with all subjects listed.
  const sectionMap = new Map<string, NormalizedAssignment>()
  for (const so of subjectOfferings) {
    const sec = so.classSection
    const key = `${so.classSectionId}::${so.academicYear.name}`
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        id: so.id,
        source: 'academic_engine',
        classSectionId: so.classSectionId,
        className: sec.className,
        sectionName: sec.sectionName,
        shift: sec.shift?.code,
        shiftLabel: sec.shift?.name,
        grade: sec.grade,
        academicYear: so.academicYear.name,
        isClassTeacher: false,
        campusName: sec.campus?.name,
        campusCode: sec.campus?.code,
        batchName: sec.batch?.name,
        studentCount: sec._count?.enrollments ?? 0,
        deliveryMode: sec.deliveryMode,
      })
    }
  }

  // ── Deduplicate mapped legacy/engine assignments ─────────────────────────
  // A class-incharge assignment is persisted on the compatibility
  // ClassTeacher row so result declaration has an explicit authority source.
  // Do not expose that bridge as a second class in the admin UI when the same
  // section already has an Academic Engine assignment.
  const engineAssignmentMeta = await Promise.all(
    Array.from(sectionMap.values()).map(async (assignment) => {
      const source = subjectOfferings.find((offering) =>
        offering.classSectionId === assignment.classSectionId && offering.academicYear.name === assignment.academicYear
      )
      if (!source) return { assignment, legacyClass: null }

      const legacyClass = await findLegacyClassForSection({
        grade: source.classSection.grade,
        sectionName: source.classSection.sectionName,
        campusId: source.classSection.campusId,
        batchId: source.classSection.batchId,
        shiftCode: source.classSection.shift?.code ?? source.classSection.shift?.name ?? 'MORNING',
        academicYear: assignment.academicYear,
      })
      const bridge = legacyClass
        ? legacyNormalized.find((legacy) => legacy.classId === legacyClass.id && legacy.academicYear === assignment.academicYear)
        : undefined

      return {
        assignment: { ...assignment, isClassTeacher: bridge?.isClassTeacher ?? false },
        legacyClass,
      }
    })
  )
  const engineAssignments = engineAssignmentMeta.map(({ assignment }) => assignment)
  const mappedLegacyKeys = new Set(
    engineAssignmentMeta
      .filter(({ legacyClass }) => Boolean(legacyClass))
      .map(({ assignment, legacyClass }) => `${legacyClass!.id}::${assignment.academicYear}`)
  )
  const filteredLegacy = legacyNormalized.filter((legacy) => !mappedLegacyKeys.has(`${legacy.classId}::${legacy.academicYear}`))

  const unified = [...filteredLegacy, ...engineAssignments]

  return successResponse(unified)
}

// ── POST /api/teachers/[id]/classes ──────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'update')) return errors.forbidden()

  const { id } = await params

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

    // Find the active academic year matching the year string
    const academicYearRecord = await prisma.academicYear.findFirst({
      where: { name: academicYear },
      select: { id: true },
    })
    if (!academicYearRecord) {
      return errors.notFound(`Academic year '${academicYear}' not found. Create it in the Academic Engine first.`)
    }

    // The Academic Engine stores subject assignments on SubjectOffering, while
    // class-incharge status still lives on the compatibility ClassTeacher join.
    // Persist the flag so the teacher-result declaration guard has one explicit,
    // auditable class-teacher source of truth.
    if (isClassTeacher) {
      await ensureLegacyClassTeacherBridge({
        teacherId: id,
        classSection: section,
        academicYear,
      })
    }

    // Check if teacher already has ANY subject offering for this section+year
    const existingOffering = await prisma.subjectOffering.findFirst({
      where: {
        teacherId: id,
        classSectionId,
        academicYearId: academicYearRecord.id,
      },
      select: { id: true },
    })
    if (existingOffering) {
      return successResponse(
        { id: existingOffering.id, classSectionId, teacherId: id },
        `Teacher is already assigned to ${section.className}-${section.sectionName} (${section.shift?.name})`
      )
    }

    // Find the first unassigned subject offering for this section, or create a general one
    const unassignedOffering = await prisma.subjectOffering.findFirst({
      where: {
        classSectionId,
        academicYearId: academicYearRecord.id,
        teacherId: null,
      },
      select: { id: true },
    })

    let result
    if (unassignedOffering) {
      // Assign teacher to an existing unassigned subject offering
      result = await prisma.$transaction(async (tx) => {
        const updated = await tx.subjectOffering.update({
          where: { id: unassignedOffering.id },
          data: { teacherId: id },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'SubjectOffering',
            entityId: updated.id,
            changes: { teacherId: id, classSectionId, isClassTeacher, academicYear },
          },
        })

        return updated
      })
    } else {
      // No unassigned offerings — find a subject to create a new offering for
      // WHY: If there are no subject offerings at all for this section, we still
      // need to link the teacher. We'll find the first academic subject or create
      // a generic "General" subject.
      let subjectId: string

      const existingSubject = await prisma.academicSubject.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { name: 'asc' },
      })

      if (existingSubject) {
        subjectId = existingSubject.id
      } else {
        // Create a fallback "General" subject
        const general = await prisma.academicSubject.create({
          data: { name: 'General', code: 'GEN', description: 'General class assignment' },
        })
        subjectId = general.id
      }

      // Check for unique constraint — same year+section+subject
      const existingExact = await prisma.subjectOffering.findUnique({
        where: {
          academicYearId_classSectionId_subjectId: {
            academicYearId: academicYearRecord.id,
            classSectionId,
            subjectId,
          },
        },
        select: { id: true, teacherId: true },
      })

      if (existingExact) {
        // Update existing offering's teacher
        result = await prisma.$transaction(async (tx) => {
          const updated = await tx.subjectOffering.update({
            where: { id: existingExact.id },
            data: { teacherId: id },
          })

          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'UPDATE',
              entityType: 'SubjectOffering',
              entityId: updated.id,
              changes: { teacherId: id, classSectionId, isClassTeacher, academicYear },
            },
          })

          return updated
        })
      } else {
        result = await prisma.$transaction(async (tx) => {
          const created = await tx.subjectOffering.create({
            data: {
              academicYearId: academicYearRecord.id,
              classSectionId,
              subjectId,
              teacherId: id,
            },
          })

          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'CREATE',
              entityType: 'SubjectOffering',
              entityId: created.id,
              changes: { teacherId: id, classSectionId, isClassTeacher, academicYear },
            },
          })

          return created
        })
      }
    }

    return createdResponse(result, `Teacher assigned to ${section.className}-${section.sectionName} (${section.shift?.name})`)
  }

  // ── Legacy path (classId) ─────────────────────────────────────────────────
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
}

// ── DELETE /api/teachers/[id]/classes ────────────────────────────────────────
// Body: { classId?: string, classSectionId?: string, academicYear: string }
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

    // Remove all SubjectOfferings for this teacher+section+year
    const deleted = await prisma.$transaction(async (tx) => {
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

      return { count: offerings.length, classTeacherRemoved }
    })

    return successResponse(
      { classSectionId, teacherId: id },
      `Removed ${deleted.count} subject assignment(s) from this section`
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
}
