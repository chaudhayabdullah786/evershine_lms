import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(5),
  classId: z.string().min(1, 'Class is required'),
  classSectionId: z.string().nullable().optional(),
  legacyClassId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit } = parsed.data

  const where = {
    createdBy: session.user.id,
    isActive: true,
  }

  const [total, announcements] = await prisma.$transaction([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' },
      include: {
        class: { select: { id: true, name: true, section: true } }
      }
    }),
  ])

  return paginatedResponse(announcements, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, content, classId, classSectionId, legacyClassId, expiresAt } = parsed.data

  // ── Resolve ClassSection (New Academic Engine) ──────────────────────────
  // WHY: classId from the frontend may be a ClassSection ID (new engine) or
  // a legacy Class ID. We probe the ClassSection table first.
  const candidateClassSectionId =
    classSectionId ??
    (await prisma.classSection
      .findUnique({ where: { id: classId } })
      .then((row) => row?.id ?? null))

  const candidateLegacyClassId = legacyClassId ?? classId

  const classSection = candidateClassSectionId
    ? await prisma.classSection.findUnique({
        where: { id: candidateClassSectionId },
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          campusId: true,
          batchId: true,
          shift: { select: { code: true, name: true } },
        },
      })
    : null

  // ── Resolve legacy Class record ────────────────────────────────────────
  // WHY: The Announcement model FK references the legacy Class table.
  // When the teacher is assigned via ClassSection, we attempt to find the
  // matching legacy Class. If none exists, the announcement can still be
  // created with classId=null (the Announcement.classId is optional).
  let legacyClassRecord: { id: string; name: string; section: string | null; batchId: string | null } | null = null

  if (classSection) {
    // Try matching legacy Class by structural attributes
    const shiftCode = (classSection.shift?.code ?? classSection.shift?.name ?? '')
      .toUpperCase()
      .replace(/\s+/g, '')
      // Normalize: strip trailing "SHIFT" if present (e.g. "MORNINGSHIFT" → "MORNING")
      .replace(/SHIFT$/, '')

    legacyClassRecord = await prisma.class.findFirst({
      where: {
        grade: classSection.grade ?? 0,
        section: classSection.sectionName,
        campusId: classSection.campusId,
        batchId: classSection.batchId,
        ...(shiftCode ? { shift: shiftCode as any } : {}),
        isActive: true,
      },
      select: { id: true, name: true, section: true, batchId: true },
    })

    // Fallback: try without shift filter (shift enum mismatch is the most common failure)
    if (!legacyClassRecord) {
      legacyClassRecord = await prisma.class.findFirst({
        where: {
          grade: classSection.grade ?? 0,
          section: classSection.sectionName,
          campusId: classSection.campusId,
          batchId: classSection.batchId,
          isActive: true,
        },
        select: { id: true, name: true, section: true, batchId: true },
      })
    }
  } else {
    // classId is a legacy Class ID directly
    legacyClassRecord = await prisma.class.findUnique({
      where: { id: candidateLegacyClassId },
      select: { id: true, name: true, section: true, batchId: true },
    })
  }

  // ── Verify teacher assignment ──────────────────────────────────────────
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const resolvedLegacyClassId = legacyClassRecord?.id ?? null

  const isAssigned =
    // Legacy: ClassTeacher
    (resolvedLegacyClassId
      ? await prisma.classTeacher.findFirst({
          where: { classId: resolvedLegacyClassId, teacherId: teacher.id },
        })
      : null) ||
    // Legacy: SubjectTeacher
    (resolvedLegacyClassId
      ? await prisma.subjectTeacher.findFirst({
          where: { subject: { classId: resolvedLegacyClassId }, teacherId: teacher.id },
        })
      : null) ||
    // New engine: SubjectOffering → ClassSection
    (candidateClassSectionId
      ? await prisma.subjectOffering.findFirst({
          where: { teacherId: teacher.id, classSectionId: candidateClassSectionId },
          select: { id: true },
        })
      : null) ||
    // New engine: TimetableSlot → ClassSection
    (candidateClassSectionId
      ? await prisma.timetableSlot.findFirst({
          where: {
            teacherId: teacher.id,
            classSectionId: candidateClassSectionId,
            isPublished: true,
          },
          select: { id: true },
        })
      : null)

  if (!isAssigned) {
    return errors.forbidden('You are not assigned to this class')
  }

  // ── Build announcement display metadata ────────────────────────────────
  // WHY: Even when no legacy Class exists, we need a name/section for the
  // announcement display and student notifications.
  const displayName =
    legacyClassRecord?.name ?? classSection?.className ?? 'Class'
  const displaySection =
    legacyClassRecord?.section ?? classSection?.sectionName ?? ''
  const resolvedBatchId =
    legacyClassRecord?.batchId ?? classSection?.batchId ?? null

  const announcement = await prisma.announcement.create({
    data: {
      title,
      content,
      // classId is nullable — safe when only ClassSection exists
      classId: resolvedLegacyClassId,
      batchId: resolvedBatchId,
      targetRole: 'STUDENT',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      publishedAt: new Date(),
      createdBy: session.user.id,
    },
    include: {
      class: { select: { name: true, section: true } },
    },
  })

  // ── Notify students ────────────────────────────────────────────────────
  // WHY: Use ClassSection enrollment when available (more accurate for
  // engine-based classes), fall back to batch-level query for legacy.
  let studentUserIds: string[] = []

  if (candidateClassSectionId) {
    // New engine: students enrolled in this ClassSection via StudentEnrollment
    const enrolledStudents = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: candidateClassSectionId,
        status: 'ACTIVE',
      },
      select: { student: { select: { userId: true, isActive: true, enrollmentStatus: true } } },
    })
    studentUserIds = enrolledStudents
      .filter((e) => e.student.isActive && e.student.enrollmentStatus === 'ACTIVE')
      .map((e) => e.student.userId)
  }

  // Fallback/supplement: batch-level + legacy classId query
  if (studentUserIds.length === 0 && (resolvedLegacyClassId || resolvedBatchId)) {
    const batchStudents = await prisma.student.findMany({
      where: {
        ...(resolvedLegacyClassId ? { classId: resolvedLegacyClassId } : {}),
        ...(resolvedBatchId ? { batchId: resolvedBatchId } : {}),
        isActive: true,
        enrollmentStatus: 'ACTIVE',
      },
      select: { userId: true },
    })
    studentUserIds = batchStudents.map((s) => s.userId)
  }

  if (studentUserIds.length > 0) {
    await prisma.notification.createMany({
      data: studentUserIds.map((userId) => ({
        userId,
        title: 'New Announcement',
        message: `${title} — ${displayName} (${displaySection})`,
        type: 'GENERAL',
        relatedId: announcement.id,
      })),
    })
  }

  return createdResponse(announcement, 'Announcement published to class successfully')
}
