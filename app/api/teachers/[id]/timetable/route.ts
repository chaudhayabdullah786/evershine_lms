/**
 * GET /api/teachers/[id]/timetable — fetch a teacher's weekly timetable
 *
 * ARCHITECTURE NOTE: This system has two timetable models in parallel:
 *   1. `TimetableSlot`  — New Academic Engine. Requires isPublished=true and
 *      an AcademicYear FK. Published via /api/timetable/slots (PUT).
 *   2. `Timetable`      — Legacy model. Used by /api/timetable (POST) and
 *      the admin classroom timetable builder.
 *
 * WHY DUAL FALLBACK: The admin may have scheduled via either system. We query
 * the new engine first (published slots). If zero results come back — whether
 * because no AcademicYear is active, no slots are published, or the academic
 * engine has not been used — we transparently fall back to the legacy model.
 * The response shape is normalised so the frontend is unaware of the source.
 *
 * TRADEOFF: Two DB round-trips in the fallback path. Acceptable at this
 * request frequency; a materialised view or caching layer would eliminate this
 * at higher scale.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { timetableQuerySchema } from '@/lib/validation/teacher'
import type { Role } from '@prisma/client'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'read')) return errors.forbidden()

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: {
      id: true,
      campusId: true,
      userId: true,
      firstName: true,
      lastName: true,
      designation: true,
    },
  })
  if (!teacher) return errors.notFound('Teacher')

  // Row-level: teachers can only see their own timetable
  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }

  // Campus scope for ADMIN
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const parsed = timetableQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { academicYear, dayOfWeek, shift } = parsed.data

  // ── Attempt 1: New Academic Engine (TimetableSlot) ────────────────────────
  //
  // WHY relaxed academicYear lookup: We no longer hard-fail if there is no
  // *active* year — we fall through to the most recently created year, then
  // to the legacy model. This prevents the silent empty-response bug where a
  // teacher sees no timetable because no AcademicYear row has isActive=true.
  const currentYear = new Date().getFullYear()
  const resolvedYearName = academicYear ?? `${currentYear}-${currentYear + 1}`

  // Try active year first, then any year with that name, then most recent year
  const activeYear =
    (await prisma.academicYear.findFirst({
      where: { name: resolvedYearName, isActive: true },
      select: { id: true, name: true },
    })) ??
    (await prisma.academicYear.findFirst({
      where: { name: resolvedYearName },
      select: { id: true, name: true },
    })) ??
    (await prisma.academicYear.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true },
    }))

  let newEngineSlots: NormalizedSlot[] = []

  if (activeYear) {
    const entries = await prisma.timetableSlot.findMany({
      where: {
        teacherId: id,
        academicYearId: activeYear.id,
        isPublished: true,
        ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek + 1 }), // Schema: 1=Mon
        ...(shift && { classSection: { shift: { code: shift } } }),
      },
      include: {
        classSection: {
          select: {
            id: true,
            className: true,
            sectionName: true,
            shift: { select: { id: true, name: true, code: true } },
          },
        },
        subjectOffering: {
          select: {
            id: true,
            subject: { select: { id: true, name: true } },
          },
        },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    newEngineSlots = entries.map((entry) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek - 1, // Normalise: UI uses 0=Monday
      startTime: entry.startTime,
      endTime: entry.endTime,
      subjectName: entry.subjectOffering?.subject?.name ?? 'Unknown Subject',
      className: entry.classSection?.className ?? '',
      sectionName: entry.classSection?.sectionName ?? '',
      shift: entry.classSection?.shift?.code ?? null,
      teacher: entry.teacher,
      source: 'engine' as const,
    }))
  }

  // Return new engine results if we have any
  if (newEngineSlots.length > 0) {
    return successResponse(newEngineSlots)
  }

  // ── Attempt 2: Legacy Timetable model (fallback) ──────────────────────────
  //
  // WHY: The admin may have built the timetable using the legacy /api/timetable
  // route (which writes to the `Timetable` model with a direct `shift` enum
  // field rather than a FK to ClassSection.shift). We return these results
  // transparently with the same normalised shape so the teacher portal works
  // regardless of which system the admin used.
  const legacyWhere: Record<string, unknown> = {
    teacherId: id,
    isActive: true,
    ...(dayOfWeek !== undefined && { dayOfWeek }),
    ...(shift && { shift }),
  }

  const legacySlots = await prisma.timetable.findMany({
    where: legacyWhere,
    include: {
      class: {
        select: {
          id: true,
          name: true,
          grade: true,
          section: true,
          shift: true,
        },
      },
      teacher: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  const normalizedLegacy: NormalizedSlot[] = legacySlots.map((slot) => ({
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    subjectName: slot.subjectName,
    className: slot.class?.name ?? '',
    sectionName: slot.class?.section ?? '',
    shift: slot.shift ?? null,
    teacher: slot.teacher,
    source: 'legacy' as const,
  }))

  return successResponse(normalizedLegacy)
}

// ── Shared normalised slot shape ───────────────────────────────────────────────
interface NormalizedSlot {
  id: string
  dayOfWeek: number   // 0=Monday … 5=Saturday
  startTime: string
  endTime: string
  subjectName: string
  className: string
  sectionName: string
  shift: string | null
  teacher: { id: string; firstName: string; lastName: string } | null
  source: 'engine' | 'legacy'
}
