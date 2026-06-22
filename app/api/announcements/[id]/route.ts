/**
 * GET    /api/announcements/[id]
 * PATCH  /api/announcements/[id]  — edit title/content/targetRole/expiresAt
 * DELETE /api/announcements/[id]  — soft-delete (isActive = false)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  content: z.string().min(5).optional(),
  targetRole: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'announcements', 'read')) return errors.forbidden()

  const a = await prisma.announcement.findUnique({ where: { id: params.id } })
  if (!a) return errors.notFound('Announcement')
  return successResponse(a)
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'announcements', 'update')) return errors.forbidden()

  const a = await prisma.announcement.findUnique({ where: { id: params.id }, select: { id: true, createdBy: true } })
  if (!a) return errors.notFound('Announcement')

  // Only the creator or SUPER_ADMIN can edit
  if (session.user.role !== 'SUPER_ADMIN' && a.createdBy !== session.user.id) {
    return errors.forbidden()
  }

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { targetRole, expiresAt, ...rest } = parsed.data

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.announcement.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(targetRole !== undefined && { targetRole: (targetRole as any) ?? null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Announcement',
        entityId: params.id,
        changes: parsed.data,
      },
    })
    return r
  })

  return successResponse(updated, { message: 'Announcement updated' })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'announcements', 'delete')) return errors.forbidden()

  const a = await prisma.announcement.findUnique({ where: { id: params.id }, select: { id: true, createdBy: true } })
  if (!a) return errors.notFound('Announcement')

  if (session.user.role !== 'SUPER_ADMIN' && a.createdBy !== session.user.id) {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id: params.id }, data: { isActive: false } })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Announcement',
        entityId: params.id,
        changes: { reason: 'soft-delete' },
      },
    })
  })

  return successResponse({ id: params.id }, { message: 'Announcement removed' })
}