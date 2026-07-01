import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type ExpenseColumnSupport = {
  paymentSource: boolean
  paymentReference: boolean
}

let cachedExpenseColumnSupport: ExpenseColumnSupport | null = null

export async function getExpenseColumnSupport(): Promise<ExpenseColumnSupport> {
  if (cachedExpenseColumnSupport) return cachedExpenseColumnSupport

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT LOWER(COLUMN_NAME) AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Expense'
        AND COLUMN_NAME IN ('paymentSource', 'paymentReference')
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

export function isExpensePaymentColumnMissingError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2022') return false

  const modelName = (error.meta as { modelName?: unknown })?.modelName
  const rawColumn = (error.meta as { column?: unknown })?.column
  const columnName = typeof rawColumn === 'string'
    ? rawColumn.split('.').pop()?.toLowerCase()
    : undefined

  if (modelName === 'Expense' && (columnName === 'paymentsource' || columnName === 'paymentreference')) {
    return true
  }

  return typeof error.message === 'string' && /Expense\.(paymentSource|paymentReference)|paymentSource|paymentReference/.test(error.message)
}
