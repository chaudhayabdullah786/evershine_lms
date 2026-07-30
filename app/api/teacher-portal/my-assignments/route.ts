/**
 * GET /api/teacher-portal/my-assignments
 *
 * Returns the authenticated teacher's complete cross-shift assignment profile.
 * Uses the same assignment resolver as grade entry, targets, monitoring, and
 * attendance so the teacher dashboard cannot drift from the rest of the module.
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
import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'

const SHIFT_LABELS: Record<string, string> = {
  MORNING: '🌅 Morning',
  EVENING: '🌆 Evening',
  NIGHT: '🌙 Night',
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b)
  )
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const queryTeacherId = searchParams.get('teacherId')

  // Resolve teacher ID — teachers can only see their own; admins can look up any.
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

  const teacherProfile = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      user: {
        select: {
          displayName: true,
          email: true,
          profilePictureUrl: true,
        },
      },
    },
  })
  if (!teacherProfile) return errors.notFound('Teacher profile not found')

  const teacherName =
    teacherProfile.user.displayName?.trim() ||
    `${teacherProfile.firstName} ${teacherProfile.lastName}`.trim() ||
    'Teacher'

  // Get active academic year
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return successResponse({
      teacher: {
        id: teacherProfile.id,
        name: teacherName,
        email: teacherProfile.email || teacherProfile.user.email,
        employeeId: teacherProfile.employeeId,
        profilePicture: teacherProfile.profilePicture || teacherProfile.user.profilePictureUrl,
      },
      shifts: [],
      totalSections: 0,
      totalStudents: 0,
      activeShifts: [],
    })
  }

  const allowedSectionIds = await getTeacherClassSectionIds(teacherId, activeYear.id)
  if (allowedSectionIds.length === 0) {
    return successResponse({
      teacher: {
        id: teacherProfile.id,
        name: teacherName,
        email: teacherProfile.email || teacherProfile.user.email,
        employeeId: teacherProfile.employeeId,
        profilePicture: teacherProfile.profilePicture || teacherProfile.user.profilePictureUrl,
      },
      shifts: [],
      totalSections: 0,
      totalStudents: 0,
      activeShifts: [],
      academicYear: activeYear.name,
    })
  }

  const classSections = await prisma.classSection.findMany({
    where: {
      id: { in: allowedSectionIds },
      isActive: true,
    },
    select: {
      id: true,
      className: true,
      sectionName: true,
      grade: true,
      deliveryMode: true,
      shift: { select: { code: true, name: true } },
      campus: { select: { name: true, code: true } },
      batch: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: [
      { className: 'asc' },
      { sectionName: 'asc' },
    ],
  })

  const activeSectionIds = classSections.map((section) => section.id)

  // Direct subject offerings assigned to this teacher.
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      teacherId,
      academicYearId: activeYear.id,
      classSectionId: { in: activeSectionIds },
    },
    select: {
      id: true,
      classSectionId: true,
      subject: { select: { name: true, code: true } },
    },
  })

  // Timetable-only assignments may not have SubjectOffering.teacherId populated.
  const timetableSlots = await prisma.timetableSlot.findMany({
    where: {
      teacherId,
      academicYearId: activeYear.id,
      classSectionId: { in: activeSectionIds },
      isPublished: true,
    },
    select: {
      classSectionId: true,
      subjectOffering: {
        select: {
          subject: { select: { name: true, code: true } },
        },
      },
    },
  })

  const subjectsBySection = new Map<string, { names: string[]; codes: string[] }>()
  for (const sectionId of activeSectionIds) {
    subjectsBySection.set(sectionId, { names: [], codes: [] })
  }

  for (const offering of offerings) {
    const entry = subjectsBySection.get(offering.classSectionId) ?? { names: [], codes: [] }
    entry.names.push(offering.subject.name)
    entry.codes.push(offering.subject.code)
    subjectsBySection.set(offering.classSectionId, entry)
  }

  for (const slot of timetableSlots) {
    const entry = subjectsBySection.get(slot.classSectionId) ?? { names: [], codes: [] }
    entry.names.push(slot.subjectOffering.subject.name)
    entry.codes.push(slot.subjectOffering.subject.code)
    subjectsBySection.set(slot.classSectionId, entry)
  }

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

  for (const section of classSections) {
    const shiftCode = section.shift?.code ?? 'MORNING'
    const shiftLabel = SHIFT_LABELS[shiftCode] ?? section.shift?.name ?? shiftCode

    if (!shiftMap.has(shiftCode)) {
      shiftMap.set(shiftCode, {
        code: shiftCode,
        label: shiftLabel,
        sections: [],
      })
    }

    const subjectInfo = subjectsBySection.get(section.id)
    const subjectNames = uniqueSorted(subjectInfo?.names ?? [])
    const subjectCodes = uniqueSorted(subjectInfo?.codes ?? [])

    shiftMap.get(shiftCode)!.sections.push({
      classSectionId: section.id,
      className: section.className,
      sectionName: section.sectionName,
      subject: subjectNames.length > 0 ? subjectNames.join(', ') : 'Assigned section',
      subjectCode: subjectCodes.length > 0 ? subjectCodes.join(', ') : 'SECTION',
      deliveryMode: section.deliveryMode ?? 'PHYSICAL',
      studentCount: section._count.enrollments,
      campusName: section.campus?.name ?? '',
      batchName: section.batch?.name ?? '',
    })
  }

  const shifts = Array.from(shiftMap.values())

  // Calculate totals once per class section to avoid double-counting teachers
  // who teach multiple subjects in the same section.
  const totalStudents = shifts.reduce(
    (sum, shift) => sum + shift.sections.reduce((s, sec) => s + sec.studentCount, 0),
    0
  )

  return successResponse({
    teacher: {
      id: teacherProfile.id,
      name: teacherName,
      email: teacherProfile.email || teacherProfile.user.email,
      employeeId: teacherProfile.employeeId,
      profilePicture: teacherProfile.profilePicture || teacherProfile.user.profilePictureUrl,
    },
    shifts,
    totalSections: classSections.length,
    totalStudents,
    activeShifts: shifts.map((s) => s.code),
    academicYear: activeYear.name,
  })
}
