import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, createdResponse } from '@/lib/api-response'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only finance staff can regenerate P&L statements')
    }

    const id = params.id
    const existing = await prisma.profitLossStatement.findUnique({ where: { id } })
    if (!existing) return errors.notFound('P&L statement not found')

    // Role scoping check
    if (session.user.role === 'ACCOUNTANT') {
      const acc = await prisma.accountant.findUnique({ where: { userId: session.user.id }, select: { campusId: true } })
      if (acc?.campusId && existing.campusId !== acc.campusId) {
        return errors.forbidden('Cannot regenerate a statement for a different campus')
      }
    }

    const periodStartDate = new Date(existing.periodStart)
    const periodEndDate = new Date(existing.periodEnd)
    const campusId = existing.campusId ?? null
    const profitPercentage = Number(existing.profitPercentage)

    // Aggregate current live data for the same period/campus
    const feeWhere: any = {
      status: { equals: 'COMPLETED' },
      paymentDate: { gte: periodStartDate, lte: periodEndDate },
      ...(campusId ? { student: { is: { campusId } } } : {}),
    }

    const expenseWhere: any = {
      isDeleted: false,
      isApproved: true,
      date: { gte: periodStartDate, lte: periodEndDate },
      ...(campusId ? { campusId } : {}),
    }

    let salaryWhere: any = {
      isDeleted: false,
      status: 'PAID',
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

      salaryWhere = { ...salaryWhere, employeeId: { in: campusEmployees.map((u) => u.id) } }
    }

    const [feeAgg, expenseAgg, salaryAgg] = await Promise.all([
      prisma.feePayment.aggregate({ where: feeWhere, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }),
      prisma.salarySlip.aggregate({ where: salaryWhere, _sum: { netSalary: true } }),
    ])

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
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0) + Number(salaryAgg._sum.netSalary ?? 0)

    const grossMargin = totalIncome - totalExpenses
    const pctFraction = profitPercentage / 100
    const superAdminAllocation = grossMargin * pctFraction
    const superAdminMonthlyDraw = superAdminAllocation * 0.75
    const reserveContribution = superAdminAllocation * 0.25
    const remainingAmount = grossMargin - superAdminAllocation

    // Atomic: delete old ledger + statement, then create new statement + ledger
    const statement = await prisma.$transaction(async (tx) => {
      await tx.reserveFundLedger.deleteMany({ where: { profitLossId: id } })
      await tx.profitLossStatement.delete({ where: { id } })

      const stmt = await tx.profitLossStatement.create({
        data: {
          campusId: campusId ?? null,
          periodLabel: existing.periodLabel,
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          totalIncome,
          totalExpenses,
          grossMargin,
          profitPercentage: profitPercentage,
          superAdminAllocation,
          superAdminMonthlyDraw,
          reserveContribution,
          remainingAmount,
          generatedBy: session.user.id,
          snapshotData: { incomeItems: feeItems, expenseItems },
        },
      })

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
          periodLabel: existing.periodLabel,
          notes: null,
        },
      })

      return tx.profitLossStatement.findUnique({ where: { id: stmt.id }, include: { reserveEntry: true } })
    })

    return createdResponse(statement, `P&L statement for ${existing.periodLabel} regenerated successfully`)
  } catch (err) {
    console.error('[PL_REGEN]', err)
    return errors.internal()
  }
}
