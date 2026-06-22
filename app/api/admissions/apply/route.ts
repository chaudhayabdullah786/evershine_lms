import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { sendPendingNotification, sendAdminAdmissionAlert } from '@/lib/notifications'
import { Gender } from '@prisma/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a base64 data-URL string → disk file, returns public URL path */
async function saveBase64Image(
  base64DataUrl: string,
  subDir: string,
  filePrefix: string
): Promise<string> {
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  // Magic-bytes validation: first 4 bytes must match JPEG (FFD8), PNG (89504E47) or GIF (47494638)
  const magic = buffer.slice(0, 4).toString('hex').toUpperCase()
  const isValidImage =
    magic.startsWith('FFD8') || // JPEG
    magic.startsWith('89504E47') || // PNG
    magic.startsWith('47494638') // GIF
  if (!isValidImage) {
    throw new Error('Invalid image format. Only JPEG, PNG and GIF are accepted.')
  }

  // Enforce 5 MB limit (base64-decoded)
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image too large. Maximum allowed size is 5 MB.')
  }

  const uploadDir = path.join(process.cwd(), `public/uploads/${subDir}`)
  await mkdir(uploadDir, { recursive: true })

  const ext = magic.startsWith('89504E47') ? 'png' : 'jpg'
  const fileName = `${filePrefix}-${Date.now()}.${ext}`
  const filePath = path.join(uploadDir, fileName)
  await writeFile(filePath, buffer)

  return `/uploads/${subDir}/${fileName}`
}

// ─── Validation Schema ────────────────────────────────────────────────────────

