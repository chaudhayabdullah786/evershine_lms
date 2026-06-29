/**
 * GET  /api/accountant/salary-slips
 *   ?employeeId&month&status&page&limit
 *   — Lists salary slips with filtering and pagination.
 *
 * POST /api/accountant/salary-slips
 *   — Creates a new salary slip for any employee (Teacher, Accountant, Admin, etc.).
 *     Validates net salary calculations.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse, paginatedResponse, createdResponse } from '@/lib/api-response'
import { dispatchNotification } from '@/lib/notifications/dispatch'

const customFieldSchema = z.object({
  label: z.string().min(1, 'Label required'),
  value: z.coerce.number().finite(),
  isDeduction: z.boolean().default(false),
})

const createSalarySlipSchema = z.object({
  employeeId: z.string().min(1, 'Employee User ID is required'),
  month: z.string().regex(/^[A-Za-z]+\s+\d{4}$/, 'Month must be in format "Month YYYY" (e.g. "June 2026")'),
  salaryPeriodStart: z.string().datetime(),
  salaryPeriodEnd: z.string().datetime(),
  basicSalary: z.coerce.number().positive('Basic salary must be positive'),
  overtimeAmount: z.coerce.number().min(0).default(0),
  lunchDues: z.coerce.number().min(0).default(0),
  bankName: z.string().trim().nullable().optional(),
  accountNumber: z.string().trim().nullable().optional(),
  paymentSource: z.enum(['Cash', 'Bank Transfer', 'Cheque']).default('Cash'),
  customFields: z.array(customFieldSchema).optional().nullable(),
  notes: z.string().trim().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()

    const isFinance = ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)
    const isTeacher = session.user.role === 'TEACHER'
    if (!isFinance && !isTeacher) {
      return errors.forbidden('Access denied.')
    }

    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20')))

    // SECURITY: teachers can only see their own slips — ignore any employeeId param
    const employeeId = isTeacher
      ? session.user.id
      : (searchParams.get('employeeId') ?? undefined)

    const skip = (page - 1) * limit

    const where = {
      isDeleted: false,
      ...(employeeId ? { employeeId } : {}),
      ...(month ? { month } : {}),
      ...(status ? { status } : {}),
    }

    const [slips, total] = await Promise.all([
      prisma.salarySlip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.salarySlip.count({ where }),
    ])

    return paginatedResponse(slips, { page, limit, total })
  } catch (err) {
    console.error('[SALARY_SLIPS_GET]', err)
    return errors.internal()
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only accountants and administrators can generate salary slips')
    }

    const body = await req.json()
    const parsed = createSalarySlipSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const data = parsed.data

    // 1. Fetch employee profile and basic details
    const employee = await prisma.user.findUnique({
      where: { id: data.employeeId },
      include: {
        teacher: true,
        accountant: true,
        admin: true,
      },
    })

    if (!employee) {
      return errors.notFound('Employee User')
    }

    let employeeName = ''
    let employeeRole = employee.role
    let employeeNumber: string | null = null
    let designation: string | null = null
    let department: string | null = null

    if (employee.teacher) {
      employeeName = `${employee.teacher.firstName} ${employee.teacher.lastName}`
      employeeNumber = employee.teacher.employeeId
      designation = employee.teacher.designation
    } else if (employee.accountant) {
      employeeName = `${employee.accountant.firstName} ${employee.accountant.lastName}`
      employeeNumber = employee.accountant.employeeId
      designation = 'Accountant'
    } else if (employee.admin) {
      employeeName = `${employee.admin.firstName} ${employee.admin.lastName}`
      employeeNumber = null
      designation = 'Administrator'
      department = employee.admin.department ?? null
    } else {
      employeeName = employee.email.split('@')[0]
    }

    // 2. Check for existing active salary slip for this employee/month
    const existing = await prisma.salarySlip.findFirst({
      where: {
        employeeId: data.employeeId,
        month: data.month,
        isDeleted: false,
      },
    })

    if (existing) {
      return errors.conflict(`A salary slip already exists for this employee for ${data.month}`)
    }

    // 3. Compute additions, deductions and net salary
    let extraAdditions = 0
    let extraDeductions = 0
    if (data.customFields && Array.isArray(data.customFields)) {
      for (const field of data.customFields) {
        if (field.isDeduction) {
          extraDeductions += Math.abs(field.value)
        } else {
          extraAdditions += field.value
        }
      }
    }

    const totalAdditions = Number(data.basicSalary) + Number(data.overtimeAmount) + extraAdditions
    const totalDeductions = Number(data.lunchDues) + extraDeductions
    const netSalary = totalAdditions - totalDeductions

    if (netSalary < 0) {
      return errors.badRequest('Net salary cannot be negative. Adjust basic salary, overtime, or deductions.')
    }

    // 4. Save to DB and dispatch notification inside transaction
    const slip = await prisma.$transaction(async (tx) => {
      const createdSlip = await tx.salarySlip.create({
        data: {
          employeeId: data.employeeId,
          employeeName,
          employeeRole,
          employeeNumber,
          department,
          designation,
          month: data.month,
          salaryPeriodStart: new Date(data.salaryPeriodStart),
          salaryPeriodEnd: new Date(data.salaryPeriodEnd),
          basicSalary: data.basicSalary,
          overtimeAmount: data.overtimeAmount,
          lunchDues: data.lunchDues,
          totalAdditions,
          totalDeductions,
          netSalary,
          bankName: data.bankName ?? null,
          accountNumber: data.accountNumber ?? null,
          paymentSource: data.paymentSource,
          customFields: data.customFields ? JSON.parse(JSON.stringify(data.customFields)) : null,
          notes: data.notes ?? null,
          generatedBy: session.user.id,
          status: 'ISSUED',
        },
      })

      // Dispatch real-time notification
      await dispatchNotification({
        userId: data.employeeId,
        title: 'Salary Slip Issued',
        message: `Your salary slip for ${data.month} has been issued. Net payable: PKR ${netSalary.toLocaleString()}.`,
        type: 'SALARY_SLIP_ISSUED',
        relatedId: createdSlip.id,
        tx,
      })

      return createdSlip
    })

    return createdResponse(slip, 'Salary slip generated successfully')
  } catch (err) {
    console.error('[SALARY_SLIP_CREATE]', err)
    return errors.internal()
  }
}
