import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  salarySlipId: z.string().min(1),
  approverId: z.string().min(1),
  reason: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })

    const slip = await prisma.salarySlip.findUnique({ where: { id: parsed.data.salarySlipId } })
    if (!slip) return NextResponse.json({ success: false, error: 'Salary slip not found' }, { status: 404 })

    if (slip.issuedById === parsed.data.approverId || session.user.id === parsed.data.approverId) {
      return NextResponse.json({ success: false, error: 'Self-authorization is not allowed' }, { status: 400 })
    }

    const authorization = await prisma.salaryAuthorization.create({
      data: {
        salarySlipId: slip.id,
        issuerId: session.user.id,
        approverId: parsed.data.approverId,
        issuerRole: session.user.role,
        approverRole: 'SUPER_ADMIN',
        status: 'APPROVED',
        reason: parsed.data.reason ?? null,
      },
    })

    await prisma.salarySlip.update({
      where: { id: slip.id },
      data: {
        approvalStatus: 'APPROVED',
        approvedById: parsed.data.approverId,
        approvedAsRole: 'SUPER_ADMIN',
        approvalNote: parsed.data.reason ?? null,
        status: 'PAID',
        paymentDate: new Date(),
        paymentReference: `AUTH-${authorization.id.slice(0, 8).toUpperCase()}`,
      },
    })

    return NextResponse.json({ success: true, data: authorization })
  } catch (error) {
    console.error('[SALARY_AUTHORIZE_POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to authorize salary' }, { status: 500 })
  }
}