const applySchema = z.object({
  // ── Section 1: Student Identity ──────────────────────────────────────────
  firstName:    z.string().min(2, 'First name must be at least 2 characters'),
  lastName:     z.string().min(2, 'Last name must be at least 2 characters'),
  fatherName:   z.string().min(2, "Father's name is required"),
  motherName:   z.string().optional(),
  cnicBForm:    z.string()
    .min(13, 'CNIC/B-Form must be at least 13 characters')
    .regex(/^[\d\-]+$/, 'CNIC/B-Form may only contain digits and hyphens'),
  dateOfBirth:  z.string().min(1, 'Date of birth is required'),
  placeOfBirth: z.string().optional(),
  gender:       z.nativeEnum(Gender),
  bloodGroup:   z.string().optional(),
  religion:     z.string().optional(),
  nationality:  z.string().default('Pakistani'),
  domicile:     z.string().optional(),

  // ── Section 2: Contact & Address ─────────────────────────────────────────
  address:          z.string().min(5, 'Full address is required'),
  city:             z.string().min(2, 'City is required'),
  province:         z.string().min(2, 'Province is required'),
  tehsil:           z.string().optional(),
  district:         z.string().optional(),
  permanentAddress: z.string().optional(),
  postalCode:       z.string().optional(),                       // BUG FIX: was absent from schema
  phoneNumber:      z.string().min(10, 'Valid phone number is required'),
  emergencyContact: z.string().min(10, 'Emergency contact is required'),
  email:            z.string().email('Invalid email').optional().or(z.literal('')),

  // ── Section 3: Guardian / Parent Details ─────────────────────────────────
  passportPhotoBase64:  z.string().min(10, 'Passport photo is required'),
  guardianFirstName:    z.string().min(2, 'Guardian first name is required'),
  guardianLastName:     z.string().min(1, 'Guardian last name is required'),
  guardianCnic:         z.string().min(13, 'Guardian CNIC must be 13 digits'),
  guardianPhoneNumber:  z.string().min(10, 'Guardian phone is required'),
  guardianEmail:        z.string().email().optional().or(z.literal('')),
  guardianRelationship: z.string().min(2, 'Relationship is required'),
  guardianEmploymentStatus: z.enum(['GOVT', 'PRIVATE', 'BUSINESS', 'NONE']).optional().or(z.literal('')),
  guardianDesignation:      z.string().optional(),
  guardianOrganization:     z.string().optional(),
  guardianBusinessName:     z.string().optional(),
  guardianBusinessDealsIn:  z.string().optional(),
  fatherOccupation:     z.string().optional(),
  fatherQualification:  z.string().optional(),
  fatherCnic:           z.string().optional(),

  // ── Section 4: Academic Background ───────────────────────────────────────
  preferredCampusId: z.string().optional(),
  preferredBatchId: z.string().optional(),
  requestedLevel:    z.string().min(2, 'Class / grade selection is required'),
  requestedClass:    z.string().optional().or(z.literal('')).transform((value) => {
    const parsed = parseInt(String(value), 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }).optional(),
  requestedGroup:    z.string().optional(),
  requestedGroupOther: z.string().optional(),
  requestedCourses:  z.array(z.string()).min(1, 'Select at least one course group'),
  requestedCoursesOther: z.string().optional(),
  repeaterSubjects:  z.string().optional(),
  previousSchool:    z.string().optional(),
  lastClassPassed: z.union([
    z.literal(''),
    z.number().int().min(0).max(13),
    z.string().regex(/^(0|[1-9]|1[0-3])$/, 'Invalid class selection'),
  ]).transform((value) => {
    if (value === '') return undefined
    if (typeof value === 'number') return value
    return Number(value)
  }),
  lastClassPassedDetail: z.string().optional().or(z.literal('')),
  lastPercentage:    z.string().optional(),
  previousTotalMarks: z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value)
    return value
  }, z.number().int().min(0).optional().or(z.literal('')).transform(v => v === '' ? undefined : v ? Number(v) : undefined)),
  previousMarksObtained: z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value)
    return value
  }, z.number().int().min(0).optional().or(z.literal('')).transform(v => v === '' ? undefined : v ? Number(v) : undefined)),
  boardName:         z.string().optional(),
  previousGroup:     z.string().optional(),
  yearOfPassing:     z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value)
    return value
  }, z.number().int().min(1990).max(new Date().getFullYear()).optional().or(z.literal('')).transform(v => v === '' ? undefined : v ? Number(v) : undefined)),

  // ── Section 4B: Interview Details ───────────────────────────────────────
  interviewDate:   z.string().optional(),
  interviewerName: z.string().optional(),
  interviewOutcome: z.string().optional(),
  interviewNotes:  z.string().optional(),
  interviewInstitute: z.string().optional(),
  interviewMarksObtained: z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value)
    return value
  }, z.number().int().min(0).optional()),
  interviewPercentage: z.string().optional(),
  interviewYear: z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value)
    return value
  }, z.number().int().min(1900).max(new Date().getFullYear()).optional()),
  interviewGroup: z.string().optional(),

  // ── Section 5: Documents & Medical ───────────────────────────────────────
  bFormDocBase64:      z.string().optional().or(z.literal('')),
  previousResultBase64: z.string().optional().or(z.literal('')),
  medicalConditions:   z.string().optional(),
  hasDisability:       z.boolean().default(false),
  disabilityDetails:   z.string().optional(),
  hasSiblingAtAcademy: z.boolean().default(false),
  siblingName:         z.string().optional(),
  siblingClass:        z.string().optional(),

  // ── Section 6: Academic Preference ───────────────────────────────────────
  preferredShift:  z.enum(['MORNING', 'EVENING', 'NIGHT', '']).optional().or(z.literal('')),
  deliveryMode:    z.enum(['PHYSICAL', 'ONLINE', 'HYBRID']).default('PHYSICAL'),

  // ── Referral ─────────────────────────────────────────────────────────────
  sourceOfInfo:    z.string().optional(),

  // ── Declaration ──────────────────────────────────────────────────────────
  // WHY: Terms acceptance is a hard server-side requirement, not just UI.
  // The API rejects any submission where termsAccepted !== true.
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms & Conditions to proceed.' })
  }),
})

