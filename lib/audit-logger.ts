import type { PrismaClient, Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'

export type AuditLogChanges = Record<string, unknown> | null

export async function logAudit(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  changes?: AuditLogChanges
  request?: NextRequest
}) {
  const { prismaClient, userId, action, entityType, entityId, changes, request } = params

  const ipAddress =
    request?.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    (request as any)?.ip ||
    null
  const userAgent = request?.headers.get('user-agent') || null

  return prismaClient.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      changes: changes ?? null,
      ipAddress,
      userAgent,
    },
  })
}
