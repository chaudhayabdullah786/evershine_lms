import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, paginatedResponse } from '@/lib/api-response'
import { submitAttendanceSchema, attendanceQuerySchema } from '@/lib/validation/attendance'

async function checkTeacherAssignment(userId: string, classId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!teacher) return null

  const isAssigned = await prisma.classTeacher.findFirst({
    where: { classId, teacherId: teacher.id },
  }) || await prisma.subjectTeacher.findFirst({
    where: { subject: { classId }, teacherId: teacher.id },
  })

  return isAssigned ? teacher.id : null
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { searchParams } = new URL(request.url)
  const parsed = attendanceQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit, classId, studentId, shift, date, startDate, endDate, status } = parsed.data

  if (!classId) {
    return errors.validation({ errors: [{ path: ['classId'], message: 'classId is required' }] } as any)
  }

  // Enforce teacher boundary
  const teacherId = await checkTeacherAssignment(session.user.id, classId)
  if (!teacherId) {
    return errors.forbidden('You are not assigned to this class')
  }

  const where = {
    classId,
    ...(studentId && { studentId }),
    ...(shift && { shift }),
    ...(status && { status }),
    ...(date && { date: new Date(date) }),
    ...((startDate || endDate) && {
      date: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  }

  const [total, records] = await prisma.$transaction([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true },
        },
      },
    }),
  ])

  return paginatedResponse(records, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const parsed = submitAttendanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { classId, date, shift, records } = parsed.data
  const attendanceDate = new Date(date)

  // Enforce teacher boundary
  const teacherId = await checkTeacherAssignment(session.user.id, classId)
  if (!teacherId) {
    return errors.forbidden('You are not assigned to this class')
  }

  // Verify class exists
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, shift: true } })
  if (!cls) return errors.notFound('Class')

  const resolvedShift = shift ?? cls.shift

  // Check for existing attendance on this date for this class + shift
  const existingCount = await prisma.attendance.count({
    where: { classId, date: attendanceDate, shift: resolvedShift },
  })
  if (existingCount > 0) {
    return errors.conflict(
      `Attendance for ${cls.name} (${resolvedShift}) on ${date} has already been submitted.`
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendance.createMany({
      data: records.map((r) => ({
        studentId: r.studentId,
        classId,
        date: attendanceDate,
        shift: resolvedShift,
        status: r.status,
        markedBy: session.user.id,
        remarks: r.remarks ?? null,
      })),
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Attendance',
        entityId: classId,
        changes: { date, shift: resolvedShift, recordCount: records.length },
      },
    })
  })

  return successResponse(
    { classId, date, recordCount: records.length },
    `Attendance recorded for ${records.length} students`
  )
}
