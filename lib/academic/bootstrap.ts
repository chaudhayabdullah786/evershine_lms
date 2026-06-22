import { prisma } from '@/lib/prisma'
import { SessionShift } from '@prisma/client'
import { SESSION_SHIFT_TIMES } from '@/lib/validation/shift'

const DEFAULT_SHIFTS: { code: SessionShift; name: string }[] = [
  { code: 'MORNING', name: 'Morning Shift' },
  { code: 'EVENING', name: 'Evening Shift' },
  { code: 'NIGHT', name: 'Night Shift' },
]

export type AcademicBootstrapResult = {
  shiftsCreated: number
  yearCreated: boolean
  activeYear: { id: string; name: string } | null
}

/** Idempotent foundation: M/E/N shifts + one active academic year if missing. */
export async function bootstrapAcademicFoundation(options?: {
  yearName?: string
  startDate?: string
  endDate?: string
}): Promise<AcademicBootstrapResult> {
  let shiftsCreated = 0
  const existingShifts = await prisma.shift.count()
  if (existingShifts === 0) {
    await prisma.$transaction(
      DEFAULT_SHIFTS.map((s) =>
        prisma.shift.create({
          data: {
            code: s.code,
            name: s.name,
            startTime: SESSION_SHIFT_TIMES[s.code].start,
            endTime: SESSION_SHIFT_TIMES[s.code].end,
            lateGraceMinutes: 15,
          },
        })
      )
    )
    shiftsCreated = DEFAULT_SHIFTS.length
  } else {
    for (const s of DEFAULT_SHIFTS) {
      await prisma.shift.updateMany({
        where: { code: s.code },
        data: {
          startTime: SESSION_SHIFT_TIMES[s.code].start,
          endTime: SESSION_SHIFT_TIMES[s.code].end,
        },
      })
    }
  }

  let activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } })
  let yearCreated = false

  if (!activeYear) {
    const anyYear = await prisma.academicYear.findFirst({ orderBy: { startDate: 'desc' } })
    if (anyYear) {
      activeYear = await prisma.academicYear.update({
        where: { id: anyYear.id },
        data: { isActive: true },
      })
    } else {
      const name = options?.yearName ?? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
      const start = options?.startDate ?? `${new Date().getFullYear()}-04-01`
      const end = options?.endDate ?? `${new Date().getFullYear() + 1}-03-31`
      activeYear = await prisma.academicYear.create({
        data: {
          name,
          startDate: new Date(start),
          endDate: new Date(end),
          isActive: true,
          isLocked: false,
        },
      })
      yearCreated = true
    }
  }

  return {
    shiftsCreated,
    yearCreated,
    activeYear: activeYear ? { id: activeYear.id, name: activeYear.name } : null,
  }
}
