import type { SessionShift } from '@/lib/validation/shift'

/** Minimal class row returned by /api/classes and teacher-portal. */
export interface AcademicClassRecord {
  id: string
  name: string
  grade?: number
  section?: string | null
  shift?: SessionShift | null
  campusId?: string
  batchId?: string | null
  academicYear?: string
  campus?: { id?: string; name: string; code?: string; city?: string }
  batch?: { id?: string; name: string; code?: string; academicLevel?: string }
}

export interface AcademicCampus {
  id: string
  name: string
  code?: string
}

export interface AcademicBatch {
  id: string
  name: string
  code?: string
  campusId: string
}

export interface AcademicHouse {
  id: string
  name: string
  color?: string
  batchId: string
}

export interface AcademicScopeState {
  campusId: string
  batchId: string
  shift: SessionShift
  classId: string
  houseId: string
}
