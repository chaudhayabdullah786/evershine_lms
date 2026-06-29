/**
 * Student Zod Schemas
 * Used for admission form validation (client) and POST /api/students (server).
 */

import { z } from 'zod'
import { sessionShiftSchema } from '@/lib/validation/shift'
import { deliveryModeSchema } from '@/lib/validation/academic'

const genderEnum = z.enum(['MALE', 'FEMALE'])
const enrollmentStatusEnum = z.enum(['ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN', 'ON_LEAVE'])

const dateOrDateTimeString = z.preprocess((value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`
  }
  return value
}, z.string().datetime({ message: 'Invalid date of birth' }))

const optionalCuid = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}, z.string().cuid().optional())

const blankOptionalNumber = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  if (typeof value === 'number' && Number.isNaN(value)) return undefined
  return value
}

const createStudentSchemaBase = z.object({
  // ── Personal identity ──────────────────────────────────────────────────────
  firstName:    z.string().min(2, 'First name must be at least 2 characters').trim(),
  lastName:     z.string().min(2, 'Last name must be at least 2 characters').trim(),
  fatherName:   z.string().min(2, 'Father name is required').trim(),
  motherName:   z.string().optional(),                             // Mother's full name
  cnicBForm:    z.string().regex(/^\d{13}$/, 'B-Form/CNIC must be exactly 13 digits').trim(),
  dateOfBirth:  dateOrDateTimeString,
  placeOfBirth: z.string().optional(),                             // City / district of birth
  gender:       genderEnum,
  bloodGroup:   z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  religion:     z.string().optional(),
  nationality:  z.string().default('Pakistani'),
  domicile:     z.string().optional(),                             // District domicile

  // ── Address ───────────────────────────────────────────────────────────────
  address:          z.string().min(5, 'Address is required').trim(),
  city:             z.string().min(2).trim(),
  province:         z.string().min(2).trim(),
  tehsil:           z.string().optional(),
  district:         z.string().optional(),
  permanentAddress: z.string().optional(),
  postalCode:       z.string().optional(),

  // ── Contact ───────────────────────────────────────────────────────────────
  phoneNumber:      z.string().regex(/^\+?[\d\s\-]{10,15}$/, 'Invalid phone number'),
  emergencyContact: z.string().regex(/^\+?[\d\s\-]{10,15}$/, 'Invalid emergency contact'),
  email:            z.string().email().optional().or(z.literal('')),

  // ── Extended parent / family ──────────────────────────────────────────────
  fatherOccupation:    z.string().optional(),  // e.g. "Teacher", "Farmer", "Business"
  fatherQualification: z.string().optional(),  // e.g. "Graduate", "Matric", "Primary"
  fatherCnic:          z.string().optional(),  // Father's own 13-digit CNIC

  // ── Academic background (from previous institution) ────────────────────────
  previousSchool:        z.string().optional(),      // Last school / institution attended
  lastClassPassed:       z.preprocess(blankOptionalNumber, z.number().int().min(1).max(12).optional()),
  lastPercentage:        z.string().optional(),      // e.g. "72.5%" or "710/1100"
  previousMarksObtained: z.preprocess(blankOptionalNumber, z.number().int().min(0).optional()),
  boardName:             z.string().optional(),      // e.g. "BISE Faisalabad", "FBISE"
  previousGroup:         z.string().optional(),      // e.g. "Science", "Arts"
  yearOfPassing:         z.preprocess(blankOptionalNumber, z.number().int().min(1990).max(new Date().getFullYear()).optional()),
  
  requestedLevel:        z.string().optional(),
  requestedClass: z.preprocess(blankOptionalNumber, z.number().int().min(1, 'Requested class must be a positive integer').max(12, 'Requested class must be 12 or lower').optional()),
  requestedGroup:        z.string().optional(),      // e.g. "Computer Group", "Biology Group", "F.Sc"
  requestedGroupOther:   z.string().optional(),      // Free-text detail when primary group is Other
  requestedCourses:      z.array(z.string()).optional(),
  requestedCoursesOther: z.string().optional(),
  interviewInstitute:     z.string().optional(),
  interviewMarksObtained: z.preprocess(blankOptionalNumber, z.number().int().min(0, 'Marks must be a positive number').optional()),
  interviewPercentage:    z.string().optional(),
  interviewYear: z.preprocess(blankOptionalNumber, z.number().int().min(1900, 'Year must be valid').max(new Date().getFullYear(), 'Year cannot be in the future').optional()),
  interviewGroup:         z.string().optional(),
  interviewDate:         z.string().optional(),
  interviewerName:       z.string().optional(),
  interviewOutcome:      z.string().optional(),
  interviewNotes:        z.string().optional(),
  repeaterSubjects:      z.string().optional(),      // e.g. "Physics, Chemistry"

  // ── Medical / special needs ────────────────────────────────────────────────
  medicalConditions: z.string().optional(),   // Chronic illness, allergies
  hasDisability:     z.boolean().default(false),
  disabilityDetails: z.string().optional(),   // Description if hasDisability = true

  // ── Sibling linkage at the same academy ────────────────────────────────────
  hasSiblingAtAcademy: z.boolean().default(false),
  siblingName:         z.string().optional(), // Full name of sibling here
  siblingClass:        z.string().optional(), // Class / section of sibling

  // ── Academic placement ─────────────────────────────────────────────────────
  campusId:       z.string().cuid('Invalid campus ID'),
  batchId:        z.string().cuid('Invalid batch ID'),
  classId:        optionalCuid,
  classSectionId: optionalCuid,
  section:        z.string().max(5).optional(),
  rollNumber:     z.string().min(1).max(20).optional(),
  shift:          sessionShiftSchema.optional(),
  deliveryMode:   deliveryModeSchema.optional(),
  houseId:        optionalCuid,
  academicYear:   z.string().regex(/^\d{4}-\d{4}$/, 'Academic year must be in format YYYY-YYYY'),

  // ── Financial ──────────────────────────────────────────────────────────────
  totalFeeAmount: z.number().min(0).default(0),

  // ── Documents ──────────────────────────────────────────────────────────────
  profilePicture:    z.string().optional(),  // Base64 or URL
  bFormDocUrl:       z.string().optional(),  // B-Form scan URL
  previousResultUrl: z.string().optional(),  // Previous marksheet URL

  // Parent/Guardian details (for new admission; creates Guardian account)
  parentEmail: z.string().email().optional(),
})

const guardianFieldsSchema = z.object({
  guardianFirstName:        z.string().min(2).trim().optional(),
  guardianLastName:         z.string().trim().optional(),
  guardianCnic:             z.string().regex(/^\d{13}$/, 'Guardian CNIC must be 13 digits').optional(),
  guardianPhone:            z.string().optional(),
  guardianEmail:            z.string().email().optional().or(z.literal('')),
  guardianRelationship:     z.string().max(50).optional(),
  guardianEmploymentStatus: z.enum(['GOVT', 'PRIVATE', 'BUSINESS', 'NONE']).optional(),
  guardianDesignation:      z.string().optional(),
  guardianOrganization:     z.string().optional(),
  guardianBusinessName:     z.string().optional(),
  guardianBusinessDealsIn:  z.string().optional(),
})

const marketingFieldsSchema = z.object({
  sourceOfInfo: z.string().optional(),
})

// Validation for public form where terms MUST be checked
export const publicAdmissionSchema = createStudentSchemaBase
  .merge(guardianFieldsSchema)
  .merge(marketingFieldsSchema)
  .extend({
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must agree to the Rules and Regulations to proceed' }),
    }),
  })


// Merge schemas first (without refinements yet)
const mergedStudentSchema = createStudentSchemaBase
  .merge(guardianFieldsSchema)
  .merge(marketingFieldsSchema)

// Apply refinements to the merged schema
export const createStudentSchema = mergedStudentSchema
  .refine(
    (data) => !data.classSectionId || (data.rollNumber && data.rollNumber.length > 0),
    { message: 'Roll number is required when a class section is selected', path: ['rollNumber'] }
  )
  .refine(
    (d) => !d.guardianCnic || (d.guardianFirstName && d.guardianFirstName.length >= 2),
    { message: 'Guardian first name is required when CNIC is provided', path: ['guardianFirstName'] }
  )

// Update schema: use partial on the base merged schema, then extend
export const updateStudentSchema = mergedStudentSchema.partial().extend({
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().or(z.literal('')).transform((v) => v || undefined),
  enrollmentStatus: enrollmentStatusEnum.optional(),
  rollNumber: z.string().optional(),
  isActive: z.boolean().optional(),
})

export const studentIdParamSchema = z.object({
  id: z.string().cuid('Invalid student ID'),
})

export const studentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  campusId: z.string().cuid().optional(),
  batchId: z.string().cuid().optional(),
  classId: z.string().cuid().optional(),
  section: z.string().optional(),
  enrollmentStatus: enrollmentStatusEnum.optional(),
  feeStatus: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']).optional(),
  academicYear: z.string().optional(),
  houseId: z.string().cuid().optional(),
  shift: sessionShiftSchema.optional(),
  classSectionId: z.string().cuid().optional(),
  includeEnrollments: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const addStudentEnrollmentSchema = z.object({
  academicYearId: z.string().cuid().optional(),
  classSectionId: z.string().cuid(),
  rollNumber: z.string().min(1).max(20),
  deliveryMode: deliveryModeSchema.optional(),
})

export const linkGuardianSchema = z.object({
  firstName: z.string().min(2).trim(),
  lastName: z.string().trim().optional(),
  cnic: z.string().regex(/^\d{13}$/, 'CNIC must be 13 digits'),
  phoneNumber: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  relationship: z.string().max(50).default('Guardian'),
})

export const studentImportRowSchema = z.object({
  firstName: z.string().min(2).trim(),
  lastName: z.string().min(2).trim(),
  fatherName: z.string().min(2).trim(),
  cnicBForm: z.string().regex(/^\d{13}$/),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: genderEnum,
  phoneNumber: z.string().min(10),
  emergencyContact: z.string().min(10),
  address: z.string().min(5),
  city: z.string().min(2),
  province: z.string().min(2),
  postalCode: z.string().optional(),
  email: z.string().email().optional(),
  campusCode: z.string().min(1),
  batchCode: z.string().min(1),
  className: z.string().optional(),
  sectionName: z.string().optional(),
  rollNumber: z.string().min(1).max(20),
  shift: sessionShiftSchema.optional(),
  deliveryMode: deliveryModeSchema.optional(),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  totalFeeAmount: z.number().min(0).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  religion: z.string().optional(),
  nationality: z.string().optional(),
  guardianFirstName: z.string().optional(),
  guardianLastName: z.string().optional(),
  guardianCnic: z.string().regex(/^\d{13}$/).optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email().optional(),
  guardianRelationship: z.string().optional(),
})

export const studentBulkImportSchema = z.object({
  rows: z.array(studentImportRowSchema).min(1).max(500),
})

export type CreateStudentInput = z.infer<typeof createStudentSchema>
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>
export type StudentQueryInput = z.infer<typeof studentQuerySchema>
export type StudentImportRow = z.infer<typeof studentImportRowSchema>
