import { prisma } from '@/lib/prisma'

/** Parse HH:mm to minutes since midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = timeToMinutes(aStart)
  const a1 = timeToMinutes(aEnd)
  const b0 = timeToMinutes(bStart)
  const b1 = timeToMinutes(bEnd)
  return a0 < b1 && b0 < a1
}

export function isWithinShiftWindow(
  startTime: string,
  endTime: string,
  shiftStartTime: string,
  shiftEndTime: string
): boolean {
  return timeToMinutes(startTime) >= timeToMinutes(shiftStartTime) && timeToMinutes(endTime) <= timeToMinutes(shiftEndTime)
}

export async function assertAcademicYearEditable(academicYearId: string): Promise<void> {
  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { isLocked: true, name: true },
  })
  if (!year) throw new Error('ACADEMIC_YEAR_NOT_FOUND')
  if (year.isLocked) throw new Error('ACADEMIC_YEAR_LOCKED')
}

export async function getActiveAcademicYear() {
  return prisma.academicYear.findFirst({ where: { isActive: true } })
}

export type TimetableConflict = {
  type: 'TEACHER' | 'ROOM' | 'SECTION' | 'SHIFT' | 'CAMPUS'
  message: string
  slotId?: string
}

export async function validateTimetableSlot(params: {
  academicYearId: string
  classSectionId: string
  subjectOfferingId: string
  teacherId: string
  roomId?: string | null
  dayOfWeek: number
  startTime: string
  endTime: string
  excludeSlotId?: string
}): Promise<TimetableConflict[]> {
  const conflicts: TimetableConflict[] = []

  const section = await prisma.classSection.findUnique({
    where: { id: params.classSectionId },
    include: { shift: true, campus: true },
  })
  if (!section) {
    conflicts.push({ type: 'SECTION', message: 'Class section not found' })
    return conflicts
  }

  if (!isWithinShiftWindow(params.startTime, params.endTime, section.shift.startTime, section.shift.endTime)) {
    conflicts.push({
      type: 'SHIFT',
      message: `Slot must fall within ${section.shift.name} (${section.shift.startTime}–${section.shift.endTime})`,
    })
  }

  const sameWindow = {
    academicYearId: params.academicYearId,
    dayOfWeek: params.dayOfWeek,
    NOT: params.excludeSlotId ? { id: params.excludeSlotId } : undefined,
  }

  const existing = await prisma.timetableSlot.findMany({
    where: sameWindow,
    include: {
      classSection: { include: { campus: true, shift: true } },
      teacher: true,
    },
  })

  for (const slot of existing) {
    if (!timesOverlap(params.startTime, params.endTime, slot.startTime, slot.endTime)) continue

    if (slot.teacherId === params.teacherId) {
      conflicts.push({
        type: 'TEACHER',
        message: `Teacher already scheduled (${slot.startTime}–${slot.endTime})`,
        slotId: slot.id,
      })
    }

    if (params.roomId && slot.roomId === params.roomId) {
      conflicts.push({
        type: 'ROOM',
        message: `Room already booked (${slot.startTime}–${slot.endTime})`,
        slotId: slot.id,
      })
    }

    if (slot.classSectionId === params.classSectionId) {
      conflicts.push({
        type: 'SECTION',
        message: `Section already has a class (${slot.startTime}–${slot.endTime})`,
        slotId: slot.id,
      })
    }

    if (
      slot.teacherId === params.teacherId &&
      slot.classSection.campusId !== section.campusId
    ) {
      conflicts.push({
        type: 'CAMPUS',
        message: 'Teacher cannot be at two campuses simultaneously',
        slotId: slot.id,
      })
    }
  }

  return conflicts
}

export function validateGradingWeights(
  components: { weightPercentage: number }[]
): { valid: boolean; total: number } {
  const total = components.reduce((s, c) => s + c.weightPercentage, 0)
  return { valid: Math.abs(total - 100) < 0.01, total }
}

export function calculateWeightedPercentage(
  components: { maxMarks: number; weightPercentage: number; obtained: number }[]
): number {
  let weighted = 0
  for (const c of components) {
    const pct = c.maxMarks > 0 ? (c.obtained / c.maxMarks) * 100 : 0
    weighted += pct * (c.weightPercentage / 100)
  }
  return Math.round(weighted * 100) / 100
}

export function calculatePenaltyAmount(
  type: 'FIXED' | 'PERCENTAGE',
  penaltyValue: number,
  baseAmount: number,
  maxPenalty?: number | null
): number {
  let penalty = type === 'FIXED' ? penaltyValue : (baseAmount * penaltyValue) / 100
  if (maxPenalty != null && penalty > maxPenalty) penalty = maxPenalty
  return Math.round(penalty * 100) / 100
}

export async function ensureSingleActiveAcademicYear(activeId: string): Promise<void> {
  await prisma.academicYear.updateMany({
    where: { isActive: true, NOT: { id: activeId } },
    data: { isActive: false },
  })
}
