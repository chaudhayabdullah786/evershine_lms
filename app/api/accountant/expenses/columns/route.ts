import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

function isExpenseColumnMissingError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2022') return false

  const modelName = (error.meta as { modelName?: unknown })?.modelName
  const rawColumn = (error.meta as { column?: unknown })?.column
  const columnName = typeof rawColumn === 'string'
    ? rawColumn.split('.').pop()?.toLowerCase()
    : undefined

  return modelName === 'Expense' && (columnName === 'paymentsource' || columnName === 'paymentreference')
}

let cachedExpenseColumnSupport: { paymentSource: boolean; paymentReference: boolean } | null = null

async function getExpenseColumnSupport() {
  if (cachedExpenseColumnSupport) return cachedExpenseColumnSupport

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT lower(column_name) AS column_name
      FROM information_schema.columns
      WHERE lower(table_name) = 'expense'
        AND lower(table_schema) = lower(current_schema())
        AND lower(column_name) IN ('paymentsource', 'paymentreference')
    `

    const names = new Set(columns.map((row) => row.column_name))
    cachedExpenseColumnSupport = {
      paymentSource: names.has('paymentsource'),
      paymentReference: names.has('paymentreference'),
    }
  } catch (err) {
    console.error('[EXPENSE_COLUMN_SUPPORT]', err)
    cachedExpenseColumnSupport = { paymentSource: false, paymentReference: false }
  }

  return cachedExpenseColumnSupport
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff can view expense metadata settings')
  }

  const supportedColumns = await getExpenseColumnSupport()
  return successResponse(supportedColumns)
}
