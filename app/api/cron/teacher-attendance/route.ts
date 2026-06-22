import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SESSION_SHIFT_TIMES, ATTENDANCE_POLICY, type SessionShift } from '@/lib/validation/shift'
import { timeToMinutes } from '@/lib/academic/engine'
import type { SessionShift as PrismaShift } from '@prisma/client'

function currentMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/** JS Sunday=0 → TimetableSlot 1=Mon … 7=Sun */
function timetableDayOfWeek(d: Date): number {
  const js = d.getDay()
  return js === 0 ? 7 : js
}

/**
 * After each shift ends, mark teachers with published slots but no check-in as ABSENT.
 * Run hourly via CRON_SECRET (e.g. Vercel cron).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const dow = timetableDayOfWeek(now)
  const nowMin = currentMinutes()

  const shiftRows = await prisma.shift.findMany()
  const shifts: PrismaShift[] =
    shiftRows.length > 0
      ? shiftRows.map((s) => s.code)
      : (['MORNING', 'EVENING', 'NIGHT'] as PrismaShift[])

  let markedAbsent = 0

  for (const shiftCode of shifts) {
    const row = shiftRows.find((s) => s.code === shiftCode)
    const endTime = row?.endTime ?? SESSION_SHIFT_TIMES[shiftCode as SessionShift].end
    const endMin = timeToMinutes(endTime)
    if (nowMin < endMin + 30) continue

    const slots = await prisma.timetableSlot.findMany({
      where: {
        dayOfWeek: dow,
        isPublished: true,
        classSection: { shift: { code: shiftCode } },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    })

    for (const { teacherId } of slots) {
      const existing = await prisma.teacherAttendance.findUnique({
        where: {
          teacherId_date_shift: { teacherId, date: today, shift: shiftCode },
        },
      })
      if (existing) continue

      await prisma.teacherAttendance.create({
        data: {
          teacherId,
          date: today,
          shift: shiftCode,
          status: 'ABSENT',
          hrStatus: 'ABSENT',
          remarks: 'Auto-marked: no check-in recorded before shift end',
        },
      })
      markedAbsent++
    }
  }

  return NextResponse.json({
    success: true,
    date: today.toISOString().slice(0, 10),
    dayOfWeek: dow,
    markedAbsent,
  })
}
