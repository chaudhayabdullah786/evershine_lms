export interface ClassSectionRecord {
  className?: string | null
  sectionName?: string | null
  shift?: { name?: string | null; code?: string | null } | null
}

export interface EnrollmentRecord {
  status?: string | null
  rollNumber?: string | null
  classSection?: ClassSectionRecord | null
}

export interface StudentPlacementRecord {
  section?: string | null
  rollNumber?: string | null
  class?: { name?: string | null } | null
  activeEnrollments?: EnrollmentRecord[] | null
}

/** Prefer the active academic enrollment; fall back to legacy placement fields. */
export function getCanonicalStudentClassSection(student: StudentPlacementRecord): string {
  const enrollment = student.activeEnrollments?.find((item) => item.status === 'ACTIVE')
    ?? student.activeEnrollments?.[0]
  const classSection = enrollment?.classSection
  if (classSection?.className) {
    const section = classSection.sectionName ? ` - ${classSection.sectionName}` : ''
    const shiftLabel = classSection.shift?.name || classSection.shift?.code
    const shift = shiftLabel ? ` (${shiftLabel})` : ''
    return `${classSection.className}${section}${shift}`
  }

  const legacyClass = student.class?.name || '—'
  return `${legacyClass}${student.section ? ` - ${student.section}` : ''}`
}

export function getCanonicalStudentRollNumber(student: StudentPlacementRecord): string {
  const enrollment = student.activeEnrollments?.find((item) => item.status === 'ACTIVE')
  return enrollment?.rollNumber || student.rollNumber || '—'
}

export function getCanonicalStudentClassName(student: StudentPlacementRecord): string {
  const enrollment = student.activeEnrollments?.find((item) => item.status === 'ACTIVE')
    ?? student.activeEnrollments?.[0]
  return enrollment?.classSection?.className || student.class?.name || '—'
}

export function getCanonicalStudentSection(student: StudentPlacementRecord): string {
  const enrollment = student.activeEnrollments?.find((item) => item.status === 'ACTIVE')
    ?? student.activeEnrollments?.[0]
  return enrollment?.classSection?.sectionName || student.section || '—'
}

export function getCanonicalStudentShift(student: StudentPlacementRecord): string {
  const enrollment = student.activeEnrollments?.find((item) => item.status === 'ACTIVE')
    ?? student.activeEnrollments?.[0]
  return enrollment?.classSection?.shift?.name
    || enrollment?.classSection?.shift?.code
    || '—'
}
