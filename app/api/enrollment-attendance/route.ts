import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { markEnrollmentAttendanceSchema } from '@/lib/validation/academic'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { resolveMarkedByTeacherId } from '@/lib/academic/attendance'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const classSectionId = searchParams.get('classSectionId')
  const date = searchParams.get('date')
  const studentEnrollmentId = searchParams.get('studentEnrollmentId')
  const studentId = searchParams.get('studentId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 60), 200)

  const records = await prisma.enrollmentAttendanceRecord.findMany({
    where: {
      ...(studentEnrollmentId && { studentEnrollmentId }),
      ...(date && { attendanceDate: new Date(date) }),
      ...(studentId && { studentEnrollment: { studentId } }),
      ...(classSectionId && {
        studentEnrollment: { classSectionId },
      }),
    },
    include: {
      studentEnrollment: {
        include: {
          student: { select: { firstName: true, lastName: true, rollNumber: true } },
        },
      },
    },
    orderBy: { attendanceDate: 'desc' },
    take: limit,
  })

  return successResponse(records)
}

/** Mark attendance for a class section on a given date (bulk-friendly single POST). */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'create')
  if (denied) return denied

  const body = await request.json()

  // Bulk: { classSectionId, attendanceDate, records: [{ studentEnrollmentId, status, remarks? }] }
  if (Array.isArray(body.records)) {
    const classSectionId = body.classSectionId as string
    const attendanceDate = body.attendanceDate as string
    if (!classSectionId || !attendanceDate) {
      return errors.validation({
        errors: [{ path: ['classSectionId'], message: 'classSectionId and attendanceDate required' }],
      } as never)
    }

    const activeYear = await getActiveAcademicYear()
    if (activeYear?.isLocked) return errors.forbidden('Academic year is locked')

    if (session.user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(session.user.id)
      if (!teacher) return errors.forbidden()
      const allowed = await teacherCanAccessClassSection(
        teacher.id,
        classSectionId,
        activeYear?.id
      )
      if (!allowed) return errors.forbidden('You are not assigned to this section')
    }

    const markedBy = await resolveMarkedByTeacherId(session.user.id)

    const results = await prisma.$transaction(async (tx) => {
      const out = []
      for (const rec of body.records as {
        studentEnrollmentId: string
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
        remarks?: string
      }[]) {
        const row = await tx.enrollmentAttendanceRecord.upsert({
          where: {
            studentEnrollmentId_attendanceDate: {
              studentEnrollmentId: rec.studentEnrollmentId,
              attendanceDate: new Date(attendanceDate),
            },
          },
          create: {
            studentEnrollmentId: rec.studentEnrollmentId,
            attendanceDate: new Date(attendanceDate),
            status: rec.status,
            markedByTeacherId: markedBy,
            remarks: rec.remarks,
          },
          update: {
            status: rec.status,
            markedByTeacherId: markedBy,
            remarks: rec.remarks,
          },
        })
        out.push(row)
      }
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'EnrollmentAttendance',
          entityId: classSectionId,
          changes: { date: attendanceDate, count: out.length },
        },
      })
      return out
    })

    return createdResponse(results, 'Attendance saved')
  }

  const parsed = markEnrollmentAttendanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const markedBy = await resolveMarkedByTeacherId(session.user.id)

  const record = await prisma.enrollmentAttendanceRecord.upsert({
    where: {
      studentEnrollmentId_attendanceDate: {
        studentEnrollmentId: parsed.data.studentEnrollmentId!,
        attendanceDate: new Date(parsed.data.attendanceDate!),
      },
    },
    create: {
      studentEnrollmentId: parsed.data.studentEnrollmentId!,
      attendanceDate: new Date(parsed.data.attendanceDate!),
      status: parsed.data.status!,
      remarks: parsed.data.remarks,
      markedByTeacherId: markedBy,
    },
    update: {
      status: parsed.data.status!,
      remarks: parsed.data.remarks,
      markedByTeacherId: markedBy,
    },
  })

  return createdResponse(record)
}
