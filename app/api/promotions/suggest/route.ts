import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import {
  suggestNextClassSection,
  type PromotionWizardRow,
} from '@/lib/academic/promotion-suggest'
import { calculateWeightedPercentage } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

async function computeOverallPercentage(
  enrollmentId: string,
  academicYearId: string,
  classSectionId: string,
  subjectEnrollments: Array<{ subjectOffering: { subjectId: string } }>
): Promise<number | null> {
  const pcts: number[] = []
  for (const se of subjectEnrollments) {
    const scheme = await prisma.academicGradingScheme.findFirst({
      where: {
        academicYearId,
        classSectionId,
        subjectId: se.subjectOffering.subjectId,
        isPublished: true,
      },
      include: { components: { include: { assessments: { include: { scores: true } } } } },
    })
    if (!scheme) continue
    const components = scheme.components.map((comp) => {
      const obtained = comp.assessments.reduce((sum, a) => {
        const score = a.scores.find((s) => s.studentEnrollmentId === enrollmentId)
        return sum + (score?.obtainedMarks ?? 0)
      }, 0)
      return { maxMarks: comp.maxMarks, weightPercentage: comp.weightPercentage, obtained }
    })
    pcts.push(calculateWeightedPercentage(components))
  }
  if (pcts.length === 0) return null
  return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
}

/** Bulk promotion wizard: suggest next section + per-student pass/fail. */
export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'promotions', 'read')
  if (denied) return denied

  const params = new URL(request.url).searchParams
  const fromYearId = params.get('fromAcademicYearId')
  const fromClassSectionId = params.get('fromClassSectionId')
  const passThreshold = Number(params.get('passThreshold') ?? '33')

  if (!fromYearId || !fromClassSectionId) {
    return errors.validation({
      errors: [{ path: ['fromClassSectionId'], message: 'fromAcademicYearId and fromClassSectionId required' }],
    } as never)
  }

  const suggestedSection = await suggestNextClassSection(fromClassSectionId)
  const suggestedLabel = suggestedSection
    ? `${suggestedSection.className}-${suggestedSection.sectionName}`
    : null

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicYearId: fromYearId,
      classSectionId: fromClassSectionId,
      status: 'ACTIVE',
    },
    include: {
      classSection: { select: { grade: true, className: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
        },
      },
      subjectEnrollments: {
        where: { status: 'APPROVED' },
        include: { subjectOffering: { select: { subjectId: true } } },
      },
    },
    orderBy: { rollNumber: 'asc' },
  })

  const rows: PromotionWizardRow[] = []

  for (const e of enrollments) {
    const overallPercentage = await computeOverallPercentage(
      e.id,
      fromYearId,
      fromClassSectionId,
      e.subjectEnrollments
    )
    const isPassing = overallPercentage != null ? overallPercentage >= passThreshold : true

    const fromGrade = e.classSection.grade
    const isFinalGrade = suggestedSection == null && fromGrade != null && fromGrade >= 12

    rows.push({
      studentId: e.student.id,
      studentEnrollmentId: e.id,
      rollNumber: e.rollNumber,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      registrationNumber: e.student.registrationNumber,
      overallPercentage,
      isPassing,
      suggestedStatus: !isPassing
        ? 'RETAINED'
        : suggestedSection
          ? 'PROMOTED'
          : isFinalGrade
            ? 'GRADUATED'
            : 'RETAINED',
      suggestedToSectionId: isPassing && suggestedSection ? suggestedSection.id : null,
      suggestedToSectionLabel: isPassing && suggestedSection ? suggestedLabel : null,
    })
  }

  return successResponse({
    suggestedSection,
    suggestedToSectionLabel: suggestedLabel,
    passThreshold,
    rows,
  })
}