// ─── POST /api/admissions/apply ───────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const validated = applySchema.parse(body)

    // ── Duplicate guard ─────────────────────────────────────────────────────
    const existingRequest = await prisma.admissionRequest.findUnique({
      where: { cnicBForm: validated.cnicBForm },
    })
    if (existingRequest) {
      return NextResponse.json(
        { success: false, error: 'An application with this CNIC/B-Form already exists. Please contact the administration.' },
        { status: 400 }
      )
    }

    const existingStudent = await prisma.student.findUnique({
      where: { cnicBForm: validated.cnicBForm },
    })
    if (existingStudent) {
      return NextResponse.json(
        { success: false, error: 'A student with this CNIC/B-Form is already enrolled at Evershaheen Academy.' },
        { status: 400 }
      )
    }

    // ── Save passport photo ─────────────────────────────────────────────────
    let passportPhotoUrl: string | null = null
    try {
      const slug = validated.cnicBForm.replace(/-/g, '')
      passportPhotoUrl = await saveBase64Image(
        validated.passportPhotoBase64,
        'admissions/photos',
        slug
      )
    } catch (imgErr: unknown) {
      const message = imgErr instanceof Error ? imgErr.message : 'Unknown image processing error.'
      return NextResponse.json(
        { success: false, error: `Passport photo error: ${message}` },
        { status: 400 }
      )
    }

    // ── Save B-Form document (optional) ────────────────────────────────────
    let bFormDocUrl: string | null = null
    if (validated.bFormDocBase64) {
      try {
        const slug = validated.cnicBForm.replace(/-/g, '')
        bFormDocUrl = await saveBase64Image(
          validated.bFormDocBase64,
          'admissions/documents',
          `${slug}-bform`
        )
      } catch (docErr: unknown) {
        const message = docErr instanceof Error ? docErr.message : 'Unknown document processing error.'
        return NextResponse.json(
          { success: false, error: `B-Form document error: ${message}` },
          { status: 400 }
        )
      }
    }

    // ── Save previous result (optional) ───────────────────────────────────
    let previousResultUrl: string | null = null
    if (validated.previousResultBase64) {
      try {
        const slug = validated.cnicBForm.replace(/-/g, '')
        previousResultUrl = await saveBase64Image(
          validated.previousResultBase64,
          'admissions/documents',
          `${slug}-result`
        )
      } catch (docErr: unknown) {
        const message = docErr instanceof Error ? docErr.message : 'Unknown result document error.'
        return NextResponse.json(
          { success: false, error: `Previous result document error: ${message}` },
          { status: 400 }
        )
      }
    }

    // ── Create AdmissionRequest ────────────────────────────────────────────

    const request = await prisma.admissionRequest.create({
      data: {
        // Identity
        firstName:    validated.firstName,
        lastName:     validated.lastName,
        fatherName:   validated.fatherName,
        motherName:   validated.motherName || null,
        cnicBForm:    validated.cnicBForm,
        dateOfBirth:  new Date(validated.dateOfBirth),
        placeOfBirth: validated.placeOfBirth || null,
        gender:       validated.gender,
        bloodGroup:   validated.bloodGroup || null,
        religion:     validated.religion || null,
        nationality:  validated.nationality,
        domicile:     validated.domicile || null,

        // Contact
        address:          validated.address,
        city:             validated.city,
        province:         validated.province,
        tehsil:           validated.tehsil || null,
        district:         validated.district || null,
        permanentAddress: validated.permanentAddress || null,
        postalCode:       validated.postalCode || null,
        phoneNumber:      validated.phoneNumber,
        emergencyContact: validated.emergencyContact,
        email:            validated.email || null,

        // Guardian
        passportPhotoUrl,
        guardianFirstName:    validated.guardianFirstName,
        guardianLastName:     validated.guardianLastName,
        guardianCnic:         validated.guardianCnic,
        guardianPhoneNumber:  validated.guardianPhoneNumber,
        guardianEmail:        validated.guardianEmail || null,
        guardianRelationship: validated.guardianRelationship,
        guardianEmploymentStatus: validated.guardianEmploymentStatus || null,
        guardianDesignation:      validated.guardianDesignation || null,
        guardianOrganization:     validated.guardianOrganization || null,
        guardianBusinessName:     validated.guardianBusinessName || null,
        guardianBusinessDealsIn:  validated.guardianBusinessDealsIn || null,
        fatherOccupation:     validated.fatherOccupation || null,
        fatherQualification:  validated.fatherQualification || null,
        fatherCnic:           validated.fatherCnic || null,

        // Academic background
        requestedLevel:  validated.requestedLevel,
        requestedClass:  validated.requestedClass,
        requestedGroup:  validated.requestedGroup || null,
        requestedGroupOther: validated.requestedGroupOther || null,
        requestedCourses: validated.requestedCourses,
        requestedCoursesOther: validated.requestedCoursesOther || null,
        repeaterSubjects: validated.repeaterSubjects || null,
        previousSchool:  validated.previousSchool || null,
        lastClassPassed: typeof validated.lastClassPassed === 'number' ? validated.lastClassPassed : null,
        lastPercentage:  validated.lastPercentage || null,
        previousMarksObtained: validated.previousMarksObtained as number | undefined,
        boardName:       validated.boardName || null,
        previousGroup:   validated.previousGroup || null,
        yearOfPassing:   validated.yearOfPassing as number | undefined,

        // Interview details
        interviewDate:   validated.interviewDate ? new Date(validated.interviewDate) : null,
        interviewerName: validated.interviewerName || null,
        interviewOutcome: validated.interviewOutcome || null,
        interviewNotes:  validated.interviewNotes || null,
        interviewInstitute: validated.interviewInstitute || null,
        interviewMarksObtained: validated.interviewMarksObtained ?? null,
        interviewPercentage: validated.interviewPercentage || null,
        interviewYear: validated.interviewYear ?? null,
        interviewGroup: validated.interviewGroup || null,

        // Documents & medical
        bFormDocUrl,
        previousResultUrl,
        medicalConditions:   validated.medicalConditions || null,
        hasDisability:       validated.hasDisability,
        disabilityDetails:   validated.disabilityDetails || null,
        hasSiblingAtAcademy: validated.hasSiblingAtAcademy,
        siblingName:         validated.siblingName || null,
        siblingClass:        validated.siblingClass || null,

        // Preference
        preferredCampusId: validated.preferredCampusId,
        preferredBatchId: validated.preferredBatchId,
        preferredShift: (validated.preferredShift && validated.preferredShift !== '')
          ? (validated.preferredShift as 'MORNING' | 'EVENING' | 'NIGHT')
          : null,
        deliveryMode: validated.deliveryMode,

        // Referral
        sourceOfInfo: validated.sourceOfInfo || null,

        // Declaration — server-side timestamp
        termsAccepted:   true,
        termsAcceptedAt: new Date(),

        status: 'PENDING',
      },
    })

    // ── Notify admin / applicant ───────────────────────────────────────────
    try {
      if (request.email) {
        await sendPendingNotification(request.email, `${request.firstName} ${request.lastName}`)
      } else if (request.guardianEmail) {
        await sendPendingNotification(request.guardianEmail, `${request.firstName} ${request.lastName}`)
      }
      // Alert admin about new admission application
      await sendAdminAdmissionAlert(
        `${request.firstName} ${request.lastName}`,
        request.requestedLevel || 'Unspecified',
        request.id
      )
    } catch (_notifErr) {
      // Non-fatal — admission is already recorded; notification failure must not block response
      console.warn('[ADMISSIONS_APPLY] notification send failed', _notifErr)
    }

    return NextResponse.json({
      success: true,
      data: { id: request.id, createdAt: request.createdAt },
      message: 'Your application has been submitted successfully. Evershaheen Academy will contact you shortly.',
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.errors[0].message,
          fieldErrors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }
    console.error('[ADMISSIONS_APPLY_POST]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit application. Please try again later.' },
      { status: 500 }
    )
  }
}
