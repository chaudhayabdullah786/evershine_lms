import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return errors.forbidden('Only finance staff can delete P&L statements')
    }

    const { id } = await params
    const statement = await prisma.profitLossStatement.findUnique({ where: { id } })
    if (!statement) return errors.notFound('P&L statement not found')

    // Role scoping: accountants can only delete statements for their campus (unless they have no campus restriction)
    if (session.user.role === 'ACCOUNTANT') {
      const acc = await prisma.accountant.findUnique({ where: { userId: session.user.id }, select: { campusId: true } })
      if (acc?.campusId && statement.campusId !== acc.campusId) {
        return errors.forbidden('Cannot delete a statement for a different campus')
      }
    }

    await prisma.$transaction(async (tx) => {
      // Remove reserve ledger entries tied to this P&L (audit preserved separately)
      await tx.reserveFundLedger.deleteMany({ where: { profitLossId: id } })
      await tx.profitLossStatement.delete({ where: { id } })
      await tx.auditLog.create({ data: { userId: session.user.id, action: 'DELETE', entityType: 'ProfitLossStatement', entityId: id, changes: {} } })
    })

    return successResponse({ id }, 'P&L statement deleted')
  } catch (err) {
    console.error('[PL_DELETE]', err)
    return errors.internal()
  }
}
