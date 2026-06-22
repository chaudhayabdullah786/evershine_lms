import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'

/** Active enrollments in a class section for attendance marking with batch/shift/house filters. */
export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'read')
  if (denied) return denied

  const params = new URL(request.url).searchParams
  const classSectionId = params.get('classSectionId')
  const batchId = params.get('batchId')
  const shiftId = params.get('shiftId')
  const houseId = params.get('houseId')
  const dateStr = params.get('date') ?? new Date().toISOString().split('T')[0]
  
  if (!classSectionId) {
    return errors.validation({
      errors: [{ path: ['classSectionId'], message: 'classSectionId is required' }],
    } as never)
  }
  const attendanceDate = new Date(dateStr)

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return successResponse({ enrollments: [], date: dateStr, stats: { total: 0, byHouse: {} } })

  if (session.user.role === 'TEACHER') {
    const teacher = await getTeacherByUserId(session.user.id)
    if (!teacher) return errors.forbidden()

    const allowed = await teacherCanAccessClassSection(teacher.id, classSectionId, activeYear?.id)
    if (!allowed) {
      return errors.forbidden('You are not assigned to this section')
    }
  }

  // Build where clause with optional filters
  const where: any = {
    academicYearId: activeYear.id,
    classSectionId,
    status: 'ACTIVE',
  }

  if (batchId) where.classSection = { batch: { id: batchId } }
  if (shiftId) where.classSection = { ...where.classSection, shift: { id: shiftId } }
  if (houseId) where.student = { house: { id: houseId } }

  const enrollments = await prisma.studentEnrollment.findMany({
    where,
    include: {
      classSection: {
        select: {
          batch: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true } },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          profilePicture: true,
          house: { select: { id: true, name: true, color: true } },
        },
      },
      attendanceRecords: {
        where: { attendanceDate },
        take: 1,
      },
    },
    orderBy: { rollNumber: 'asc' },
  })

  // Calculate statistics by house
  const byHouse: Record<string, { total: number; present: number; absent: number }> = {}
  enrollments.forEach((e) => {
    const houseName = e.student.house?.name ?? 'Unassigned'
    if (!byHouse[houseName]) {
      byHouse[houseName] = { total: 0, present: 0, absent: 0 }
    }
    byHouse[houseName].total++
    const status = Array.isArray(e.attendanceRecords) ? e.attendanceRecords[0]?.status : null
    if (status === 'PRESENT') byHouse[houseName].present++
    if (status === 'ABSENT') byHouse[houseName].absent++
  })

  return successResponse({
    academicYear: activeYear,
    classSectionId,
    date: dateStr,
    filters: { batchId, shiftId, houseId },
    stats: {
      total: enrollments.length,
      byHouse,
    },
    enrollments: enrollments.map((e) => ({
      studentEnrollmentId: e.id,
      rollNumber: e.rollNumber,
      student: e.student,
      batch: e.classSection.batch,
      shift: e.classSection.shift,
      house: e.student.house,
      todayStatus: Array.isArray(e.attendanceRecords) ? e.attendanceRecords[0]?.status : null,
    })),
  })
}
