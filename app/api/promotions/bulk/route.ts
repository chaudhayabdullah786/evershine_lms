import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { autoEnrollMandatorySubjects } from '@/lib/academic/enrollment'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const bulkItemSchema = z.object({
  studentId: z.string().cuid(),
  status: z.enum(['PROMOTED', 'RETAINED', 'GRADUATED', 'TRANSFERRED']),
  toClassSectionId: z.string().cuid().optional().nullable(),
})

const bulkSchema = z.object({
  fromAcademicYearId: z.string().cuid(),
  toAcademicYearId: z.string().cuid(),
  fromClassSectionId: z.string().cuid(),
  items: z.array(bulkItemSchema).min(1, 'At least one student is required'),
}).superRefine((data, ctx) => {
  data.items.forEach((item, index) => {
    if ((item.status === 'PROMOTED' || item.status === 'TRANSFERRED') && !item.toClassSectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'toClassSectionId'],
        message: 'Target class section is required for promoted or transferred students',
      })
    }
  })
})

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'promotions', 'create')
  if (denied) return denied

  const parsed = bulkSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const toYear = await prisma.academicYear.findUnique({
    where: { id: parsed.data.toAcademicYearId },
  })
  if (!toYear) return errors.notFound('Target academic year')
  if (toYear.isLocked) return errors.forbidden('Target year is locked')

  const results = await prisma.$transaction(async (tx) => {
    const out: Array<{ studentId: string; promotionStatus: string; ok: boolean }> = []

    for (const item of parsed.data.items) {
      const fromEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId: item.studentId,
          academicYearId: parsed.data.fromAcademicYearId,
          classSectionId: parsed.data.fromClassSectionId,
          status: 'ACTIVE',
        },
      })
      if (!fromEnrollment) {
        out.push({ studentId: item.studentId, promotionStatus: item.status, ok: false })
        continue
      }

      const newStatus =
        item.status === 'GRADUATED'
          ? 'GRADUATED'
          : item.status === 'RETAINED'
            ? 'RETAINED'
            : item.status === 'TRANSFERRED'
              ? 'TRANSFERRED'
              : 'PROMOTED'

      await tx.studentEnrollment.update({
        where: { id: fromEnrollment.id },
        data: { status: newStatus },
      })

      let toEnrollmentId: string | null = null
      const targetSectionId =
        item.toClassSectionId ??
        (item.status === 'RETAINED' ? parsed.data.fromClassSectionId : null)

      if (
        (item.status === 'PROMOTED' || item.status === 'RETAINED') &&
        targetSectionId
      ) {
        const existing = await tx.studentEnrollment.findUnique({
          where: {
            studentId_academicYearId_classSectionId: {
              studentId: item.studentId,
              academicYearId: parsed.data.toAcademicYearId,
              classSectionId: targetSectionId,
            },
          },
        })
        if (!existing) {
          const created = await tx.studentEnrollment.create({
            data: {
              studentId: item.studentId,
              academicYearId: parsed.data.toAcademicYearId,
              classSectionId: targetSectionId,
              rollNumber: fromEnrollment.rollNumber,
              deliveryMode: fromEnrollment.deliveryMode,
              promotedFromId: fromEnrollment.id,
              status: 'ACTIVE',
            },
          })
          await autoEnrollMandatorySubjects(
            created.id,
            targetSectionId,
            parsed.data.toAcademicYearId
          )
          toEnrollmentId = created.id
        } else {
          toEnrollmentId = existing.id
        }
        await tx.student.update({
          where: { id: item.studentId },
          data: { academicYear: toYear.name },
        })
      }

      if (item.status === 'GRADUATED') {
        await tx.student.update({
          where: { id: item.studentId },
          data: { enrollmentStatus: 'GRADUATED' },
        })
      }

      await tx.promotionRecord.create({
        data: {
          studentId: item.studentId,
          academicYearId: parsed.data.fromAcademicYearId,
          fromEnrollmentId: fromEnrollment.id,
          toEnrollmentId,
          promotionStatus: item.status,
          promotedById: session.user.id,
        },
      })

      out.push({ studentId: item.studentId, promotionStatus: item.status, ok: true })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BULK_PROMOTE',
        entityType: 'Promotion',
        entityId: parsed.data.fromAcademicYearId,
        changes: { count: parsed.data.items.length },
      },
    })

    return out
  })

  return createdResponse(results, 'Bulk promotion applied')
}
