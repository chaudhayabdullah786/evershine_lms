/**
 * GET  /api/classes  — list classes
 * POST /api/classes  — create class
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createClassSchema } from '@/lib/validation/batch'
import { sessionShiftSchema } from '@/lib/validation/shift'
import type { Prisma, Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campusId')
  const batchId = searchParams.get('batchId')
  const shiftParam = searchParams.get('shift')
  const shiftParsed = shiftParam ? sessionShiftSchema.safeParse(shiftParam) : null
  if (shiftParam && shiftParsed && !shiftParsed.success) {
    return errors.validation(shiftParsed.error)
  }

  const canManageCrossCampus = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'

  // [NOTE] Teachers should use /api/teacher-portal/classes endpoint instead
  // This endpoint is primarily for admin/super_admin class management
  // Teachers get their filtered class list from the dedicated endpoint which handles
  // deduplication across legacy and new academic engine data sources

  // WHY: SUPER_ADMIN and ADMIN see ALL classes across all campuses unless a specific
  // campusId is passed explicitly. Falling back to session.user.campusId
  // silently filtered out entire campuses (Girls Campus was hidden).
  const scopedCampusId = canManageCrossCampus
    ? (campusId || undefined)                        // explicit filter only
    : (campusId || session.user.campusId || undefined) // always scope non-admins

  const where = {
    ...(scopedCampusId && { campusId: scopedCampusId }),
    ...(batchId && { batchId }),
    ...(shiftParsed?.success && { shift: shiftParsed.data }),
    isActive: true,
  }

  const classes = await prisma.class.findMany({
    where,
    orderBy: [{ grade: 'asc' }, { section: 'asc' }],
    include: {
      campus: { select: { name: true } },
      batch: { select: { name: true } },
      _count: {
        select: { students: true, subjects: true },
      },
    },
  })

  return successResponse(classes)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createClassSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data: Prisma.ClassUncheckedCreateInput = {
    name: parsed.data.name!,
    grade: parsed.data.grade!,
    section: parsed.data.section,
    shift: parsed.data.shift,
    campusId: parsed.data.campusId!,
    batchId: parsed.data.batchId,
    academicYear: parsed.data.academicYear!,
    capacity: parsed.data.capacity,
    roomNumber: parsed.data.roomNumber,
  }

  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN' && data.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const existing = await prisma.class.findUnique({
    where: {
      grade_section_campusId_academicYear_shift: {
        grade: data.grade,
        section: data.section ?? '',
        campusId: data.campusId,
        academicYear: data.academicYear,
        shift: data.shift,
      },
    },
    select: { id: true }
  })
  if (existing) return errors.conflict('This class already exists for the given academic year and session shift')

  const newClass = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.create({ data })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Class',
        entityId: cls.id,
        changes: {
          name: data.name,
          grade: data.grade,
          section: data.section ?? null,
          shift: data.shift,
          campusId: data.campusId,
          batchId: data.batchId ?? null,
          academicYear: data.academicYear,
          capacity: data.capacity,
          roomNumber: data.roomNumber ?? null,
        },
      },
    })

    return cls
  })

  return createdResponse(newClass, 'Class created successfully')
}