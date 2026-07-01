import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const updateSalarySchema = z.object({
  status: z.enum(['PAID', 'PENDING']),
  notes: z.string().optional(),
})

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden() // Only admin can update salary slips
  }

  const slipId = params.id
  const slip = await prisma.salarySlip.findUnique({
    where: { id: slipId },
  })

  if (!slip || slip.isDeleted) return errors.notFound('Salary Slip')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const parsed = updateSalarySchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { status, notes } = parsed.data

  const updatedSlip = await prisma.salarySlip.update({
    where: { id: slipId },
    data: {
      status,
      notes: notes ?? null,
    },
  })

  return successResponse(updatedSlip, { message: 'Salary slip updated successfully' })
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden() // Only admin can delete salary slips
  }

  const slipId = params.id
  const slip = await prisma.salarySlip.findUnique({
    where: { id: slipId },
  })

  if (!slip || slip.isDeleted) return errors.notFound('Salary Slip')

  await prisma.salarySlip.update({
    where: { id: slipId },
    data: { isDeleted: true },
  })

  return successResponse({ id: slipId }, { message: 'Salary slip archived successfully' })
}
