/**
 * POST /api/timetable/requests/action
 *
 * Admins approve or reject timetable change requests.
 *
 * DUAL SOURCE: The change request may reference either a legacy `Timetable`
 * slot (slotSource="legacy") or a new-engine `TimetableSlot` (slotSource="engine").
 * On APPROVE, the correct model is updated based on slotSource.
 * On REJECT, no slot update is needed — only status + notification.
 *
 * WHY snapshot fields: Original slot data is read from the denormalized snapshot
 * on the request itself (originalSubject, originalDay, etc.) to avoid null-deref
 * when the underlying record has been deleted or modified since submission.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Prisma, Role } from '@prisma/client'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const actionSchema = z.object({
  requestId: z.string().cuid('Invalid request ID'),
  action: z.enum(['APPROVE', 'REJECT']),
  adminReply: z.string().max(500).optional(),
})

function toAuditJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  const output: Record<string, Prisma.InputJsonValue | null> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (entry instanceof Date) {
      output[key] = entry.toISOString()
    } else if (entry === undefined) {
      output[key] = null
    } else if (entry === null) {
      output[key] = null
    } else if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      output[key] = entry
    } else {
      output[key] = JSON.parse(JSON.stringify(entry)) as Prisma.InputJsonValue
    }
  }

  return output as Prisma.InputJsonObject
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return errors.forbidden('Only admins can approve or reject timetable requests')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { requestId, action, adminReply } = parsed.data

  // Fetch full request — include both possible slot types
  const req = await (prisma as any).timetableChangeRequest.findUnique({
    where: { id: requestId },
    include: {
      teacher: { select: { id: true, userId: true, firstName: true, lastName: true } },
      timetable: {
        select: {
          id: true, classId: true, dayOfWeek: true,
          startTime: true, endTime: true, subjectName: true,
          class: { select: { name: true } }
        }
      },
      timetableSlot: {
        select: {
          id: true, classSectionId: true, dayOfWeek: true,
          startTime: true, endTime: true,
          subjectOffering: { select: { subject: { select: { name: true } } } },
          classSection: { select: { className: true, sectionName: true } }
        }
      }
    }
  })

  if (!req) return errors.notFound('Change request not found')
  if (req.status !== 'PENDING') {
    return errors.validation({
      errors: [{ path: ['status'], message: `Request is already ${req.status}. No action needed.` }]
    } as never)
  }

  const isEngineSlot = req.slotSource === 'engine'

  // Build display values using snapshot (guaranteed non-null) or live slot as fallback
  const displayClass   = req.originalClass ?? req.timetable?.class?.name ?? req.timetableSlot?.classSection?.className ?? 'Unknown Class'
  const displaySubject = req.originalSubject ?? req.timetable?.subjectName ?? req.timetableSlot?.subjectOffering?.subject?.name ?? 'Unknown Subject'
  const displayDay     = req.newDayOfWeek ?? req.originalDay ?? req.timetable?.dayOfWeek ?? req.timetableSlot?.dayOfWeek ?? 0
  const displayStart   = req.newStartTime ?? req.originalStart ?? req.timetable?.startTime ?? req.timetableSlot?.startTime ?? ''
  const displayEnd     = req.newEndTime   ?? req.originalEnd   ?? req.timetable?.endTime   ?? req.timetableSlot?.endTime   ?? ''

  if (action === 'APPROVE') {
    const updateData: Record<string, unknown> = {}
    if (req.newDayOfWeek  != null) updateData.dayOfWeek   = isEngineSlot ? req.newDayOfWeek + 1 : req.newDayOfWeek // engine uses 1=Mon
    if (req.newStartTime  != null) updateData.startTime   = req.newStartTime
    if (req.newEndTime    != null) updateData.endTime     = req.newEndTime
    if (req.newSubjectName != null) {
      if (!isEngineSlot) updateData.subjectName = req.newSubjectName
      // NOTE: For engine slots, subject is stored via SubjectOffering FK.
      // Changing it requires a separate offering update — out of scope for a simple
      // change request. The subjectName change is recorded in the request for admin info.
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update the correct slot model
      if (isEngineSlot && req.timetableSlot) {
        if (Object.keys(updateData).length > 0) {
          await tx.timetableSlot.update({
            where: { id: req.timetableSlot.id },
            data: updateData
          })
        }
      } else if (!isEngineSlot && req.timetable) {
        if (Object.keys(updateData).length > 0) {
          await tx.timetable.update({
            where: { id: req.timetable.id },
            data: updateData
          })
        }
      }

      // Mark request approved
      const updatedReq = await (tx as any).timetableChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          adminReply: adminReply?.trim() || 'Request approved'
        }
      })

      // Notify teacher
      await tx.notification.create({
        data: {
          userId: req.teacher.userId,
          title: '✅ Timetable Change Approved',
          message: `Your timetable change request for ${displaySubject} (${displayClass}) has been approved. New schedule: ${DAYS[displayDay] ?? 'Updated day'} ${displayStart}–${displayEnd}${adminReply ? `. Admin note: ${adminReply}` : ''}`,
          type: 'TIMETABLE_UPDATE',
          relatedId: requestId
        }
      })

      // Notify students in the affected class
      let studentUserIds: string[] = []
      if (isEngineSlot && req.timetableSlot?.classSectionId) {
        const enrollments = await (tx as any).studentEnrollment.findMany({
          where: { classSectionId: req.timetableSlot.classSectionId },
          select: { student: { select: { userId: true } } }
        })
        studentUserIds = enrollments
          .map((e: any) => e.student?.userId)
          .filter(Boolean)
      } else if (!isEngineSlot && req.timetable?.classId) {
        const enrollments = await (tx as any).classEnrollment.findMany({
          where: { classId: req.timetable.classId, enrollmentStatus: 'ACTIVE' },
          select: { student: { select: { userId: true } } }
        })
        studentUserIds = enrollments
          .map((e: any) => e.student?.userId)
          .filter(Boolean)
      }

      if (studentUserIds.length > 0) {
        await tx.notification.createMany({
          data: studentUserIds.map(uid => ({
            userId: uid,
            title: '📅 Class Schedule Updated',
            message: `Your ${displaySubject} class schedule in ${displayClass} has been updated. New time: ${DAYS[displayDay] ?? ''} ${displayStart}–${displayEnd}`,
            type: 'TIMETABLE_UPDATE',
            relatedId: requestId
          }))
        })
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'APPROVE',
          entityType: 'TimetableChangeRequest',
          entityId: requestId,
          changes: {
            slotSource: String(req.slotSource ?? ''),
            updatedFields: toAuditJsonObject(updateData),
            adminReply: adminReply ?? null,
          }
        }
      })

      return updatedReq
    })

    return successResponse(result, 'Timetable change approved and stakeholders notified')
  } else {
    // REJECT
    const result = await prisma.$transaction(async (tx) => {
      const updatedReq = await (tx as any).timetableChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          adminReply: adminReply?.trim() || 'Request rejected'
        }
      })

      await tx.notification.create({
        data: {
          userId: req.teacher.userId,
          title: '❌ Timetable Change Rejected',
          message: `Your timetable change request for ${displaySubject} (${displayClass}) was not approved.${adminReply ? ` Reason: ${adminReply}` : ' Please contact the admin for details.'}`,
          type: 'TIMETABLE_UPDATE',
          relatedId: requestId
        }
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'REJECT',
          entityType: 'TimetableChangeRequest',
          entityId: requestId,
          changes: { adminReply }
        }
      })

      return updatedReq
    })

    return successResponse(result, 'Timetable change request rejected')
  }
}
