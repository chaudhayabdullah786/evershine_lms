import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const updateAdminSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
})

/** Update admin */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'settings', 'write')
  if (denied) return denied

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateAdminSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(parsed.error)
    }

    const admin = await prisma.admin.update({
      where: { id },
      data: parsed.data,
      include: { campus: true, user: true },
    })

    return successResponse({ admin, message: 'Admin updated' })
  } catch (err: any) {
    if (err.code === 'P2025') return errors.notFound('Admin not found')
    console.error('Update admin error:', err)
    return errors.internal('Failed to update admin')
  }
}

/** Delete admin (deactivate) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'settings', 'write')
  if (denied) return denied

  try {
    const { id } = await params

    // Soft delete - deactivate
    const admin = await prisma.admin.update({
      where: { id },
      data: { isActive: false },
    })

    return successResponse({ admin, message: 'Admin removed' })
  } catch (err: any) {
    if (err.code === 'P2025') return errors.notFound('Admin not found')
    console.error('Delete admin error:', err)
    return errors.internal('Failed to delete admin')
  }
}
