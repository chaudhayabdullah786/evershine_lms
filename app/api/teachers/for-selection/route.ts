/**
 * GET /api/teachers/for-selection
 *
 * Teachers for admin dropdowns (timetable, assignments).
 * ?mode=all — all active teachers (optional campus/batch/house filters)
 * ?mode=scoped — teachers assigned to classId and/or matching placement filters
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const querySchema = z.object({
  mode: z.enum(['all', 'scoped']).default('all'),
  campusId: z.string().cuid().optional(),
  batchId: z.string().cuid().optional(),
  classId: z.string().cuid().optional(),
  houseId: z.string().cuid().optional(),
  shift: z.enum(['MORNING', 'EVENING', 'NIGHT']).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'read')) return errors.forbidden()

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { mode, campusId, batchId, classId, houseId, search, limit } = parsed.data

  const scopedCampusId =
    session.user.role === 'SUPER_ADMIN'
      ? campusId
      : (campusId ?? session.user.campusId ?? undefined)

  const teacherSelect = {
    id: true,
    employeeId: true,
    firstName: true,
    lastName: true,
    designation: true,
    specialization: true,
    isActive: true,
    campusId: true,
    batchId: true,
    houseId: true,
    campus: { select: { id: true, name: true } },
    batch: { select: { id: true, name: true } },
    house: { select: { id: true, name: true } },
  } as const

  let teacherIds: string[] | undefined

  if (mode === 'scoped') {
    const idSet = new Set<string>()

    if (classId) {
      const [classTeachers, subjectTeachers] = await Promise.all([
        prisma.classTeacher.findMany({
          where: { classId },
          select: { teacherId: true },
        }),
        prisma.subjectTeacher.findMany({
          where: { subject: { classId } },
          select: { teacherId: true },
        }),
      ])
      classTeachers.forEach((r) => idSet.add(r.teacherId))
      subjectTeachers.forEach((r) => idSet.add(r.teacherId))

      const classTimetableTeachers = await prisma.timetable.findMany({
        where: { classId, isActive: true },
        select: { teacherId: true },
        distinct: ['teacherId'],
      })
      classTimetableTeachers.forEach((r) => idSet.add(r.teacherId))
    }

    const placementMatches = await prisma.teacher.findMany({
      where: {
        isActive: true,
        ...(scopedCampusId && { campusId: scopedCampusId }),
        ...(batchId && { batchId }),
        ...(houseId && { houseId }),
      },
      select: { id: true },
    })
    placementMatches.forEach((t) => idSet.add(t.id))

    teacherIds = [...idSet]
    if (teacherIds.length === 0) {
      return successResponse({ teachers: [], total: 0, mode })
    }
  }

  const teachers = await prisma.teacher.findMany({
    where: {
      isActive: true,
      ...(teacherIds && { id: { in: teacherIds } }),
      ...(scopedCampusId && !teacherIds && { campusId: scopedCampusId }),
      ...(batchId && !teacherIds && { batchId }),
      ...(houseId && !teacherIds && { houseId }),
      ...(search && {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { employeeId: { contains: search } },
        ],
      }),
    },
    take: limit,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: teacherSelect,
  })

  return successResponse({ teachers, total: teachers.length, mode })
}
