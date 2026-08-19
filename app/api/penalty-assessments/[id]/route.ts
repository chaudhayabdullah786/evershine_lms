import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { checkPermission } from '@/lib/rbac'
import { assessmentActionSchema } from '@/lib/validation/penalty'
import type { Role } from '@prisma/client'
import { Prisma } from '@prisma/client'

const financeRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role as Role
  if (!financeRoles.includes(role) || !checkPermission(role, 'fee_penalties', 'update')) {
    return errors.forbidden()
  }
  const { id } = await params
  const parsed = assessmentActionSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)
  const assessment = await prisma.penaltyAssessment.findUnique({ where: { id } })
  if (!assessment) return errors.notFound('Penalty assessment')

  if (parsed.data.action !== 'POST') {
    if (assessment.status !== 'PENDING') return errors.conflict(`Assessment is already ${assessment.status.toLowerCase()}`)
    const status = parsed.data.action === 'APPROVE' ? 'APPROVED' : parsed.data.action === 'REJECT' ? 'REJECTED' : 'WAIVED'
    const reviewMetadata = parsed.data.note
      ? { ...((assessment.metadata as Record<string, unknown> | null) ?? {}), reviewNote: parsed.data.note }
      : undefined
    const updated = await prisma.penaltyAssessment.update({
      where: { id },
      data: { status, reviewedById: session.user.id, reviewedAt: new Date(), ...(reviewMetadata ? { metadata: reviewMetadata as Prisma.InputJsonValue } : {}) },
    })
    await prisma.auditLog.create({ data: { userId: session.user.id, action: parsed.data.action, entityType: 'PenaltyAssessment', entityId: id, changes: { status, note: parsed.data.note ?? null } } })
    return successResponse(updated, `Penalty assessment ${status.toLowerCase()}`)
  }

  if (assessment.status !== 'APPROVED') return errors.conflict('Approve the assessment before posting it')
  const amount = Number(assessment.amount)
  if (amount <= 0) return errors.badRequest('Assessment amount must be greater than zero')

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (assessment.type === 'STUDENT_ABSENCE') {
        if (!assessment.studentId) throw new Error('Student is missing from this assessment')
        const invoice = await tx.feeInvoice.findFirst({ where: { studentId: assessment.studentId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' } })
        if (!invoice) throw new Error('No open fee invoice exists for this student')
        await tx.feeItem.create({ data: { invoiceId: invoice.id, description: 'Attendance penalty — monthly absence limit', amount } })
        await tx.feeInvoice.update({ where: { id: invoice.id }, data: { totalAmount: { increment: amount }, penaltyAmount: { increment: amount }, isPenaltyApplied: true } })
        await tx.student.update({ where: { id: assessment.studentId }, data: { totalFeeAmount: { increment: amount }, dueAmount: { increment: amount } } })
        return tx.penaltyAssessment.update({ where: { id }, data: { status: 'POSTED', feeInvoiceId: invoice.id, reviewedById: session.user.id, reviewedAt: new Date(), postedAt: new Date() } })
      }

      if (!assessment.teacherId) throw new Error('Teacher is missing from this assessment')
      const teacher = await tx.teacher.findUnique({ where: { id: assessment.teacherId }, select: { userId: true } })
      if (!teacher) throw new Error('Teacher profile not found')
      const period = assessment.periodStart ?? assessment.createdAt
      const month = period.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      const slip = await tx.salarySlip.findFirst({ where: { employeeId: teacher.userId, month, isDeleted: false, status: { not: 'PAID' } }, orderBy: { createdAt: 'desc' } })
      if (!slip) throw new Error(`Create the ${month} salary slip before posting this deduction`)
      const fields: Array<{ label: string; value: number; isDeduction: boolean; penaltyAssessmentId?: string }> = Array.isArray(slip.customFields) ? [...(slip.customFields as Array<{ label: string; value: number; isDeduction: boolean; penaltyAssessmentId?: string }>)] : []
      if (!fields.some((field) => field?.penaltyAssessmentId === id)) fields.push({ label: assessment.reason, value: amount, isDeduction: true, penaltyAssessmentId: id })
      const additions = Number(slip.basicSalary) + Number(slip.overtimeAmount) + fields.filter((f) => !f.isDeduction).reduce((sum, f) => sum + Number(f.value || 0), 0)
      const deductions = Number(slip.lunchDues) + fields.filter((f) => f.isDeduction).reduce((sum, f) => sum + Math.abs(Number(f.value || 0)), 0)
      if (additions - deductions < 0) throw new Error('Posting this deduction would make the salary negative')
      const updatedSlip = await tx.salarySlip.update({ where: { id: slip.id }, data: { customFields: fields, totalAdditions: additions, totalDeductions: deductions, netSalary: additions - deductions } })
      return tx.penaltyAssessment.update({ where: { id }, data: { status: 'POSTED', salarySlipId: updatedSlip.id, reviewedById: session.user.id, reviewedAt: new Date(), postedAt: new Date() } })
    })
    await prisma.auditLog.create({ data: { userId: session.user.id, action: 'POST', entityType: 'PenaltyAssessment', entityId: id, changes: { amount, type: assessment.type } } })
    return successResponse(updated, 'Penalty posted successfully')
  } catch (error) {
    return errors.conflict(error instanceof Error ? error.message : 'Penalty could not be posted')
  }
}
