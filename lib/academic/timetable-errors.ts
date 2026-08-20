import type { TimetableConflict } from '@/lib/academic/engine'

const CONFLICT_FIELD: Record<TimetableConflict['type'], string> = {
  TEACHER: 'teacherId',
  ROOM: 'roomId',
  SECTION: 'classSectionId',
  SHIFT: 'startTime',
  CAMPUS: 'teacherId',
  SUBJECT: 'subjectOfferingId',
}

const CONFLICT_PREFIX: Record<TimetableConflict['type'], string> = {
  TEACHER: 'Teacher conflict',
  ROOM: 'Room conflict',
  SECTION: 'Section conflict',
  SHIFT: 'Shift timing issue',
  CAMPUS: 'Campus conflict',
  SUBJECT: 'Subject offering issue',
}

export function timetableConflictDetails(conflicts: TimetableConflict[]) {
  return conflicts.map((conflict) => ({
    field: CONFLICT_FIELD[conflict.type] ?? 'timetable',
    message: `${CONFLICT_PREFIX[conflict.type] ?? 'Timetable conflict'}: ${conflict.message}`,
    ...(conflict.slot ? { conflictSlot: JSON.stringify(conflict.slot) } : {}),
  }))
}

export function timetableConflictSummary(conflicts: TimetableConflict[]): string {
  const first = timetableConflictDetails(conflicts)[0]
  if (!first) return 'Timetable slot cannot be saved. Please review the slot details.'
  if (conflicts.length === 1) return first.message
  return `${first.message} (${conflicts.length} issues found.)`
}
