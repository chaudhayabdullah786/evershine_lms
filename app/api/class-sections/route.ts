import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission, campusScope } from '@/lib/academic/api-helpers'
import { createClassSectionSchema } from '@/lib/validation/academic'
import { getTeacherByUserId, getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const scopedCampus = campusScope(
    session.user.role as Role,
    session.user.campusId,
    searchParams.get('campusId')
  )

  const role = session.user.role as Role
  let teacherSectionIds: string[] | undefined
  if (role === 'TEACHER') {
    const teacher = await getTeacherByUserId(session.user.id)
    if (!teacher) return successResponse([])
    teacherSectionIds = await getTeacherClassSectionIds(teacher.id)
    if (teacherSectionIds.length === 0) return successResponse([])
  }

  const sections = await prisma.classSection.findMany({
    where: {
      isActive: true,
      ...(teacherSectionIds && { id: { in: teacherSectionIds } }),
      ...(scopedCampus && { campusId: scopedCampus }),
      ...(searchParams.get('batchId') && { batchId: searchParams.get('batchId')! }),
      ...(searchParams.get('shiftId') && { shiftId: searchParams.get('shiftId')! }),
      ...(searchParams.get('deliveryMode') && {
        deliveryMode: searchParams.get('deliveryMode') as 'PHYSICAL' | 'ONLINE' | 'HYBRID',
      }),
    },
    include: {
      campus: { select: { name: true, code: true } },
      batch: { select: { name: true, code: true } },
      shift: { select: { name: true, code: true, startTime: true, endTime: true } },
      _count: { select: { enrollments: true, subjectOfferings: true } },
    },
    orderBy: [{ grade: 'asc' }, { className: 'asc' }, { sectionName: 'asc' }],
  })

  return successResponse(sections)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'create')
  if (denied) return denied

  const parsed = createClassSectionSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  if (
    session.user.role !== 'SUPER_ADMIN' &&
    parsed.data.campusId !== session.user.campusId
  ) {
    return errors.forbidden()
  }

  const existingSection = await prisma.classSection.findFirst({
    where: {
      campusId: parsed.data.campusId,
      batchId: parsed.data.batchId,
      shiftId: parsed.data.shiftId,
      className: parsed.data.className.trim(),
      sectionName: parsed.data.sectionName.trim(),
    },
    select: { id: true },
  })

  if (existingSection) {
    return errors.conflict('A class section with this campus, batch, shift, class, and section name already exists.')
  }

  let section
  try {
    section = await prisma.$transaction(async (tx) => {
      const created = await tx.classSection.create({
        data: {
          ...parsed.data,
          className: parsed.data.className.trim(),
          sectionName: parsed.data.sectionName.trim(),
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'ClassSection',
          entityId: created.id,
          changes: parsed.data,
        },
      })

      return created
    })
  } catch (txErr: any) {
    if (txErr?.code === 'P2002') {
      return errors.conflict('A class section with this campus, batch, shift, class, and section name already exists.')
    }

    console.error('[CLASS_SECTIONS_POST] transaction error', txErr)
    return errors.internal()
  }

  return createdResponse(section)
}
