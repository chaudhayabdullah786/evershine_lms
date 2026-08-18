/**
 * Prisma's generated name for SubjectOffering's compound unique constraint.
 * Keep this in one place so timetable workflows cannot drift from the schema's
 * field order: academicYearId, classSectionId, subjectId.
 */
export function subjectOfferingUniqueWhere(
  academicYearId: string,
  classSectionId: string,
  subjectId: string,
) {
  return {
    academicYearId_classSectionId_subjectId: {
      academicYearId,
      classSectionId,
      subjectId,
    },
  } as const
}
