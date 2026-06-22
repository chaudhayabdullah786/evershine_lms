import type { Gender } from '@prisma/client'

export function batchRequiresGenderSeparation(academicLevel: string, forceGenderSeparation?: boolean): boolean {
  // Class 6 and onwards MUST be gender separated
  if (academicLevel === 'Secondary' || academicLevel === 'HigherSecondary') {
    return true
  }

  // PreSchool and Elementary (Root to Class 5) are co-ed by default, 
  // but can optionally be separated by Admin
  return Boolean(forceGenderSeparation)
}

export function campusIsGenderCompatible(
  campusGender: Gender | null | undefined,
  studentGender: string | undefined,
  forceSeparation: boolean
): boolean {
  if (!forceSeparation || !studentGender) {
    return true
  }

  if (!campusGender) {
    return false
  }

  return campusGender === studentGender
}

export function genderSeparationHint(batch: { academicLevel?: string; forceGenderSeparation?: boolean }, studentGender?: string) {
  const separates = batchRequiresGenderSeparation(batch.academicLevel ?? '', batch.forceGenderSeparation)

  if (separates) {
    return studentGender
      ? `This batch enforces gender-specific campus placement for ${studentGender.toLowerCase()} students.`
      : 'This batch requires gender-specific campus placement.'
  }

  return 'This batch is coeducational by default and does not mandate gender-specific campus placement.'
}
