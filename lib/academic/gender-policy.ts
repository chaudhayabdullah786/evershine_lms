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

export function inferCampusGender(campus: { name?: string | null; code?: string | null } | null | undefined): Gender | null {
  const label = `${campus?.name ?? ''} ${campus?.code ?? ''}`.toLowerCase()

  if (label.includes('girls') || label.includes('girl') || /\bgc\b/.test(label)) {
    return 'FEMALE'
  }

  if (label.includes('boys') || label.includes('boy') || /\bbc\b/.test(label)) {
    return 'MALE'
  }

  return null
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
