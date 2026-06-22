/**
 * POST /api/teacher-portal/timetable-requests  — teacher submits a change request
 * GET  /api/teacher-portal/timetable-requests  — list (teacher sees own; admin sees all)
 *
 * ARCHITECTURE: TimetableChangeRequest now supports two slot sources:
 *   "legacy" → timetableId FK → Timetable model (managed via /api/timetable)
 *   "engine" → timetableSlotId FK → TimetableSlot model (Academic Engine)
 *
 * WHY dual-source: The system has two parallel timetable models. The teacher
 * portal must be able to request changes regardless of which model the admin
 * used to publish their slots.
 *
 * WHY snapshot fields (originalSubject, originalDay, etc.): The admin review
 * page needs to display the "current slot" even if the underlying record has
 * since been modified or deleted. Denormalized snapshots prevent empty displays.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse, createdResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

// ── Validation ────────────────────────────────────────────────────────────────

const createRequestSchema = z.object({
  // Exactly one of these must be provided — validated at runtime below
  timetableId:     z.string().cuid('Invalid timetable ID').optional(),
  timetableSlotId: z.string().cuid('Invalid timetable slot ID').optional(),
  slotSource:      z.enum(['legacy', 'engine']).default('legacy'),
  reason:          z.string().min(5, 'Reason must be at least 5 characters').max(500),
  newDayOfWeek:    z.number().int().min(0).max(5).optional().nullable(),
  newStartTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional().nullable(),
  newEndTime:      z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional().nullable(),
  newSubjectName:  z.string().max(100).optional().nullable(),
})

const querySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
})

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') {
    return errors.forbidden('Only teachers can create timetable change requests')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = createRequestSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { timetableId, timetableSlotId, slotSource, reason, newDayOfWeek, newStartTime, newEndTime, newSubjectName } = parsed.data

  // Enforce: exactly one source ID must be provided
  if (!timetableId && !timetableSlotId) {
    return errors.validation({
      errors: [{ path: ['timetableId'], message: 'Either timetableId or timetableSlotId is required' }]
    } as never)
  }

  // Resolve teacher profile
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  // ── Resolve slot details from the appropriate source ─────────────────────
  let resolvedTeacherId: string
  let snapshot: { subject: string; day: number; start: string; end: string; className: string }

  if (slotSource === 'engine' && timetableSlotId) {
    // New Academic Engine path
    const slot = await prisma.timetableSlot.findUnique({
      where: { id: timetableSlotId },
      select: {
        id: true,
        teacherId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        subjectOffering: { select: { subject: { select: { name: true } } } },
        classSection: { select: { className: true, sectionName: true } },
      }
    })
    if (!slot) return errors.notFound('Timetable slot not found in the Academic Engine')
    if (slot.teacherId !== teacher.id) {
      return errors.forbidden('You can only request changes for your own timetable slots')
    }
    resolvedTeacherId = slot.teacherId
    snapshot = {
      subject: slot.subjectOffering?.subject?.name ?? 'Unknown Subject',
      day: slot.dayOfWeek - 1, // Normalize to 0=Monday for display
      start: slot.startTime,
      end: slot.endTime,
      className: `${slot.classSection?.className ?? ''}${slot.classSection?.sectionName ? ` - ${slot.classSection.sectionName}` : ''}`
    }
  } else if (timetableId) {
    // Legacy Timetable path
    const legacySlot = await prisma.timetable.findUnique({
      where: { id: timetableId },
      select: { id: true, teacherId: true, dayOfWeek: true, startTime: true, endTime: true, subjectName: true, class: { select: { name: true } } }
    })
    if (!legacySlot) return errors.notFound('Timetable slot not found')
    if (legacySlot.teacherId !== teacher.id) {
      return errors.forbidden('You can only request changes for your own timetable slots')
    }
    resolvedTeacherId = legacySlot.teacherId
    snapshot = {
      subject: legacySlot.subjectName,
      day: legacySlot.dayOfWeek,
      start: legacySlot.startTime,
      end: legacySlot.endTime,
      className: legacySlot.class?.name ?? ''
    }
  } else {
    return errors.validation({ errors: [{ path: ['slotSource'], message: 'slotSource "engine" requires timetableSlotId' }] } as never)
  }

  // Prevent duplicate pending requests for the same slot
  const existingWhere = slotSource === 'engine'
    ? { timetableSlotId, status: 'PENDING' }
    : { timetableId, status: 'PENDING' }

  const existing = await (prisma as any).timetableChangeRequest.findFirst({ where: existingWhere })
  if (existing) {
    return errors.validation({
      errors: [{ path: ['timetableId'], message: 'A pending change request already exists for this slot. Please wait for admin review before submitting another.' }]
    } as never)
  }

  // Create the change request
  const changeRequest = await (prisma as any).timetableChangeRequest.create({
    data: {
      timetableId:     slotSource === 'legacy' ? timetableId : null,
      timetableSlotId: slotSource === 'engine' ? timetableSlotId : null,
      slotSource,
      teacherId: teacher.id,
      requestedBy: session.user.id,
      reason,
      // Snapshot for audit trail and admin display
      originalSubject: snapshot.subject,
      originalDay:     snapshot.day,
      originalStart:   snapshot.start,
      originalEnd:     snapshot.end,
      originalClass:   snapshot.className,
      newDayOfWeek,
      newStartTime,
      newEndTime,
      newSubjectName,
      status: 'PENDING'
    },
    include: {
      teacher: { select: { firstName: true, lastName: true } }
    }
  })

  // Notify all admins + super admins
  const admins = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
    select: { id: true }
  })

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        title: 'Timetable Change Request',
        message: `${changeRequest.teacher.firstName} ${changeRequest.teacher.lastName} requested to change their timetable slot for ${snapshot.subject} (${snapshot.className}): "${reason}"`,
        type: 'TIMETABLE_REQUEST',
        relatedId: changeRequest.id
      }))
    })
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'TimetableChangeRequest',
      entityId: changeRequest.id,
      changes: {
        slotSource,
        reason,
        snapshot,
        proposedChanges: { newDayOfWeek, newStartTime, newEndTime, newSubjectName }
      }
    }
  })

  return createdResponse(changeRequest, 'Timetable change request submitted successfully')
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { status, page, limit } = parsed.data

  const role = session.user.role as Role
  const isTeacher = role === 'TEACHER'
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

  if (!isTeacher && !isAdmin) return errors.forbidden()

  let where: Record<string, unknown> = {}

  if (isTeacher) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })
    if (!teacher) return paginatedResponse([], { page, limit, total: 0 })
    where.teacherId = teacher.id
  }

  if (status) where.status = status

  const [total, requests_] = await prisma.$transaction([
    (prisma as any).timetableChangeRequest.count({ where }),
    (prisma as any).timetableChangeRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        // Include both relation types for backward compatibility
        timetable: {
          select: {
            id: true, subjectName: true, dayOfWeek: true,
            startTime: true, endTime: true,
            class: { select: { name: true } }
          }
        },
        timetableSlot: {
          select: {
            id: true, dayOfWeek: true, startTime: true, endTime: true,
            subjectOffering: { select: { subject: { select: { name: true } } } },
            classSection: { select: { className: true, sectionName: true } }
          }
        }
      }
    })
  ])

  return paginatedResponse(requests_, { page, limit, total })
}
