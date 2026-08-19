import { Prisma, type PenaltyAssessmentType } from '@prisma/client'

export type PenaltyTransaction = Prisma.TransactionClient

export function calendarMonthBounds(value: Date): { start: Date; end: Date } {
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  }
}

export function isAbsencePenaltyDue(absentCount: number, allowedAbsences: number): boolean {
  return absentCount > Math.max(0, allowedAbsences)
}

export function isLatePenaltyDue(lateMinutes: number, graceMinutes: number): boolean {
  return lateMinutes > Math.max(0, graceMinutes)
}

async function findFeePolicy(
  tx: PenaltyTransaction,
  campusId: string | null | undefined,
  batchId: string | null | undefined
) {
  const scopes = [
    campusId && batchId ? { campusId, batchId } : null,
    campusId ? { campusId, batchId: null } : null,
    batchId ? { campusId: null, batchId } : null,
    { campusId: null, batchId: null },
  ].filter(Boolean) as Array<{ campusId: string | null; batchId: string | null }>

  for (const scope of scopes) {
    const policy = await tx.feePolicy.findFirst({
      where: { ...scope, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    if (policy) return policy
  }
  return null
}

export async function createStudentAbsenceAssessment(
  tx: PenaltyTransaction,
  input: { attendanceRecordId: string; attendanceDate: Date; markedByUserId?: string | null }
) {
  const attendanceRecord = await tx.enrollmentAttendanceRecord.findUnique({
    where: { id: input.attendanceRecordId },
    select: { studentEnrollmentId: true, status: true },
  })
  if (!attendanceRecord) return null

  const enrollment = await tx.studentEnrollment.findUnique({
    where: { id: attendanceRecord.studentEnrollmentId },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      classSection: { select: { id: true, campusId: true, batchId: true } },
    },
  })
  if (!enrollment) return null

  const { start, end } = calendarMonthBounds(input.attendanceDate)
  const policy = await findFeePolicy(tx, enrollment.classSection.campusId, enrollment.classSection.batchId)
  const existing = await tx.penaltyAssessment.findUnique({
    where: { type_sourceId: { type: 'STUDENT_ABSENCE', sourceId: input.attendanceRecordId } },
  })
  if (attendanceRecord.status !== 'ABSENT') {
    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {
      return tx.penaltyAssessment.update({ where: { id: existing.id }, data: { status: 'REVERSED' } })
    }
    return existing
  }
  if (!policy || Number(policy.absencePenaltyAmount) <= 0) return existing

  const absentCount = await tx.enrollmentAttendanceRecord.count({
    where: {
      studentEnrollmentId: enrollment.id,
      attendanceDate: { gte: start, lt: end },
      status: 'ABSENT',
    },
  })
  if (!isAbsencePenaltyDue(absentCount, policy.allowedAbsencesPerMonth)) {
    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {
      return tx.penaltyAssessment.update({ where: { id: existing.id }, data: { status: 'REVERSED' } })
    }
    return existing
  }

  const sourceId = input.attendanceRecordId
  if (existing) return existing

  return tx.penaltyAssessment.create({
    data: {
      type: 'STUDENT_ABSENCE',
      sourceId,
      studentId: enrollment.student.id,
      policyId: policy.id,
      amount: new Prisma.Decimal(policy.absencePenaltyAmount),
      reason: `Monthly absence limit exceeded: ${absentCount} ABSENT record(s), allowance ${policy.allowedAbsencesPerMonth}.`,
      periodStart: start,
      periodEnd: end,
      metadata: {
        absentCount,
        allowedAbsencesPerMonth: policy.allowedAbsencesPerMonth,
        classSectionId: enrollment.classSection.id,
        markedByUserId: input.markedByUserId ?? null,
      },
    },
  })
}

export async function createTeacherLateAssessment(
  tx: PenaltyTransaction,
  input: {
    attendanceId: string
    teacherId: string
    teacherPolicyId?: string | null
    amount: number
    lateMinutes: number
    priorLateCount: number
    date: Date
  }
) {
  const existing = await tx.penaltyAssessment.findUnique({
    where: { type_sourceId: { type: 'TEACHER_LATE', sourceId: input.attendanceId } },
  })
  if (input.amount <= 0) {
    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {
      return tx.penaltyAssessment.update({ where: { id: existing.id }, data: { status: 'REVERSED' } })
    }
    return existing
  }
  if (existing) return existing
  const { start, end } = calendarMonthBounds(input.date)
  return tx.penaltyAssessment.create({
    data: {
      type: 'TEACHER_LATE',
      sourceId: input.attendanceId,
      teacherId: input.teacherId,
      teacherPolicyId: input.teacherPolicyId ?? null,
      amount: new Prisma.Decimal(input.amount),
      reason: `Late arrival exceeded the configured grace period (${input.lateMinutes} minute(s) late).`,
      periodStart: start,
      periodEnd: end,
      metadata: { lateMinutes: input.lateMinutes, priorLateCount: input.priorLateCount },
    },
  })
}

export async function createTeacherLeaveAssessment(
  tx: PenaltyTransaction,
  input: {
    leaveId: string
    teacherId: string
    teacherPolicyId: string
    amount: number
    leaveCount: number
    allowedLeaves: number
    startDate: Date
  }
) {
  if (input.amount <= 0) return null
  const existing = await tx.penaltyAssessment.findUnique({
    where: { type_sourceId: { type: 'TEACHER_LEAVE', sourceId: input.leaveId } },
  })
  if (existing) return existing
  const { start, end } = calendarMonthBounds(input.startDate)
  return tx.penaltyAssessment.create({
    data: {
      type: 'TEACHER_LEAVE',
      sourceId: input.leaveId,
      teacherId: input.teacherId,
      teacherPolicyId: input.teacherPolicyId,
      amount: new Prisma.Decimal(input.amount),
      reason: `Approved leave exceeded the monthly allowance (${input.leaveCount}/${input.allowedLeaves}).`,
      periodStart: start,
      periodEnd: end,
      metadata: { leaveCount: input.leaveCount, allowedLeavesPerMonth: input.allowedLeaves },
    },
  })
}

export type AssessmentType = PenaltyAssessmentType
