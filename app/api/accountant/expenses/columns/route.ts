import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getExpenseColumnSupport } from '@/lib/accounting/expense-columns'

export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff can view expense metadata settings')
  }

  const supportedColumns = await getExpenseColumnSupport()
  return successResponse(supportedColumns)
}
