/**
 * GET  /api/accountant/profit-loss
 *   ?campusId&year&page&limit
 *   — Lists all historical P&L statements, newest-first.
 *
 * POST /api/accountant/profit-loss
 *   — Generates a new P&L statement for a given period.
 *     Aggregates fee income and expenses from live data, creates a snapshot,
 *     and automatically contributes to the ReserveFundLedger inside one ACID tx.
 *
 * Rules (from schema comments):
 *   grossMargin             = totalIncome - totalExpenses
 *   superAdminAllocation    = grossMargin * (profitPercentage / 100)
 *   superAdminMonthlyDraw   = superAdminAllocation * 0.75
 *   reserveContribution     = superAdminAllocation * 0.25
 *   remainingAmount         = grossMargin - superAdminAllocation
 */

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse, createdResponse, paginatedResponse } from '@/lib/api-response'
import { buildProfitLossReport } from '@/lib/excel/profit-loss-report'

const generateSchema = z.object({
  campusId: z.string().cuid().nullable().optional(),
  periodLabel: z.string().min(1).max(50),     // "June 2026"
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  profitPercentage: z.coerce.number()          // e.g. 20 → 20%
    .min(0, 'profitPercentage must be ≥ 0')
    .max(100, 'profitPercentage must be ≤ 100'),
  notes: z.string().max(500).optional(),
})

