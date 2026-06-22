import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { assertGuardianAccessToStudent } from '@/lib/academic/guardian'
import { logAudit } from '@/lib/audit-logger'
import { z, ZodError, ZodIssueCode } from 'zod'

const createLeaveSchema = z.object({
  leaveType: z.enum(['CASUAL', 'SICK', 'EMERGENCY', 'OTHER']),
  startDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid date'),
  endDate: z.string().refine((d) => !isNaN(new Date(d).getTime()), 'Invalid date'),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(1000),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const allowedRoles = ['PARENT', 'GUARDIAN', 'SUPER_ADMIN', 'ADMIN']
  if (!allowedRoles.includes(session.user.role)) {
    return errors.forbidden()
  }

  const { studentId } = await params

  if (['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    const allowed = await assertGuardianAccessToStudent(session.user.id, studentId)
    if (!allowed) {
      return errors.forbidden('You can only view leave history for linked children.')
    }
  }

  const leaves = await prisma.studentLeaveRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      reason: true,
      remarks: true,
      createdAt: true,
    },
  })

  // Also fetch general leave requests made by the guardian on behalf of this student
  const guardianLeaves = await prisma.leaveRequest.findMany({
    where: { onBehalfOfStudentId: studentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      reason: true,
      remarks: true,
      leaveType: true,
      applicantName: true,
      createdAt: true,
    },
  })

  // Merge both sources into a unified list
  const unified = [
    ...leaves.map((l) => ({ ...l, source: 'CLASS_TEACHER' as const, leaveType: 'GENERAL' })),
    ...guardianLeaves.map((l) => ({ ...l, source: 'GUARDIAN' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return successResponse(unified)
}

/** Guardian applies for leave on behalf of their child */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    return errors.forbidden('Only parents and guardians can apply for leave on behalf of students.')
  }

  const { studentId } = await params

  const allowed = await assertGuardianAccessToStudent(session.user.id, studentId)
  if (!allowed) {
    return errors.forbidden('You can only apply for leave for your linked children.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: [], message: 'Invalid JSON body' }]))
  }

  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { leaveType, startDate, endDate, reason } = parsed.data
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (end < start) {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: ['endDate'], message: 'End date must be after start date' }]))
  }

  // Fetch student name for the leave record
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  })
  if (!student) return errors.notFound('Student')

  const leave = await prisma.$transaction(async (tx) => {
    const newLeave = await tx.leaveRequest.create({
      data: {
        applicantId: session.user.id,
        applicantName: session.user.name ?? session.user.email ?? 'Guardian',
        applicantRole: session.user.role as any,
        leaveType: leaveType as any,
        startDate: start,
        endDate: end,
        reason,
        status: 'PENDING',
        onBehalfOfStudentId: studentId,
        onBehalfOfStudentName: `${student.firstName} ${student.lastName}`,
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'LeaveRequest',
      entityId: newLeave.id,
      changes: {
        leaveType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        reason,
        status: 'PENDING',
        applicantRole: session.user.role,
        onBehalfOfStudent: `${student.firstName} ${student.lastName} (${studentId})`,
      },
      request,
    })

    // Create notification for admins
    const admins = await tx.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true },
    })

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          title: 'Guardian Leave Request',
          message: `${session.user.name ?? 'A guardian'} has applied for leave on behalf of ${student.firstName} ${student.lastName} (${start.toLocaleDateString('en-PK')} – ${end.toLocaleDateString('en-PK')}).`,
          type: 'GENERAL',
          relatedId: newLeave.id,
        })),
      })
    }

    return newLeave
  })

  return createdResponse(
    { id: leave.id },
    'Leave application submitted successfully. Administration will review it shortly.'
  )
}
