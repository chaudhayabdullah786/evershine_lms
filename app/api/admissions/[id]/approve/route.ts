import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { sendApprovalNotification } from '@/lib/notifications'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { createYearEnrollmentForStudent } from '@/lib/academic/enrollment'
import { batchRequiresGenderSeparation, campusIsGenderCompatible, inferCampusGender } from '@/lib/academic/gender-policy'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
)

const approveSchema = z.object({
  campusId: z.string().trim().min(1, 'Campus is required'),
  batchId: z.string().trim().min(1, 'Batch is required'),
  classId: optionalTrimmedString,
  classSectionId: optionalTrimmedString,
  section: optionalTrimmedString,
  houseId: optionalTrimmedString,
  rollNumber: z.string().trim().min(1, 'Roll number is required'),
  admissionFee: z.number().min(0).default(0),
  courseFee: z.number().min(0).default(0),
  totalAcademicFee: z.number().min(0).default(0),
  shift: z.enum(['MORNING', 'EVENING', 'NIGHT']).default('MORNING'),
  deliveryMode: z.enum(['PHYSICAL', 'ONLINE', 'HYBRID']).default('PHYSICAL'),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params;
    const body = await req.json()
    const {
      campusId,
      batchId,
      classId,
      classSectionId,
      section,
      houseId,
      rollNumber,
      admissionFee,
      courseFee,
      totalAcademicFee,
      shift,
      deliveryMode,
    } = approveSchema.parse(body)

    if (totalAcademicFee < admissionFee + courseFee) {
      return NextResponse.json({ success: false, error: 'Total academic fee must be equal or greater than admission fee plus course fee' }, { status: 400 })
    }

    const request = await prisma.admissionRequest.findUnique({ where: { id } })
    if (!request) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
    }
    if (request.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'Request is already processed' }, { status: 400 })
    }

    const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { academicLevel: true, forceGenderSeparation: true } })
    const campus = await prisma.campus.findUnique({ where: { id: campusId }, select: { name: true, code: true } })

    if (!batch || !campus) {
      return NextResponse.json({ success: false, error: 'Invalid batch or campus selection' }, { status: 400 })
    }

    const separationRequired = batchRequiresGenderSeparation(batch.academicLevel, batch.forceGenderSeparation)
    if (!campusIsGenderCompatible(inferCampusGender(campus), request.gender, separationRequired)) {
      return NextResponse.json({
        success: false,
        error: separationRequired
          ? 'Selected campus does not match the batch gender separation requirements for this student.'
          : 'Selected campus is not compatible with the student gender and batch requirements.'
      }, { status: 400 })
    }

    // Check if roll number already exists in the same class/batch
    const existingRoll = await prisma.student.findFirst({
      where: {
        campusId,
        batchId,
        classId: classId ?? undefined,
        rollNumber
      }
    })
    if (existingRoll) {
      return NextResponse.json({ success: false, error: 'Roll number already assigned in this class/batch' }, { status: 400 })
    }

    // PRE-CALCULATE SLOW HASHES OUTSIDE TRANSACTION
    // Default password for students is their CNIC without hyphens
    const rawPassword = request.cnicBForm.replace(/-/g, '')
    const passwordHash = await hash(rawPassword, ARGON2_OPTIONS)

    let guardianPasswordHash = ''
    if (request.guardianCnic && !await prisma.guardian.findUnique({ where: { cnic: request.guardianCnic } })) {
      guardianPasswordHash = await hash(request.guardianCnic.replace(/-/g, ''), ARGON2_OPTIONS)
    }

    // Generate Registration Number (e.g., EA/2026/001)
    const year = new Date().getFullYear()
    const count = await prisma.student.count({ where: { campusId } })
    const seq = String(count + 1).padStart(3, '0')
    const selectedCampus = await prisma.campus.findUnique({ where: { id: campusId } })
    const regNumber = `${selectedCampus?.code || 'EA'}/${year}/${seq}`

    // Use Prisma Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark Request as Approved
      await tx.admissionRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: session.user.id,
          admissionFee,
          requestedCourseFee: courseFee,
          totalAcademicFee,
        }
      })

      // 2. Create User
      let studentEmailToUse = request.email || `${regNumber.replace(/\//g, '').toLowerCase()}@evershaheen.edu`
      const existingStudentUser = await tx.user.findUnique({ where: { email: studentEmailToUse } })
      
      if (existingStudentUser) {
        studentEmailToUse = `${regNumber.replace(/\//g, '').toLowerCase()}@evershaheen.edu`
      }

      const user = await tx.user.create({
        data: {
          email: studentEmailToUse,
          passwordHash,
          role: 'STUDENT',
          isActive: true
        }
      })

      // 3. Handle Guardian mapping
      let guardianId = null
      if (request.guardianCnic && request.guardianFirstName) {
        const existingGuardian = await tx.guardian.findUnique({
          where: { cnic: request.guardianCnic }
        })
        
        if (existingGuardian) {
          guardianId = existingGuardian.id
        } else {
          const targetEmail = request.guardianEmail || `guardian_${request.guardianCnic.replace(/-/g, '')}@evershaheen.edu`
          let guardianUser = await tx.user.findUnique({ where: { email: targetEmail } })

          if (!guardianUser) {
            guardianUser = await tx.user.create({
              data: {
                email: targetEmail,
                passwordHash: guardianPasswordHash,
                role: 'GUARDIAN',
                isActive: true
              }
            })
          }
          
          const newGuardian = await tx.guardian.create({
            data: {
              userId: guardianUser.id,
              firstName: request.guardianFirstName,
              lastName: request.guardianLastName || '',
              cnic: request.guardianCnic,
              phoneNumber: request.guardianPhoneNumber || request.emergencyContact,
              email: request.guardianEmail,
              relationship: request.guardianRelationship || 'Guardian'
            }
          })
          guardianId = newGuardian.id
        }
      }

      // 4. Create Student Profile — copy ALL admission fields so no data is lost
      const student = await tx.student.create({
        data: {
          userId: user.id,
          registrationNumber: regNumber,
          admissionNumber: regNumber,

          // ── Identity ────────────────────────────────────────────────────
          firstName:    request.firstName,
          lastName:     request.lastName,
          fatherName:   request.fatherName,
          motherName:   request.motherName ?? null,
          cnicBForm:    request.cnicBForm,
          dateOfBirth:  request.dateOfBirth,
          placeOfBirth: request.placeOfBirth ?? null,
          gender:       request.gender,
          bloodGroup:   request.bloodGroup ?? null,
          religion:     request.religion ?? null,
          nationality:  request.nationality,
          domicile:     request.domicile ?? null,

          // ── Contact ─────────────────────────────────────────────────────
          address:          request.address,
          city:             request.city,
          province:         request.province,
          tehsil:           request.tehsil ?? null,
          district:         request.district ?? null,
          permanentAddress: request.permanentAddress ?? null,
          postalCode:       request.postalCode ?? null,
          phoneNumber:      request.phoneNumber,
          emergencyContact: request.emergencyContact,
          email:            request.email ?? null,

          // ── Parent / family extended ─────────────────────────────────────
          fatherOccupation:    request.fatherOccupation ?? null,
          fatherQualification: request.fatherQualification ?? null,
          fatherCnic:          request.fatherCnic ?? null,

          // ── Academic background ──────────────────────────────────────────
          lastClassPassed:       request.lastClassPassed ?? null,
          lastPercentage:        request.lastPercentage ?? null,
          previousMarksObtained: request.previousMarksObtained ?? null,
          previousGroup:         request.previousGroup ?? null,
          boardName:             request.boardName ?? null,
          yearOfPassing:         request.yearOfPassing ?? null,
          interviewDate:         request.interviewDate ?? null,
          interviewerName:       request.interviewerName ?? null,
          interviewOutcome:      request.interviewOutcome ?? null,
          interviewNotes:        request.interviewNotes ?? null,
          interviewInstitute:    request.interviewInstitute ?? null,
          interviewMarksObtained: request.interviewMarksObtained ?? null,
          interviewPercentage:   request.interviewPercentage ?? null,
          interviewYear:         request.interviewYear ?? null,
          interviewGroup:        request.interviewGroup ?? null,

          // ── Parent / Guardian Employment ─────────────────────────────────
          guardianEmploymentStatus: request.guardianEmploymentStatus ?? null,
          guardianDesignation:      request.guardianDesignation ?? null,
          guardianOrganization:     request.guardianOrganization ?? null,
          guardianBusinessName:     request.guardianBusinessName ?? null,
          guardianBusinessDealsIn:  request.guardianBusinessDealsIn ?? null,

          // ── Medical / special needs ──────────────────────────────────────
          medicalConditions:   request.medicalConditions ?? null,
          hasDisability:       request.hasDisability,
          disabilityDetails:   request.disabilityDetails ?? null,

          // ── Sibling ──────────────────────────────────────────────────────
          hasSiblingAtAcademy: request.hasSiblingAtAcademy,
          siblingName:         request.siblingName ?? null,
          siblingClass:        request.siblingClass ?? null,

          // ── Academic placement (admin assigned) ──────────────────────────
          campusId,
          batchId,
          classId:          classId ?? undefined,
          section:          section ?? undefined,
          houseId:          (batch.academicLevel === 'Secondary' || batch.academicLevel === 'HigherSecondary') ? (houseId ?? undefined) : undefined,
          requestedGroup:   request.requestedGroup ?? null,
          requestedGroupOther: request.requestedGroupOther ?? null,
          requestedCourses: request.requestedCourses ?? null,
          requestedCoursesOther: request.requestedCoursesOther ?? null,
          repeaterSubjects: request.repeaterSubjects ?? null,
          rollNumber,
          shift,
          deliveryMode,
          totalFeeAmount: totalAcademicFee,
          dueAmount:        totalAcademicFee,
          academicYear:     `${year}-${year + 1}`,

          // ── Referral ─────────────────────────────────────────────────────
          sourceOfInfo:      request.sourceOfInfo ?? null,

          // ── Documents ────────────────────────────────────────────────────
          profilePicture:    request.passportPhotoUrl ?? null,
          bFormDocUrl:       request.bFormDocUrl ?? null,
          previousResultUrl: request.previousResultUrl ?? null,
          idCardQRCode:      `ESA-QR-${regNumber.replace(/\//g, '-')}`,

          // ── Relationships ────────────────────────────────────────────────
          guardians: guardianId ? { connect: { id: guardianId } } : undefined,
        },
      })

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'APPROVE',
          entityType: 'Admission',
          entityId: id,
          changes: {
            regNumber,
            studentName: `${request.firstName} ${request.lastName}`,
            assignedBatchId: batchId,
            assignedClassId: classId
          }
        }
      })

      return student
    }, {
      maxWait: 10000, // 10 seconds
      timeout: 20000 // 20 seconds
    })

    // Yearly enrollment (after transaction commits)
    try {
      const activeYear = await getActiveAcademicYear()
      let resolvedSectionId = classSectionId
      if (!resolvedSectionId && classId) {
        const cls = await prisma.class.findUnique({ where: { id: classId } })
        const shiftRow = await prisma.shift.findUnique({ where: { code: shift } })
        if (cls && shiftRow) {
          const sectionRow = await prisma.classSection.findFirst({
            where: {
              campusId,
              batchId,
              shiftId: shiftRow.id,
              className: `Class ${cls.grade}`,
              sectionName: section ?? cls.section ?? 'A',
            },
          })
          resolvedSectionId = sectionRow?.id
        }
      }
      if (activeYear && resolvedSectionId) {
        await createYearEnrollmentForStudent({
          studentId: result.id,
          academicYearId: activeYear.id,
          classSectionId: resolvedSectionId,
          rollNumber,
          deliveryMode,
        })
      }
    } catch (enrollmentErr) {
      console.error('[ADMISSIONS_APPROVE] enrollment', enrollmentErr)
    }

    // Send Approval Notification with credentials
    if (result.email) {
      await sendApprovalNotification(result.email, `${result.firstName} ${result.lastName}`, result.registrationNumber)
    } else if (request.guardianEmail) {
      await sendApprovalNotification(request.guardianEmail, `${result.firstName} ${result.lastName}`, result.registrationNumber)
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Admission approved and student profile created successfully'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0]?.message ?? 'Validation failed',
            details: error.errors.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      )
    }
    console.error('[ADMISSIONS_APPROVE]', error)
    return NextResponse.json({ success: false, error: 'Failed to approve admission' }, { status: 500 })
  }
}
