/**
 * GET /api/teacher-portal/my-assignments
 *
 * Returns the authenticated teacher's complete cross-shift assignment profile.
 * Groups SubjectOffering records by shift, showing class sections, subjects,
 * delivery modes, and student counts.
 *
 * WHY: Gives teachers a unified view of all their assignments across Morning,
 * Evening, and Night shifts — critical for multi-shift teaching workflows.
 *
 * RBAC: TEACHER (own data only), ADMIN/SUPER_ADMIN (any teacher via ?teacherId=).
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const queryTeacherId = searchParams.get('teacherId')

  // Resolve teacher ID — teachers can only see their own; admins can look up any
  let teacherId: string

  if (queryTeacherId && ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role as string)) {
    teacherId = queryTeacherId
  } else {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found for current user')
    teacherId = teacher.id
  }

  // Get active academic year
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return successResponse({
      shifts: [],
      totalSections: 0,
      totalStudents: 0,
      activeShifts: [],
    })
  }

  // Fetch all subject offerings for this teacher in the active year
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      teacherId,
      academicYearId: activeYear.id,
    },
    select: {
      id: true,
      classSectionId: true,
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          deliveryMode: true,
          isActive: true,
          shift: { select: { code: true, name: true } },
          campus: { select: { name: true, code: true } },
          batch: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      },
      subject: { select: { name: true, code: true } },
    },
  })

  // Group by shift
  const shiftMap = new Map<string, {
    code: string
    label: string
    sections: Array<{
      classSectionId: string
      className: string
      sectionName: string
      subject: string
      subjectCode: string
      deliveryMode: string
      studentCount: number
      campusName: string
      batchName: string
    }>
  }>()

  const SHIFT_LABELS: Record<string, string> = {
    MORNING: '🌅 Morning',
    EVENING: '🌆 Evening',
    NIGHT: '🌙 Night',
  }

  for (const o of offerings) {
    const sec = o.classSection
    if (!sec.isActive) continue

    const shiftCode = sec.shift?.code ?? 'MORNING'
    const shiftLabel = SHIFT_LABELS[shiftCode] ?? sec.shift?.name ?? shiftCode

    if (!shiftMap.has(shiftCode)) {
      shiftMap.set(shiftCode, {
        code: shiftCode,
        label: shiftLabel,
        sections: [],
      })
    }

    shiftMap.get(shiftCode)!.sections.push({
      classSectionId: sec.id,
      className: sec.className,
      sectionName: sec.sectionName,
      subject: o.subject.name,
      subjectCode: o.subject.code,
      deliveryMode: sec.deliveryMode ?? 'PHYSICAL',
      studentCount: sec._count.enrollments,
      campusName: sec.campus?.name ?? '',
      batchName: sec.batch?.name ?? '',
    })
  }

  const shifts = Array.from(shiftMap.values())

  // Calculate totals
  const allSectionIds = new Set(offerings.map((o) => o.classSectionId))
  const totalStudents = shifts.reduce(
    (sum, shift) => sum + shift.sections.reduce((s, sec) => s + sec.studentCount, 0),
    0
  )

  return successResponse({
    shifts,
    totalSections: allSectionIds.size,
    totalStudents,
    activeShifts: shifts.map((s) => s.code),
    academicYear: activeYear.name,
  })
}
