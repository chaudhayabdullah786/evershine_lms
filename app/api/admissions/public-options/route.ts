import { prisma } from '@/lib/prisma'
import { successResponse } from '@/lib/api-response'
import { SESSION_SHIFT_TIMES } from '@/lib/validation/shift'

/** Public metadata for admission form (no auth required). */
export async function GET() {
  const campuses = await prisma.campus.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  })

  const batches = await prisma.batch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, campusId: true },
    orderBy: { name: 'asc' },
  })

  let shifts = await prisma.shift.findMany({
    where: { isActive: true },
    select: { code: true, name: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  })

  if (shifts.length === 0) {
    shifts = (['MORNING', 'EVENING', 'NIGHT'] as const).map((code) => ({
      code,
      name: `${code.charAt(0)}${code.slice(1).toLowerCase()} Shift`,
      startTime: SESSION_SHIFT_TIMES[code].start,
      endTime: SESSION_SHIFT_TIMES[code].end,
    }))
  }

  return successResponse({
    campuses,
    batches,
    shifts,
    deliveryModes: ['PHYSICAL', 'ONLINE', 'HYBRID'],
  })
}
