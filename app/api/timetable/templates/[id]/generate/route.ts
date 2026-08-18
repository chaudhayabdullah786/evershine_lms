import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, errorResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { generateTimetableTemplateSchema, timetableTemplateBlockSchema } from '@/lib/validation/academic'
import { isWithinShiftWindow, timesOverlap } from '@/lib/academic/engine'
import { subjectOfferingUniqueWhere } from '@/lib/academic/timetable-keys'
import { timetablePersistenceError } from '@/lib/academic/timetable-schema'
import type { Role } from '@prisma/client'

type RouteParams = { params: Promise<{ id: string }> }
type TemplateBlock = {
  slotType: 'SUBJECT' | 'BREAK' | 'PRAYER' | 'LUNCH' | 'ASSEMBLY' | 'ACTIVITY'
  subjectCode?: string | null
  roomId?: string | null
  days: number[]
  startTime: string
  endTime: string
}

const PERIOD_CODES: Record<Exclude<TemplateBlock['slotType'], 'SUBJECT'>, string> = {
  BREAK: '__BREAK__',
  PRAYER: '__PRAYER__',
  LUNCH: '__LUNCH__',
  ASSEMBLY: '__ASSEMBLY__',
  ACTIVITY: '__ACTIVITY__',
}

function conflict(message: string, sectionId: string, day: number, startTime: string, endTime: string) {
  return { field: `${sectionId}.${day}.${startTime}-${endTime}`, message }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'create')
  if (denied) return denied

  const { id: templateId } = await params
  let template
  try {
    template = await prisma.timetableTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, academicYearId: true, shiftId: true, definition: true, name: true },
    })
  } catch (err) {
    return timetablePersistenceError(err, 'load timetable template')
  }
  if (!template) return errors.notFound('Timetable template')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON body')
  }
  const parsedRequest = generateTimetableTemplateSchema.safeParse(body)
  if (!parsedRequest.success) return errors.validation(parsedRequest.error)

  if (!Array.isArray(template.definition)) return errors.badRequest('This timetable template has an invalid definition')
  const blocksResult = timetableTemplateBlockSchema.array().safeParse(template.definition)
  if (!blocksResult.success) return errors.badRequest('This timetable template has an invalid definition')
  const blocks = blocksResult.data as TemplateBlock[]

  const year = await prisma.academicYear.findUnique({
    where: { id: template.academicYearId },
    select: { id: true, isLocked: true },
  })
  if (!year) return errors.notFound('Academic year')
  if (year.isLocked) return errors.forbidden('Academic year is locked')

  const sections = await prisma.classSection.findMany({
    where: {
      id: { in: parsedRequest.data.classSectionIds },
      ...(template.shiftId ? { shiftId: template.shiftId } : {}),
    },
    select: {
      id: true,
      className: true,
      sectionName: true,
      shift: { select: { startTime: true, endTime: true, name: true } },
    },
  })
  if (sections.length !== parsedRequest.data.classSectionIds.length) {
    return errors.badRequest('One or more selected sections do not match this template')
  }

  let existingSlots
  let offerings
  try {
    ;[existingSlots, offerings] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { academicYearId: template.academicYearId, classSectionId: { in: sections.map((s) => s.id) } },
        select: { id: true, classSectionId: true, dayOfWeek: true, startTime: true, endTime: true, teacherId: true, roomId: true, isPublished: true, templateId: true },
      }),
      prisma.subjectOffering.findMany({
        where: { academicYearId: template.academicYearId, classSectionId: { in: sections.map((s) => s.id) } },
        include: { subject: { select: { id: true, code: true, name: true } } },
      }),
    ])
  } catch (err) {
    return timetablePersistenceError(err, 'load timetable generation data')
  }

  const conflicts: Array<{ field: string; message: string }> = []
  const planned: Array<{
    academicYearId: string
    classSectionId: string
    subjectOfferingId: string
    teacherId: string | null
    roomId: string | null
    dayOfWeek: number
    startTime: string
    endTime: string
    slotType: TemplateBlock['slotType']
  }> = []

  for (const section of sections) {
    const sectionOfferings = offerings.filter((o) => o.classSectionId === section.id)
    for (const block of blocks) {
      const offering = block.slotType === 'SUBJECT'
        ? sectionOfferings.find((o) => o.subject.code.toUpperCase() === block.subjectCode?.toUpperCase())
        : null
      if (block.slotType === 'SUBJECT' && !offering) {
        conflicts.push({ field: section.id, message: `${section.className}-${section.sectionName}: subject ${block.subjectCode} is not offered for this section.` })
        continue
      }
      for (const day of block.days) {
        if (block.slotType === 'SUBJECT' && !isWithinShiftWindow(block.startTime, block.endTime, section.shift.startTime, section.shift.endTime)) {
          conflicts.push(conflict(`${section.className}-${section.sectionName}: time is outside ${section.shift.name} (${section.shift.startTime}-${section.shift.endTime}).`, section.id, day, block.startTime, block.endTime))
        }
        const current = existingSlots.filter((slot) => slot.classSectionId === section.id && slot.dayOfWeek === day && (!parsedRequest.data.replaceDrafts || slot.isPublished || slot.templateId !== templateId))
        const sameSection = [...current, ...planned.filter((slot) => slot.classSectionId === section.id && slot.dayOfWeek === day)]
        for (const slot of sameSection) {
          if (timesOverlap(block.startTime, block.endTime, slot.startTime, slot.endTime)) {
            conflicts.push(conflict(`${section.className}-${section.sectionName} already has a timetable entry at this time.`, section.id, day, block.startTime, block.endTime))
            break
          }
        }
        if (offering?.teacherId) {
          const teacherOverlap = existingSlots.some((slot) => slot.teacherId === offering.teacherId && slot.dayOfWeek === day && (!parsedRequest.data.replaceDrafts || slot.isPublished || slot.templateId !== templateId) && timesOverlap(block.startTime, block.endTime, slot.startTime, slot.endTime))
            || planned.some((slot) => slot.teacherId === offering.teacherId && slot.dayOfWeek === day && timesOverlap(block.startTime, block.endTime, slot.startTime, slot.endTime))
          if (teacherOverlap) conflicts.push(conflict(`Teacher assigned to ${block.subjectCode} is already busy at this time.`, section.id, day, block.startTime, block.endTime))
        } else if (block.slotType === 'SUBJECT') {
          conflicts.push(conflict(`${section.className}-${section.sectionName}: ${block.subjectCode} has no teacher assignment.`, section.id, day, block.startTime, block.endTime))
        }
        if (block.roomId) {
          const roomOverlap = existingSlots.some((slot) => slot.roomId === block.roomId && slot.dayOfWeek === day && (!parsedRequest.data.replaceDrafts || slot.isPublished || slot.templateId !== templateId) && timesOverlap(block.startTime, block.endTime, slot.startTime, slot.endTime))
            || planned.some((slot) => slot.roomId === block.roomId && slot.dayOfWeek === day && timesOverlap(block.startTime, block.endTime, slot.startTime, slot.endTime))
          if (roomOverlap) conflicts.push(conflict('Selected room is already booked at this time.', section.id, day, block.startTime, block.endTime))
        }
        planned.push({
          academicYearId: template.academicYearId,
          classSectionId: section.id,
          subjectOfferingId: offering?.id ?? '',
          teacherId: offering?.teacherId ?? null,
          roomId: block.roomId ?? null,
          dayOfWeek: day,
          startTime: block.startTime,
          endTime: block.endTime,
          slotType: block.slotType,
        })
      }
    }
  }

  if (conflicts.length > 0) {
    return errorResponse('TIMETABLE_CONFLICT', 'Timetable preview found conflicts. Nothing was written.', 409, conflicts.slice(0, 100))
  }

  try {
    const generated = await prisma.$transaction(async (tx) => {
      if (parsedRequest.data.replaceDrafts) {
        await tx.timetableSlot.deleteMany({ where: { templateId, isPublished: false, classSectionId: { in: sections.map((s) => s.id) } } })
      }

      const periodOfferingIds = new Map<string, string>()
      for (const slot of planned.filter((entry) => entry.slotType !== 'SUBJECT')) {
        const code = PERIOD_CODES[slot.slotType as Exclude<TemplateBlock['slotType'], 'SUBJECT'>]
        const key = `${slot.classSectionId}:${code}`
        if (periodOfferingIds.has(key)) continue
        const subject = await tx.academicSubject.upsert({ where: { code }, create: { code, name: code.slice(2).replace('_', ' ') }, update: {} })
        const offering = await tx.subjectOffering.upsert({
          where: subjectOfferingUniqueWhere(template.academicYearId, slot.classSectionId, subject.id),
          create: { classSectionId: slot.classSectionId, academicYearId: template.academicYearId, subjectId: subject.id, teacherId: null, isMandatory: true },
          update: {},
        })
        periodOfferingIds.set(key, offering.id)
      }

      for (const slot of planned) {
        const subjectOfferingId = slot.subjectOfferingId || periodOfferingIds.get(`${slot.classSectionId}:${PERIOD_CODES[slot.slotType as Exclude<TemplateBlock['slotType'], 'SUBJECT'>]}`)
        if (!subjectOfferingId) throw new Error('PERIOD_OFFERING_NOT_CREATED')
        await tx.timetableSlot.create({
          data: { ...slot, subjectOfferingId, templateId, isPublished: parsedRequest.data.publish },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'TimetableTemplateGeneration',
          entityId: templateId,
          changes: { sections: sections.map((s) => s.id), slots: planned.length, publish: parsedRequest.data.publish },
        },
      })
      return planned.length
    })

    return successResponse({ templateId, generatedSlots: generated, published: parsedRequest.data.publish }, 'Timetable generated successfully')
  } catch (err) {
    return timetablePersistenceError(err, 'generate timetable')
  }
}
