/**
 * GET /api/teachers/[id]/timetable
 *
 * Academic Engine is the canonical timetable source. Legacy Timetable rows
 * are intentionally not merged because they have no reliable academic-year
 * ownership and can surface stale or false records in current portals.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { timetableQuerySchema } from '@/lib/validation/teacher'
import { getTeacherAssignedSectionIds } from '@/lib/academic/teacher-assignments'
import type { Role } from '@prisma/client'

// Never serve a cached timetable after an admin deletes or republishes slots.
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'read')) return errors.forbidden()

  const { id } = await params
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: {
      id: true,
      campusId: true,
      userId: true,
    },
  })
  if (!teacher) return errors.notFound('Teacher')

  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const parsed = timetableQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const activeYear = await getActiveAcademicYear()
  const requestedYear = parsed.data.academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: parsed.data.academicYearId },
        select: { id: true, name: true },
      })
    : parsed.data.academicYear
      ? await prisma.academicYear.findFirst({
          where: { name: parsed.data.academicYear },
          select: { id: true, name: true },
        })
      : activeYear

  if (!requestedYear) return errors.notFound('Academic year')
  if (session.user.role === 'TEACHER' && (!activeYear || requestedYear.id !== activeYear.id)) {
    return errors.forbidden('Teachers can only view the active academic year timetable')
  }

  const assignedSectionIds = await getTeacherAssignedSectionIds(id, requestedYear.id)
  if (assignedSectionIds.length === 0) return successResponse([])

  const entries = await prisma.timetableSlot.findMany({
    where: {
      teacherId: id,
      academicYearId: requestedYear.id,
      classSectionId: { in: assignedSectionIds },
      isPublished: true,
      ...(parsed.data.dayOfWeek !== undefined
        ? { dayOfWeek: parsed.data.dayOfWeek + 1 }
        : {}),
      ...(parsed.data.shift
        ? { classSection: { shift: { code: parsed.data.shift } } }
        : {}),
    },
    include: {
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          shift: { select: { id: true, name: true, code: true } },
        },
      },
      subjectOffering: {
        select: {
          id: true,
          subject: { select: { id: true, name: true } },
        },
      },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  return successResponse(entries.map((entry) => ({
    id: entry.id,
    academicYearId: requestedYear.id,
    academicYear: requestedYear.name,
    dayOfWeek: entry.dayOfWeek - 1,
    startTime: entry.startTime,
    endTime: entry.endTime,
    subjectName: entry.subjectOffering.subject.name,
    className: entry.classSection.className,
    sectionName: entry.classSection.sectionName,
    shift: entry.classSection.shift?.code ?? null,
    teacher: entry.teacher,
    source: 'engine' as const,
  })))
}
