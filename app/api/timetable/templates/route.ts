import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTimetableTemplateSchema } from '@/lib/validation/academic'
import { timetablePersistenceError } from '@/lib/academic/timetable-schema'
import type { Prisma, Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'read')
  if (denied) return denied

  const academicYearId = new URL(request.url).searchParams.get('academicYearId')
  try {
    const templates = await prisma.timetableTemplate.findMany({
      where: {
        isActive: true,
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: {
        id: true,
        academicYearId: true,
        shiftId: true,
        name: true,
        definition: true,
        createdAt: true,
        updatedAt: true,
        academicYear: { select: { name: true } },
        shift: { select: { code: true, name: true } },
        _count: { select: { slots: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    })

    return successResponse(templates)
  } catch (err) {
    return timetablePersistenceError(err, 'load timetable templates')
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'create')
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON body')
  }
  const parsed = createTimetableTemplateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const year = await prisma.academicYear.findUnique({
    where: { id: parsed.data.academicYearId },
    select: { id: true, isLocked: true },
  })
  if (!year) return errors.notFound('Academic year')
  if (year.isLocked) return errors.forbidden('Academic year is locked')

  if (parsed.data.shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: parsed.data.shiftId }, select: { id: true } })
    if (!shift) return errors.notFound('Shift')
  }

  try {
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.timetableTemplate.create({
        data: {
          academicYearId: parsed.data.academicYearId,
          shiftId: parsed.data.shiftId ?? null,
          name: parsed.data.name,
          definition: parsed.data.blocks as Prisma.InputJsonValue,
          createdById: session.user.id,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'TimetableTemplate',
          entityId: created.id,
          changes: { name: created.name, academicYearId: created.academicYearId },
        },
      })
      return created
    })

    return createdResponse(template, 'Timetable template created')
  } catch (err) {
    return timetablePersistenceError(err, 'create timetable template')
  }
}
