/**
 * GET /api/superadmin/reserve-fund
 *   ?campusId&year&page&limit
 *   — Lists the full append-only reserve fund ledger.
 *     SuperAdmin sees all campuses; filters apply.
 *
 * Only SUPER_ADMIN has access. ACCOUNTANT and ADMIN are excluded by design
 * — reserve fund allocation is a SuperAdmin governance concern only.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse, paginatedResponse } from '@/lib/api-response'

const querySchema = z.object({
  campusId: z.string().cuid().optional(),
  year: z.coerce.number().int().min(2020).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'SUPER_ADMIN') {
      return errors.forbidden('Only Super Administrators can view the reserve fund ledger')
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) return errors.validation(parsed.error)

    const { campusId, year, page, limit } = parsed.data

    const yearStart = year ? new Date(`${year}-01-01T00:00:00.000Z`) : undefined
    const yearEnd = year ? new Date(`${year}-12-31T23:59:59.999Z`) : undefined

    const where = {
      ...(campusId ? { campusId } : {}),
      ...(yearStart ? { transactionDate: { gte: yearStart, lte: yearEnd! } } : {}),
    }

    const [entries, total] = await Promise.all([
      prisma.reserveFundLedger.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          profitLoss: {
            select: {
              periodLabel: true,
              grossMargin: true,
              superAdminAllocation: true,
              superAdminMonthlyDraw: true,
              campusId: true,
            },
          },
        },
      }),
      prisma.reserveFundLedger.count({ where }),
    ])

    // Running total is always the last entry's cumulativeTotal
    const currentBalance = entries.length > 0
      ? Number(entries[0].cumulativeTotal)
      : 0

    return paginatedResponse(
      {
        entries,
        currentBalance,
        filteredBy: { campusId: campusId ?? 'all', year: year ?? 'all' },
      },
      { page, limit, total }
    )
  } catch (err) {
    console.error('[RESERVE_FUND_GET]', err)
    return errors.internal()
  }
}