const querySchema = z.object({
  campusId: z.string().cuid().optional(),
  year: z.coerce.number().int().min(2000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  export: z.enum(['excel']).optional(),
})

async function resolveCampusScope(
  sessionUser: { id: string; role: string; campusId?: string | null },
  queryCampusId?: string | null
) {
  if (sessionUser.role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: sessionUser.id },
      select: { campusId: true },
    })

    if (acc?.campusId) return acc.campusId
    return sessionUser.campusId ?? queryCampusId ?? null
  }

  if (sessionUser.role === 'ADMIN') {
    return sessionUser.campusId ?? queryCampusId ?? null
  }

  return queryCampusId ?? null
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden()
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) return errors.validation(parsed.error)

    const { campusId: queryCampusId, year, page, limit, export: exportType } = parsed.data
    const scopedCampusId = await resolveCampusScope(session.user, queryCampusId)

    if (session.user.role === 'ACCOUNTANT' && !scopedCampusId) {
      return errors.forbidden('No campus context found for this account')
    }

    const yearStart = year ? new Date(`${year}-01-01T00:00:00.000Z`) : undefined
    const yearEnd = year ? new Date(`${year}-12-31T23:59:59.999Z`) : undefined

    // For accountants, include both statements scoped to their campus AND global statements (campusId == null)
    let where: Prisma.ProfitLossStatementWhereInput = {
      ...(yearStart ? { periodStart: { gte: yearStart, lte: yearEnd! } } : {}),
    }

    if (scopedCampusId) {
      if (session.user.role === 'ACCOUNTANT') {
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { campusId: scopedCampusId },
              { campusId: null },
            ],
          },
        ]
      } else {
        Object.assign(where, { campusId: scopedCampusId })
      }
    }

    if (exportType === 'excel') {
      const statements = await prisma.profitLossStatement.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        include: {
          reserveEntry: true,
          campus: { select: { name: true } },
        },
      })

      const campusLabel = scopedCampusId
        ? (await prisma.campus.findUnique({ where: { id: scopedCampusId }, select: { name: true } }))?.name
        : undefined

      const workbook = await buildProfitLossReport(statements, {
        campusLabel,
        year,
      })
      const buffer = await workbook.xlsx.writeBuffer()

      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="profit-loss-statements-${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      })
    }

    const [statements, total] = await Promise.all([
      prisma.profitLossStatement.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { reserveEntry: true },
      }),
      prisma.profitLossStatement.count({ where }),
    ])

    return paginatedResponse(statements, { page, limit, total })
  } catch (err) {
    console.error('[PL_GET]', err)
    return errors.internal()
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only finance staff can generate P&L statements')
    }

    const body = await req.json()
    const parsed = generateSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const { campusId: requestedCampusId, periodLabel, periodStart, periodEnd, profitPercentage, notes } = parsed.data
    const scopedCampusId = await resolveCampusScope(session.user, requestedCampusId)

    if (session.user.role === 'ACCOUNTANT' && !scopedCampusId) {
      return errors.forbidden('No campus context found for this account')
    }

    const campusId = session.user.role === 'ACCOUNTANT' ? scopedCampusId : requestedCampusId ?? null
    const periodStartDate = new Date(periodStart)
    const periodEndDate = new Date(periodEnd)

    if (periodStartDate >= periodEndDate) {
      return errors.badRequest('periodEnd must be after periodStart')
    }

    // Prevent duplicate statement for same campus+period
    const existing = await prisma.profitLossStatement.findFirst({
      where: {
        campusId: campusId ?? null,
        periodLabel,
      },
    })
    if (existing) {
      return errors.conflict(`A P&L statement for "${periodLabel}" already exists for this campus`)
    }

    // ── Aggregate live data ───────────────────────────────────────────────────

    const feeWhere: Prisma.FeePaymentWhereInput = {
      status: { equals: 'COMPLETED' },
      paymentDate: { gte: periodStartDate, lte: periodEndDate },
      ...(campusId ? { student: { is: { campusId } } } : {}),
    }

    const expenseWhere: Prisma.ExpenseWhereInput = {
      isDeleted: false,
      isApproved: true,
      date: { gte: periodStartDate, lte: periodEndDate },
      ...(campusId ? { campusId } : {}),
    }

    let salaryWhere: Prisma.SalarySlipWhereInput = {
      isDeleted: false,
      status: 'PAID' as const,
      updatedAt: { gte: periodStartDate, lte: periodEndDate },
    }

    if (campusId) {
      const campusEmployees = await prisma.user.findMany({
        where: {
          OR: [
            { teacher: { campusId } },
            { admin: { campusId } },
            { accountant: { campusId } },
          ],
        },
        select: { id: true },
      })

      salaryWhere = {
        ...salaryWhere,
        employeeId: { in: campusEmployees.map((user) => user.id) },
      }
    }

    const [feeAgg, expenseAgg, salaryAgg] = await Promise.all([
      prisma.feePayment.aggregate({
        where: feeWhere,
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
      }),
      prisma.salarySlip.aggregate({
        where: salaryWhere,
        _sum: { netSalary: true },
      }),
    ])

    // Fee income items snapshot
    const feeItems = await prisma.feePayment.findMany({
      where: feeWhere,
      select: { id: true, amount: true, paymentDate: true, paymentMethod: true },
      take: 1000,
    })

    const expenseItems = await prisma.expense.findMany({
      where: expenseWhere,
      select: { id: true, title: true, category: true, amount: true, date: true },
      take: 1000,
    })

    const totalIncome = Number(feeAgg._sum.amount ?? 0)
    const totalExpenses =
      Number(expenseAgg._sum.amount ?? 0) + Number(salaryAgg._sum.netSalary ?? 0)

    // ── Apply business rules ──────────────────────────────────────────────────
    const grossMargin = totalIncome - totalExpenses
    const pctFraction = profitPercentage / 100
    const superAdminAllocation = grossMargin * pctFraction
    const superAdminMonthlyDraw = superAdminAllocation * 0.75
    const reserveContribution = superAdminAllocation * 0.25
    const remainingAmount = grossMargin - superAdminAllocation

    // ── Persist atomically ────────────────────────────────────────────────────
    const statement = await prisma.$transaction(async (tx) => {
      const stmt = await tx.profitLossStatement.create({
        data: {
          campusId: campusId ?? null,
          periodLabel,
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          totalIncome,
          totalExpenses,
          grossMargin,
          profitPercentage,
          superAdminAllocation,
          superAdminMonthlyDraw,
          reserveContribution,
          remainingAmount,
          generatedBy: session.user.id,
          snapshotData: {
            incomeItems: feeItems,
            expenseItems,
          },
        },
      })

      // Compute cumulative reserve fund total (append-only)
      const lastEntry = await tx.reserveFundLedger.findFirst({
        where: campusId ? { campusId } : {},
        orderBy: { transactionDate: 'desc' },
        select: { cumulativeTotal: true },
      })

      const previousTotal = Number(lastEntry?.cumulativeTotal ?? 0)
      const cumulativeTotal = previousTotal + reserveContribution

      await tx.reserveFundLedger.create({
        data: {
          profitLossId: stmt.id,
          campusId: campusId ?? null,
          contributionAmount: reserveContribution,
          cumulativeTotal,
          periodLabel,
          notes: notes ?? null,
        },
      })

      return tx.profitLossStatement.findUnique({
        where: { id: stmt.id },
        include: { reserveEntry: true },
      })
    })

    return createdResponse(statement, `P&L statement for ${periodLabel} generated successfully`)
  } catch (err) {
    console.error('[PL_POST]', err)
    return errors.internal()
  }
}
