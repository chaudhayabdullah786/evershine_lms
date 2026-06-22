import { prisma } from '@/lib/prisma'
import type { Role } from '@prisma/client'

export interface CreateRoleAssumptionInput {
  requesterId: string
  originalRole: Role
  assumedRole: Role
  reason?: string | null
  expiresAt?: Date
}

export async function createRoleAssumption(input: CreateRoleAssumptionInput) {
  return prisma.roleAssumption.create({
    data: {
      requesterId: input.requesterId,
      originalRole: input.originalRole,
      assumedRole: input.assumedRole,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: true,
    },
  })
}

export async function revokeRoleAssumption(id: string) {
  return prisma.roleAssumption.update({
    where: { id },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  })
}

export async function getActiveRoleAssumptions(requesterId: string) {
  return prisma.roleAssumption.findMany({
    where: {
      requesterId,
      isActive: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  })
}

export async function getRoleAssumptionById(id: string) {
  return prisma.roleAssumption.findUnique({
    where: { id },
  })
}
