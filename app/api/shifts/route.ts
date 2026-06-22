import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SessionShift } from '@prisma/client'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createShiftSchema } from '@/lib/validation/academic'
import { SESSION_SHIFT_TIMES } from '@/lib/validation/shift'
import type { Role } from '@prisma/client'

const DEFAULT_SHIFTS: { code: SessionShift; name: string }[] = [
  { code: 'MORNING', name: 'Morning Shift' },
  { code: 'EVENING', name: 'Evening Shift' },
  { code: 'NIGHT', name: 'Night Shift' },
]

export async function GET() {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'shifts', 'read')
  if (denied) return denied

  let shifts = await prisma.shift.findMany({ orderBy: { startTime: 'asc' } })

  if (shifts.length === 0) {
    shifts = await prisma.$transaction(
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
  }

  return successResponse(shifts)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'shifts', 'create')
  if (denied) return denied

  const parsed = createShiftSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.shift.create({ data: parsed.data })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Shift',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(shift)
}
