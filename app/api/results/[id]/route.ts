/**
 * GET    /api/results/[id]  — single result detail
 * PATCH  /api/results/[id]  — update obtained marks, recalculate grade/percentage
 * DELETE /api/results/[id]  — hard delete (admin only; results can be re-entered)
 *
 * WHY recalculate on PATCH: grade and percentage are derived fields.
 * Storing them separately risks drift if only obtainedMarks is updated.
 * Always recompute from obtainedMarks/totalMarks to keep data consistent.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const updateSchema = z.object({
  obtainedMarks: z.number().int().min(0),
  totalMarks: z.number().int().min(1).optional(),
  remarks: z.string().max(300).optional(),
})

function computeGrade(pct: number): string {
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'read')) return errors.forbidden()

  const result = await prisma.result.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { firstName: true, lastName: true, registrationNumber: true } },
      exam: { select: { name: true, totalMarks: true } },
      details: { include: { subject: { select: { name: true } } } },
    },
  })
  if (!result) return errors.notFound('Result')
  return successResponse(result)
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'update')) return errors.forbidden()
  const result = await prisma.result.findUnique({
    where: { id: params.id },
    select: { id: true, totalMarks: true, obtainedMarks: true },
  })
  if (!result) return errors.notFound('Result')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { obtainedMarks, totalMarks: newTotal, remarks } = parsed.data
  const totalMarks = newTotal ?? result.totalMarks

  if (obtainedMarks > totalMarks) {
    return errors.validation({
      errors: [{ path: ['obtainedMarks'], message: 'Obtained marks cannot exceed total marks' }],
    } as never)
  }

  const percentage = (obtainedMarks / totalMarks) * 100
  const grade = computeGrade(percentage)
  const isPassed = percentage >= 40

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.result.update({
      where: { id: params.id },
      data: {
        obtainedMarks,
        totalMarks,
        percentage,
        grade,
        isPassed,
        ...(remarks !== undefined && { remarks }),
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Result',
        entityId: params.id,
        changes: { obtainedMarks, totalMarks, percentage, grade },
      },
    })
    return r
  })

  return successResponse(updated, 'Result updated successfully')
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'delete')) return errors.forbidden()
  const result = await prisma.result.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!result) return errors.notFound('Result')

  await prisma.$transaction(async (tx) => {
    await tx.result.delete({ where: { id: params.id } })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Result',
        entityId: params.id,
        changes: {},
      },
    })
  })

  return successResponse({ id: params.id }, 'Result deleted')
}
