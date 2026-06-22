/**
 * When true (default), legacy Class/Timetable/Attendance nav is hidden.
 * Set NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY=false to show legacy items during migration.
 */
export function isAcademicEnginePrimary(): boolean {
  const flag = process.env.NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY
  if (flag === 'false' || flag === '0') return false
  return true
}
