/**
 * POST /api/admin/transfers
 * Move students, teachers, or classes across campus / batch / class / house.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { adminTransferSchema } from '@/lib/validation/transfers'
import type { Role } from '@prisma/client'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'update')) return errors.forbidden()

  const role = session.user.role as Role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return errors.forbidden('Only administrators can transfer records')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = adminTransferSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { entityType, entityId, targetCampusId, targetBatchId, targetClassId, targetHouseId, notifyUser } =
    parsed.data

  if (!targetCampusId && !targetBatchId && !targetClassId && targetHouseId === undefined) {
    return errors.validation({
      errors: [{ path: [], message: 'Provide at least one target: campus, batch, class, or house' }],
    } as never)
  }

  const result = await prisma.$transaction(async (tx) => {
    if (entityType === 'STUDENT') {
      const student = await tx.student.findUnique({
        where: { id: entityId },
        include: { user: { select: { id: true } } },
      })
      if (!student) throw new Error('NOT_FOUND')

      if (role === 'ADMIN' && session.user.campusId && student.campusId !== session.user.campusId) {
        throw new Error('FORBIDDEN')
      }

      if (targetCampusId) {
        const campus = await tx.campus.findUnique({ where: { id: targetCampusId } })
        if (!campus) throw new Error('CAMPUS_NOT_FOUND')
      }
      if (targetBatchId) {
        const batch = await tx.batch.findUnique({ where: { id: targetBatchId } })
        if (!batch) throw new Error('BATCH_NOT_FOUND')
        const campusId = targetCampusId ?? student.campusId
        if (batch.campusId !== campusId) throw new Error('BATCH_CAMPUS_MISMATCH')
      }
      if (targetClassId) {
        const cls = await tx.class.findUnique({ where: { id: targetClassId } })
        if (!cls) throw new Error('CLASS_NOT_FOUND')
        const campusId = targetCampusId ?? student.campusId
        if (cls.campusId !== campusId) throw new Error('CLASS_CAMPUS_MISMATCH')
      }

      const updated = await tx.student.update({
        where: { id: entityId },
        data: {
          ...(targetCampusId && { campusId: targetCampusId }),
          ...(targetBatchId && { batchId: targetBatchId }),
          ...(targetClassId && { classId: targetClassId }),
          ...(targetHouseId !== undefined && { houseId: targetHouseId }),
        },
      })

      if (notifyUser && student.userId) {
        await tx.notification.create({
          data: {
            userId: student.userId,
            title: 'Academic placement updated',
            message: 'Your campus, batch, or class assignment has been updated by administration.',
            type: 'GENERAL',
            relatedId: student.id,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'Student',
          entityId,
          changes: { transfer: parsed.data, previous: { campusId: student.campusId, batchId: student.batchId, classId: student.classId, houseId: student.houseId } },
        },
      })

      return { entity: 'STUDENT', record: updated }
    }

    if (entityType === 'TEACHER') {
      const teacher = await tx.teacher.findUnique({
        where: { id: entityId },
        select: { id: true, campusId: true, batchId: true, houseId: true, userId: true, firstName: true, lastName: true },
      })
      if (!teacher) throw new Error('NOT_FOUND')

      if (role === 'ADMIN' && session.user.campusId && teacher.campusId !== session.user.campusId) {
        throw new Error('FORBIDDEN')
      }

      if (targetBatchId) {
        const batch = await tx.batch.findUnique({ where: { id: targetBatchId } })
        if (!batch) throw new Error('BATCH_NOT_FOUND')
        const campusId = targetCampusId ?? teacher.campusId
        if (batch.campusId !== campusId) throw new Error('BATCH_CAMPUS_MISMATCH')
      }

      const updated = await tx.teacher.update({
        where: { id: entityId },
        data: {
          ...(targetCampusId && { campusId: targetCampusId }),
          ...(targetBatchId && { batchId: targetBatchId }),
          ...(targetHouseId !== undefined && { houseId: targetHouseId }),
        },
      })

      if (notifyUser && teacher.userId) {
        await tx.notification.create({
          data: {
            userId: teacher.userId,
            title: 'Campus placement updated',
            message: 'Your campus, batch, or performance house assignment has been updated by administration.',
            type: 'GENERAL',
            relatedId: teacher.id,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'Teacher',
          entityId,
          changes: { transfer: parsed.data },
        },
      })

      return { entity: 'TEACHER', record: updated }
    }

    // CLASS
    const cls = await tx.class.findUnique({ where: { id: entityId } })
    if (!cls) throw new Error('NOT_FOUND')

    if (role === 'ADMIN' && session.user.campusId && cls.campusId !== session.user.campusId) {
      throw new Error('FORBIDDEN')
    }

    if (targetBatchId) {
      const batch = await tx.batch.findUnique({ where: { id: targetBatchId } })
      if (!batch) throw new Error('BATCH_NOT_FOUND')
      const campusId = targetCampusId ?? cls.campusId
      if (batch.campusId !== campusId) throw new Error('BATCH_CAMPUS_MISMATCH')
    }

    const updated = await tx.class.update({
      where: { id: entityId },
      data: {
        ...(targetCampusId && { campusId: targetCampusId }),
        ...(targetBatchId && { batchId: targetBatchId }),
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Class',
        entityId,
        changes: { transfer: parsed.data },
      },
    })

    return { entity: 'CLASS', record: updated }
  }).catch((err: Error) => {
    const msg = err.message
    if (msg === 'NOT_FOUND') return errors.notFound('Record not found')
    if (msg === 'FORBIDDEN') return errors.forbidden()
    if (msg === 'CAMPUS_NOT_FOUND') return errors.notFound('Target campus not found')
    if (msg === 'BATCH_NOT_FOUND') return errors.notFound('Target batch not found')
    if (msg === 'CLASS_NOT_FOUND') return errors.notFound('Target class not found')
    if (msg === 'BATCH_CAMPUS_MISMATCH' || msg === 'CLASS_CAMPUS_MISMATCH') {
      return errors.validation({
        errors: [{ path: [], message: 'Target batch/class must belong to the selected campus' }],
      } as never)
    }
    throw err
  })

  return successResponse(result, 'Transfer completed successfully')
}
