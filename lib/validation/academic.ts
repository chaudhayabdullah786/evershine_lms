import { z } from 'zod'
import { sessionShiftSchema } from '@/lib/validation/shift'

export const deliveryModeSchema = z.enum(['PHYSICAL', 'ONLINE', 'HYBRID'])
export const curriculumModeSchema = z.enum(['FIXED', 'ELECTIVE'])
export const penaltyTypeSchema = z.enum(['FIXED', 'PERCENTAGE'])

function normalizeTime(value: string): string {
  const [hours, minutes] = value.trim().split(':')
  return `${String(Number(hours)).padStart(2, '0')}:${minutes}`
}

export const createAcademicYearSchema = z.object({
  name: z.string().min(4).max(20),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  isActive: z.boolean().optional(),
})

export const createShiftSchema = z.object({
  code: sessionShiftSchema,
  name: z.string().min(2).max(50),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  lateGraceMinutes: z.number().int().min(0).max(120).default(15),
})

export const createClassSectionSchema = z.object({
  campusId: z.string().cuid(),
  batchId: z.string().cuid(),
  shiftId: z.string().cuid(),
  className: z.string().min(1).max(50),
  sectionName: z.string().min(1).max(10),
  grade: z.number().int().min(1).max(12).optional(),
  deliveryMode: deliveryModeSchema.default('PHYSICAL'),
  curriculumMode: curriculumModeSchema.default('FIXED'),
  capacity: z.number().int().min(1).max(200).default(40),
})

export const createStudentEnrollmentSchema = z.object({
  studentId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  classSectionId: z.string().cuid(),
  rollNumber: z.string().min(1).max(20),
  deliveryMode: deliveryModeSchema.optional(),
  promotedFromId: z.string().cuid().optional(),
})

export const createSubjectOfferingSchema = z.object({
  academicYearId: z.string().cuid(),
  classSectionId: z.string().cuid(),
  subjectId: z.string().cuid(),
  teacherId: z.string().cuid().optional().nullable(),
  isMandatory: z.boolean().default(true),
  electiveGroupId: z.string().cuid().optional().nullable(),
})

export const updateSubjectOfferingSchema = createSubjectOfferingSchema.partial()

export const subjectEnrollmentRequestSchema = z.object({
  studentEnrollmentId: z.string().cuid(),
  subjectOfferingIds: z.array(z.string().cuid()).min(1),
})

export const approveSubjectEnrollmentSchema = z.object({
  enrollmentIds: z.array(z.string().cuid()).min(1),
  approve: z.boolean(),
})

export const createTimetableSlotSchema = z.object({
  // Accept flexible ID formats (cuid or uuid) from frontend; DB layer still enforces integrity.
  academicYearId: z.string().min(1),
  classSectionId: z.string().min(1),
  subjectOfferingId: z.string().min(1),
  teacherId: z.string().min(1),
  roomId: z.string().min(1).optional().nullable(),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  startTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/)
    .transform((value) => normalizeTime(value)),
  endTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/)
    .transform((value) => normalizeTime(value)),
})

export const updateTimetableSlotSchema = createTimetableSlotSchema.partial()

export const publishTimetableSchema = z.object({
  academicYearId: z.string().min(1),
  classSectionId: z.string().min(1).optional(),
})

export const createGradingSchemeSchema = z.object({
  academicYearId: z.string().cuid(),
  classSectionId: z.string().cuid(),
  subjectId: z.string().cuid(),
  name: z.string().min(2).max(100),
  components: z
    .array(
      z.object({
        name: z.string().min(1),
        maxMarks: z.number().positive(),
        weightPercentage: z.number().min(0).max(100),
        orderIndex: z.number().int().min(0),
      })
    )
    .min(1),
})

export const createAssessmentSchema = z.object({
  gradingComponentId: z.string().cuid(),
  title: z.string().min(1).max(200),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
})

export const submitAssessmentScoreSchema = z.object({
  assessmentId: z.string().cuid(),
  studentEnrollmentId: z.string().cuid(),
  obtainedMarks: z.number().min(0),
})

export const markEnrollmentAttendanceSchema = z.object({
  studentEnrollmentId: z.string().cuid(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  remarks: z.string().optional(),
})

export const teacherCheckInSchema = z.object({
  teacherId: z.string().cuid(),
  shift: sessionShiftSchema,
  checkInTime: z.string().datetime().optional(),
})

export const createFeePolicySchema = z.object({
  campusId: z.string().cuid().optional().nullable(),
  batchId: z.string().cuid().optional().nullable(),
  graceDays: z.number().int().min(0).default(7),
  penaltyType: penaltyTypeSchema,
  penaltyValue: z.number().min(0),
  maxPenalty: z.number().min(0).optional().nullable(),
  allowedLeavesPerMonth: z.number().int().min(0).default(1),
  leavePenaltyAmount: z.number().min(0).default(0),
})

export const createTeacherPenaltyPolicySchema = z.object({
  campusId: z.string().cuid().optional().nullable(),
  lateThreshold: z.number().int().min(1).default(3),
  penaltyType: penaltyTypeSchema,
  penaltyValue: z.number().min(0),
  repeatMultiplier: z.number().min(1).optional().nullable(),
  allowedLeavesPerMonth: z.number().int().min(0).default(1),
  leavePenaltyAmount: z.number().min(0).default(0),
})

export const promotionBatchSchema = z.object({
  fromAcademicYearId: z.string().cuid(),
  toAcademicYearId: z.string().cuid().optional(),
  fromClassSectionId: z.string().cuid(),
  toClassSectionId: z.string().cuid().optional(),
  studentIds: z.array(z.string().cuid()).min(1),
  status: z.enum(['PROMOTED', 'RETAINED', 'GRADUATED', 'TRANSFERRED']),
  remarks: z.string().optional(),
})

export const yearEndLockSchema = z.object({
  academicYearId: z.string().cuid(),
})

export const yearRolloverSchema = z.object({
  fromYearId: z.string().cuid(),
  newYearName: z.string().min(4),
  startDate: z.string(),
  endDate: z.string(),
  activateNewYear: z.boolean().default(true),
})

export const createRoomSchema = z.object({
  campusId: z.string().cuid(),
  name: z.string().min(1).max(80),
  capacity: z.number().int().min(1).max(500).default(40),
})

export const createElectiveGroupSchema = z.object({
  classSectionId: z.string().cuid(),
  name: z.string().min(1).max(100),
  minSelections: z.number().int().min(0).max(20).default(1),
  maxSelections: z.number().int().min(1).max(20).default(1),
})

export const admissionPreferencesSchema = z.object({
  preferredCampusId: z.string().cuid().optional(),
  preferredBatchId: z.string().cuid().optional(),
  preferredShift: sessionShiftSchema.optional(),
  preferredClassSectionId: z.string().cuid().optional(),
  deliveryMode: deliveryModeSchema.default('PHYSICAL'),
})
