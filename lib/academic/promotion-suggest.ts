import { prisma } from '@/lib/prisma'

/** Extract numeric grade from "Class 9", "9", etc. */
export function parseGradeFromClassName(className: string): number | null {
  const match = className.match(/(\d{1,2})/)
  if (!match) return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

export type SectionSummary = {
  id: string
  className: string
  sectionName: string
  grade: number | null
  campusId: string
  batchId: string
  shiftId: string
  deliveryMode: string
}

/** Suggest next class section (same campus/batch/shift/section, grade + 1). */
export async function suggestNextClassSection(
  fromSectionId: string
): Promise<SectionSummary | null> {
  const from = await prisma.classSection.findUnique({ where: { id: fromSectionId } })
  if (!from) return null

  const fromGrade = from.grade ?? parseGradeFromClassName(from.className)
  if (fromGrade == null) return null

  const targetGrade = fromGrade + 1

  const match = await prisma.classSection.findFirst({
    where: {
      campusId: from.campusId,
      batchId: from.batchId,
      shiftId: from.shiftId,
      sectionName: from.sectionName,
      isActive: true,
      OR: [{ grade: targetGrade }, { className: { contains: String(targetGrade) } }],
    },
    orderBy: { className: 'asc' },
  })

  if (match) return match

  return prisma.classSection.findFirst({
    where: {
      campusId: from.campusId,
      batchId: from.batchId,
      shiftId: from.shiftId,
      isActive: true,
      OR: [{ grade: targetGrade }, { className: { contains: String(targetGrade) } }],
    },
    orderBy: [{ sectionName: 'asc' }, { className: 'asc' }],
  })
}

export type PromotionWizardRow = {
  studentId: string
  studentEnrollmentId: string
  rollNumber: string
  firstName: string
  lastName: string
  registrationNumber: string
  suggestedStatus: 'PROMOTED' | 'RETAINED' | 'GRADUATED'
  suggestedToSectionId: string | null
  suggestedToSectionLabel: string | null
  overallPercentage: number | null
  isPassing: boolean
}
