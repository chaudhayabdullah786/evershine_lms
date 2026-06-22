/**
 * GET    /api/accountant/salary-slips/[id]
 *   — Fetches a single salary slip.
 *
 * PATCH  /api/accountant/salary-slips/[id]
 *   — Updates a salary slip (recalculating net amounts) and records in SalarySlipEditLog.
 *
 * DELETE /api/accountant/salary-slips/[id]
 *   — Soft-deletes a salary slip.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'

const customFieldSchema = z.object({
  label: z.string().min(1),
  value: z.coerce.number().finite(),
  isDeduction: z.boolean().default(false),
})

const updateSalarySlipSchema = z.object({
  basicSalary: z.coerce.number().positive().optional(),
  overtimeAmount: z.coerce.number().min(0).optional(),
  lunchDues: z.coerce.number().min(0).optional(),
  bankName: z.string().trim().nullable().optional(),
  accountNumber: z.string().trim().nullable().optional(),
  paymentSource: z.enum(['Cash', 'Bank Transfer', 'Cheque']).optional(),
  customFields: z.array(customFieldSchema).optional().nullable(),
  status: z.enum(['ISSUED', 'PAID', 'CANCELLED']).optional(),
  notes: z.string().trim().optional(),
  reason: z.string().min(3, 'Edit reason must be at least 3 characters'),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()

    const { id } = await params

    const slip = await prisma.salarySlip.findUnique({
      where: { id, isDeleted: false },
      include: {
        editLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!slip) return errors.notFound('Salary slip')

    // Allow user to view their own salary slip, or accountants/admins to view any
    const isOwner = session.user.id === slip.employeeId
    const isStaff = ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)

    if (!isOwner && !isStaff) {
      return errors.forbidden('You do not have permission to view this salary slip')
    }

    return successResponse(slip)
  } catch (err) {
    console.error('[SALARY_SLIP_GET_ID]', err)
    return errors.internal()
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only accountants and administrators can edit salary slips')
    }

    const { id } = await params
    const body = await req.json()
    const parsed = updateSalarySlipSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const existing = await prisma.salarySlip.findUnique({
      where: { id, isDeleted: false },
    })

    if (!existing) return errors.notFound('Salary slip')

    const updateData = parsed.data

    const updated = await prisma.$transaction(async (tx) => {
      // Snapshot before state
      const beforeState = {
        basicSalary: existing.basicSalary.toString(),
        overtimeAmount: existing.overtimeAmount.toString(),
        lunchDues: existing.lunchDues.toString(),
        totalAdditions: existing.totalAdditions.toString(),
        totalDeductions: existing.totalDeductions.toString(),
        netSalary: existing.netSalary.toString(),
        bankName: existing.bankName,
        accountNumber: existing.accountNumber,
        paymentSource: existing.paymentSource,
        customFields: existing.customFields,
        status: existing.status,
        notes: existing.notes,
      }

      // Compute new values
      const newBasicSalary = updateData.basicSalary ?? Number(existing.basicSalary)
      const newOvertimeAmount = updateData.overtimeAmount ?? Number(existing.overtimeAmount)
      const newLunchDues = updateData.lunchDues ?? Number(existing.lunchDues)
      const customFields = updateData.customFields !== undefined ? updateData.customFields : (existing.customFields as any)

      let extraAdditions = 0
      let extraDeductions = 0
      if (customFields && Array.isArray(customFields)) {
        for (const field of customFields) {
          if (field.isDeduction) {
            extraDeductions += Math.abs(field.value)
          } else {
            extraAdditions += field.value
          }
        }
      }

      const totalAdditions = newBasicSalary + newOvertimeAmount + extraAdditions
      const totalDeductions = newLunchDues + extraDeductions
      const netSalary = totalAdditions - totalDeductions

      if (netSalary < 0) {
        throw new Error('Calculated net salary cannot be negative')
      }

      const updatedSlip = await tx.salarySlip.update({
        where: { id },
        data: {
          basicSalary: newBasicSalary,
          overtimeAmount: newOvertimeAmount,
          lunchDues: newLunchDues,
          totalAdditions,
          totalDeductions,
          netSalary,
          bankName: updateData.bankName !== undefined ? updateData.bankName : existing.bankName,
          accountNumber: updateData.accountNumber !== undefined ? updateData.accountNumber : existing.accountNumber,
          paymentSource: updateData.paymentSource ?? existing.paymentSource,
          customFields: customFields ? JSON.parse(JSON.stringify(customFields)) : null,
          status: updateData.status ?? existing.status,
          notes: updateData.notes !== undefined ? updateData.notes : existing.notes,
          updatedAt: new Date(),
        },
      })

      // Snapshot after state
      const afterState = {
        basicSalary: updatedSlip.basicSalary.toString(),
        overtimeAmount: updatedSlip.overtimeAmount.toString(),
        lunchDues: updatedSlip.lunchDues.toString(),
        totalAdditions: updatedSlip.totalAdditions.toString(),
        totalDeductions: updatedSlip.totalDeductions.toString(),
        netSalary: updatedSlip.netSalary.toString(),
        bankName: updatedSlip.bankName,
        accountNumber: updatedSlip.accountNumber,
        paymentSource: updatedSlip.paymentSource,
        customFields: updatedSlip.customFields,
        status: updatedSlip.status,
        notes: updatedSlip.notes,
      }

      // Record in audit logs
      await tx.salarySlipEditLog.create({
        data: {
          salarySlipId: id,
          editedById: session.user.id,
          beforeState: beforeState as any,
          afterState: afterState as any,
          reason: updateData.reason,
        },
      })

      return updatedSlip
    })

    return successResponse(updated, 'Salary slip updated successfully')
  } catch (err: any) {
    console.error('[SALARY_SLIP_PATCH]', err)
    if (err.message === 'Calculated net salary cannot be negative') {
      return errors.badRequest(err.message)
    }
    return errors.internal()
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only accountants and administrators can delete salary slips')
    }

    const { id } = await params

    const existing = await prisma.salarySlip.findUnique({
      where: { id, isDeleted: false },
    })

    if (!existing) return errors.notFound('Salary slip')

    await prisma.salarySlip.update({
      where: { id },
      data: { isDeleted: true },
    })

    return successResponse(null, 'Salary slip deleted successfully')
  } catch (err) {
    console.error('[SALARY_SLIP_DELETE]', err)
    return errors.internal()
  }
}
