import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, successResponse, paginatedResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const createSalarySchema = z.object({
  employeeId: z.string(),
  month: z.string().min(2),
  basicSalary: z.coerce.number().positive(),
  allowances: z.coerce.number().nonnegative().default(0),
  deductions: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional(),
})

function salaryPeriodFromMonth(month: string): { start: Date; end: Date } {
  const parsed = new Date(`${month} 1`)
  const start = Number.isNaN(parsed.getTime()) ? new Date() : new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return { start, end }
}

const queryParamSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  getStaff: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = queryParamSchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, getStaff } = parsed.data

  const userRole = session.user.role as Role

  // Admin utility: load list of active staff to generate a salary slip
  if (getStaff === 'true') {
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') return errors.forbidden()

    const [teachers, accountants] = await prisma.$transaction([
      prisma.teacher.findMany({
        where: { isActive: true },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          designation: true,
          monthlySalary: true,
        },
      }),
      prisma.accountant.findMany({
        where: { isActive: true },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
        },
      }),
    ])

    const staff = [
      ...teachers.map(t => ({
        id: t.userId,
        name: `${t.firstName} ${t.lastName}`,
        role: 'TEACHER' as Role,
        designation: t.designation,
        salary: t.monthlySalary ? Number(t.monthlySalary) : 0,
      })),
      ...accountants.map(a => ({
        id: a.userId,
        name: `${a.firstName} ${a.lastName}`,
        role: 'ACCOUNTANT' as Role,
        designation: 'Account Manager',
        salary: 45000, // accountant default
      })),
    ]

    return successResponse(staff)
  }

  let where: any = {}

  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    where = { isDeleted: false }
  } else if (userRole === 'TEACHER' || userRole === 'ACCOUNTANT') {
    where = { employeeId: session.user.id, isDeleted: false }
  } else {
    return errors.forbidden() // Students/Parents cannot access salaries
  }

  const [total, slips] = await prisma.$transaction([
    prisma.salarySlip.count({ where }),
    prisma.salarySlip.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return paginatedResponse(slips, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden() // Only admin can issue salaries
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const parsed = createSalarySchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { employeeId, month, basicSalary, allowances, deductions, notes } = parsed.data

  // Fetch the employee user
  const employeeUser = await prisma.user.findUnique({
    where: { id: employeeId },
    include: { teacher: true, accountant: true },
  })

  if (!employeeUser || (employeeUser.role !== 'TEACHER' && employeeUser.role !== 'ACCOUNTANT')) {
    return errors.notFound('Selected Staff Member')
  }

  let employeeName = 'Employee'
  if (employeeUser.teacher) {
    employeeName = `${employeeUser.teacher.firstName} ${employeeUser.teacher.lastName}`
  } else if (employeeUser.accountant) {
    employeeName = `${employeeUser.accountant.firstName} ${employeeUser.accountant.lastName}`
  }

  const existingSlip = await prisma.salarySlip.findFirst({
    where: {
      employeeId,
      month,
      isDeleted: false,
    },
  })

  if (existingSlip) {
    return errors.conflict(`A salary slip already exists for this employee for ${month}`)
  }

  const totalAdditions = basicSalary + allowances
  const totalDeductions = deductions
  const netSalary = totalAdditions - totalDeductions

  if (netSalary < 0) {
    return errors.badRequest('Net salary cannot be negative. Adjust basic salary, allowances, or deductions.')
  }

  const { start, end } = salaryPeriodFromMonth(month)

  const salarySlip = await prisma.salarySlip.create({
    data: {
      employeeId,
      employeeName,
      employeeRole: employeeUser.role as Role,
      month,
      employeeNumber: employeeUser.teacher?.employeeId ?? employeeUser.accountant?.employeeId ?? null,
      designation: employeeUser.teacher?.designation ?? (employeeUser.accountant ? 'Account Manager' : null),
      department: null,
      salaryPeriodStart: start,
      salaryPeriodEnd: end,
      basicSalary,
      overtimeAmount: allowances,
      lunchDues: deductions,
      totalAdditions,
      totalDeductions,
      netSalary,
      status: 'PAID', // mark as PAID directly on generation by default
      notes: notes ?? null,
      generatedBy: session.user.id,
    },
  })

  return createdResponse(salarySlip, 'Salary slip generated successfully')
}
