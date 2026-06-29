import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

/**
 * GET /api/admin/diagnose-student?userId=xxx
 *
 * Diagnostic endpoint: returns a full state snapshot of a student's
 * academic records so we can identify exactly what data is missing.
 *
 * Security: SUPER_ADMIN only.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') ?? session.user.id

  const student = await prisma.student.findUnique({
    where: { userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      registrationNumber: true,
      campusId: true,
      batchId: true,
      classId: true,
      academicYear: true,
      enrollmentStatus: true,
    },
  })

  if (!student) {
    return errors.notFound('Student not found for this userId')
  }

  // Check StudentEnrollment records (new Academic Engine)
  const studentEnrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: student.id },
    include: {
      classSection: {
        select: { id: true, className: true, sectionName: true },
      },
      academicYear: {
        select: { id: true, name: true, isLocked: true },
      },
      subjectEnrollments: {
        include: {
          subjectOffering: {
            select: { id: true, isMandatory: true, subject: { select: { name: true } } },
          },
        },
      },
    },
  })

  // Check active academic year
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, isLocked: true },
  })

  // Check SubjectOfferings for the enrolled sections
  const classSectionIds = studentEnrollments.map(e => e.classSectionId)
  const academicYearIds = studentEnrollments.map(e => e.academicYearId)

  const subjectOfferings = classSectionIds.length > 0
    ? await prisma.subjectOffering.findMany({
        where: {
          classSectionId: { in: classSectionIds },
          academicYearId: { in: academicYearIds },
        },
        include: {
          subject: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      })
    : []

  // Check published timetable slots
  const timetableSlots = classSectionIds.length > 0
    ? await prisma.timetableSlot.findMany({
        where: {
          classSectionId: { in: classSectionIds },
          isPublished: true,
        },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          isPublished: true,
          classSection: { select: { className: true, sectionName: true } },
          subjectOffering: { select: { subject: { select: { name: true } } } },
        },
      })
    : []

  // Also check all timetable slots (including unpublished)
  const allTimetableSlots = classSectionIds.length > 0
    ? await prisma.timetableSlot.count({
        where: { classSectionId: { in: classSectionIds } },
      })
    : 0

  return successResponse({
    student,
    activeYear,
    diagnosis: {
      hasStudentEnrollments: studentEnrollments.length > 0,
      studentEnrollmentCount: studentEnrollments.length,
      totalSubjectEnrollments: studentEnrollments.reduce(
        (s, e) => s + e.subjectEnrollments.length, 0
      ),
      totalSubjectOfferings: subjectOfferings.length,
      publishedTimetableSlots: timetableSlots.length,
      totalTimetableSlots: allTimetableSlots,
      needsBackfill:
        studentEnrollments.length > 0 &&
        studentEnrollments.reduce((s, e) => s + e.subjectEnrollments.length, 0) === 0 &&
        subjectOfferings.length > 0,
      timetableNotPublished:
        allTimetableSlots > 0 && timetableSlots.length === 0,
    },
    studentEnrollments,
    subjectOfferings,
    publishedTimetableSlots: timetableSlots,
  })
}
