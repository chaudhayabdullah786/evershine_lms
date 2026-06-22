/**
 * GET /api/classes/[id]/subjects
 *
 * Returns subjects for a specific class.
 * Accessible by TEACHER, ADMIN, SUPER_ADMIN.
 *
 * WHY a dedicated sub-route instead of embedding in GET /api/classes/[id]:
 *   The parent route returns full class details including students list.
 *   Teachers only need the subjects list for their task-creation form —
 *   returning the full class payload is wasteful and risks leaking student data.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassOrSubject } from '@/lib/teacher-access'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const allowedRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER']
  if (!allowedRoles.includes(session.user.role as Role)) {
    return errors.forbidden('Insufficient permissions')
  }

  const { id } = await params

  const legacyClass = await prisma.class.findUnique({
    where: { id },
    select: { id: true, campusId: true, isActive: true },
  })

  let resolvedClassId = legacyClass?.id ?? null
  let classSectionId = null as string | null

  if (!resolvedClassId) {
    const section = await prisma.classSection.findUnique({
      where: { id },
      select: {
        id: true,
        grade: true,
        sectionName: true,
        campusId: true,
        batchId: true,
        shift: { select: { code: true, name: true } },
      },
    })

    if (!section) return errors.notFound('Class or section not found')

    classSectionId = section.id
    const shiftCode = (section.shift?.code ?? section.shift?.name ?? '').toUpperCase().replace(/\s+/g, '')

    const mappedClass = await prisma.class.findFirst({
      where: {
        grade: section.grade ?? 0,
        section: section.sectionName ?? '',
        campusId: section.campusId,
        batchId: section.batchId ?? null,
        shift: shiftCode as never,
        isActive: true,
      },
      select: { id: true },
    })

    resolvedClassId = mappedClass?.id ?? null
  }

  if (!resolvedClassId && !classSectionId) return errors.notFound('Class or section not found')

  // For teachers: verify they are assigned to this class before returning subjects
  if (session.user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const isAssigned = resolvedClassId
      ? await teacherCanAccessClassOrSubject(teacher.id, resolvedClassId)
      : Boolean(
          await prisma.subjectOffering.findFirst({ where: { teacherId: teacher.id, classSectionId } }) ||
          await prisma.timetableSlot.findFirst({ where: { teacherId: teacher.id, classSectionId, isPublished: true } })
        )

    if (!isAssigned) {
      return errors.forbidden('You are not assigned to this class')
    }

    // Return only subjects this teacher teaches (scoped)
    if (resolvedClassId) {
      const assignedSubjectIds = (
        await prisma.subjectTeacher.findMany({
          where: { teacherId: teacher.id, subject: { classId: resolvedClassId } },
          select: { subjectId: true },
        })
      ).map((r) => r.subjectId)

      const isClassTeacher =
        (await prisma.classTeacher.count({ where: { classId: resolvedClassId, teacherId: teacher.id } })) > 0

      const subjects = await prisma.subject.findMany({
        where: {
          classId: resolvedClassId,
          isActive: true,
          ...(isClassTeacher ? {} : { id: { in: assignedSubjectIds } }),
        },
        select: {
          id: true,
          name: true,
          code: true,
          totalMarks: true,
          passingMarks: true,
          isElective: true,
        },
        orderBy: { name: 'asc' },
      })

      return successResponse(subjects)
    }

    const offerings = await prisma.subjectOffering.findMany({
      where: { teacherId: teacher.id, classSectionId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const subjects = await Promise.all(
      offerings.map(async (offering) => {
        const legacySubject = await prisma.subject.findFirst({
          where: {
            classId: resolvedClassId ?? undefined,
            code: offering.subject.code,
            isActive: true,
          },
          select: { id: true, name: true, code: true, totalMarks: true, passingMarks: true, isElective: true },
        })

        return legacySubject ?? {
          id: offering.subject.id,
          name: offering.subject.name,
          code: offering.subject.code,
          totalMarks: 100,
          passingMarks: 33,
          isElective: offering.isMandatory === false,
        }
      })
    )

    return successResponse(subjects)
  }

  // Admin / Super Admin: return all subjects
  const subjects = await prisma.subject.findMany({
    where: { classId: resolvedClassId ?? id, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      totalMarks: true,
      passingMarks: true,
      isElective: true,
    },
    orderBy: { name: 'asc' },
  })

  return successResponse(subjects)
}
