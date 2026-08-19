import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { checkPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

const financeRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role as Role
  if (!financeRoles.includes(role) || !checkPermission(role, 'fee_penalties', 'read')) {
    return errors.forbidden()
  }
  const params = new URL(request.url).searchParams
  const status = params.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'WAIVED' | 'POSTED' | 'REVERSED' | null
  const type = params.get('type') as 'STUDENT_ABSENCE' | 'STUDENT_LEAVE' | 'TEACHER_LATE' | 'TEACHER_LEAVE' | null
  const assessments = await prisma.penaltyAssessment.findMany({
    where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
    include: {
      student: { select: { firstName: true, lastName: true, registrationNumber: true } },
      teacher: { select: { firstName: true, lastName: true, employeeId: true } },
      feePolicy: { select: { id: true, allowedAbsencesPerMonth: true } },
      teacherPenaltyPolicy: { select: { id: true, lateGraceMinutes: true, allowedLeavesPerMonth: true } },
      feeInvoice: { select: { challanNumber: true, month: true } },
      salarySlip: { select: { month: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(params.get('limit') ?? 100), 200),
  })
  return successResponse(assessments)
}
