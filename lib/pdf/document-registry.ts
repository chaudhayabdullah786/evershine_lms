/**
 * TEACHER_DOC_REGISTRY — extensible template registry
 *
 * WHY: Decouples document type discovery from rendering logic.
 * Adding a future document (Recommendation Letter, NOC, etc.) requires:
 *   1. A generator function in direct-generators.ts
 *   2. One entry in this array
 *   3. One new CertificateType enum value in schema.prisma
 *   No UI refactoring needed.
 */

export type TeacherDocType =
  | 'TEACHER_ID_CARD'
  | 'TEACHER_EXPERIENCE_LETTER'
  | 'TEACHER_PROFILE'

export interface TeacherDocRegistryEntry {
  type: TeacherDocType
  /** Human-readable label shown in admin UI */
  label: string
  /** Short description for the UI tooltip */
  description: string
  /** Icon name from lucide-react */
  icon: string
  /** docType key used in the document page state */
  pageKey: 'teacher_id_card' | 'teacher_experience' | 'teacher_profile'
  /** Expected PDF orientation */
  orientation: 'landscape' | 'portrait'
}

export const TEACHER_DOC_REGISTRY: TeacherDocRegistryEntry[] = [
  {
    type: 'TEACHER_ID_CARD',
    label: 'Teacher ID Card',
    description: 'Official emerald-themed staff identity card with photo, designation, and QR verification.',
    icon: 'Briefcase',
    pageKey: 'teacher_id_card',
    orientation: 'landscape',
  },
  {
    type: 'TEACHER_EXPERIENCE_LETTER',
    label: 'Experience Letter',
    description: 'Formal institutional experience certificate with responsibilities, signatures, and official seal.',
    icon: 'FileText',
    pageKey: 'teacher_experience',
    orientation: 'portrait',
  },
  {
    type: 'TEACHER_PROFILE',
    label: 'Staff Profile',
    description: 'Comprehensive HR profile card with full personal, professional, and financial summary.',
    icon: 'User',
    pageKey: 'teacher_profile',
    orientation: 'portrait',
  },
]

/**
 * Look up a registry entry by its page state key.
 * Returns undefined if the key does not map to a registered teacher document.
 */
export function getTeacherDocByPageKey(
  key: string
): TeacherDocRegistryEntry | undefined {
  return TEACHER_DOC_REGISTRY.find((e) => e.pageKey === key)
}

/**
 * Returns true when the given DocumentType key is a teacher-scoped document.
 * Used throughout the document hub to gate teacher search vs student search.
 */
export function isTeacherDocType(key: string): boolean {
  return TEACHER_DOC_REGISTRY.some((e) => e.pageKey === key)
}
