/**
 * GET    /api/exams/[id]  — fetch single exam with results count
 * PATCH  /api/exams/[id]  — update exam fields
 * DELETE /api/exams/[id]  — soft-delete (set isActive = false)
 *
 * WHY soft-delete: Hard deleting an exam would orphan Result records and
 * destroy historical academic data. isActive = false hides it from listings
 * while preserving the ledger.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const updateExamSchema = z.object({
  name: z.string().min(2).optional(),
  classId: z.string().min(1).optional(),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  totalMarks: z.number().int().min(10).optional(),
})

async function getExamOrFail(id: string, campusId?: string | null, canManageCrossCampus?: boolean) {
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { class: { select: { campusId: true, name: true } } },
  })
  if (!exam || !exam.isActive) return null

  // Admins and Super Admins can manage cross-campus. Others are restricted to their own.
  if (!canManageCrossCampus && campusId && exam.class.campusId !== campusId) return null
  return exam
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'read')) return errors.forbidden()

  const canManageCrossCampus = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
  const exam = await getExamOrFail(params.id, session.user.campusId, canManageCrossCampus)
  if (!exam) return errors.notFound('Exam')

  const full = await prisma.exam.findUnique({
    where: { id: params.id },
    include: {
      class: { select: { name: true, grade: true, section: true, campus: { select: { name: true } } } },
      _count: { select: { results: true } },
    },
  })

  return successResponse(full)
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'update')) return errors.forbidden()

  const canManageCrossCampus = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
  const exam = await getExamOrFail(params.id, session.user.campusId, canManageCrossCampus)
  if (!exam) return errors.notFound('Exam')

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = updateExamSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  // If classId is changing, verify the new class is accessible
  if (data.classId && data.classId !== exam.classId) {
    const cls = await prisma.class.findUnique({ where: { id: data.classId }, select: { campusId: true } })
    if (!cls) return errors.notFound('Class')
    if (!canManageCrossCampus && cls.campusId !== session.user.campusId) {
      return errors.forbidden()
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedExam = await tx.exam.update({ where: { id: params.id }, data })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Exam',
        entityId: params.id,
        changes: data,
      },
    })

    return updatedExam
  })

  return successResponse(updated, 'Exam updated successfully')
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'delete')) return errors.forbidden()

  const canManageCrossCampus = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
  const exam = await getExamOrFail(params.id, session.user.campusId, canManageCrossCampus)
  if (!exam) return errors.notFound('Exam')

  // WHY soft-delete: Result records reference this exam. Hard delete would
  // cascade and destroy historical student result data.
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: params.id }, data: { isActive: false } })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Exam',
        entityId: params.id,
        changes: { reason: 'soft-delete', examName: exam.name },
      },
    })
  })

  return successResponse({ id: params.id }, 'Exam deleted successfully')
}