import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getActiveEnrollmentsForStudent } from '@/lib/academic/student-enrollment'

/** Student portal: enrollments (multi-shift), electives, and timetables per section. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['STUDENT', 'SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) return errors.forbidden()

  let student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      campus: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, grade: true, shift: true } },
      house: { select: { id: true, name: true, color: true } },
    },
  })

  if (!student && ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return errors.notFound('Student profile')
  }
  if (!student) return errors.notFound('Student profile')

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return successResponse({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        deliveryMode: student.deliveryMode,
        shift: student.shift,
        campus: student.campus,
        batch: student.batch,
        class: student.class,
        house: student.house,
      },
      activeYear: null,
      enrollments: [],
      enrollment: null,
      eligibleElectives: [],
      subjectEnrollments: [],
      timetable: [],
      timetablesByEnrollment: [],
      message: 'No active academic year configured. Contact administration.',
    })
  }

  const enrollments = await getActiveEnrollmentsForStudent(student.id, activeYear.id)
  const enrollment = enrollments[0] ?? null

  const timetablesByEnrollment = await Promise.all(
    enrollments.map(async (enr) => {
      const slots = await prisma.timetableSlot.findMany({
        where: {
          academicYearId: activeYear.id,
          classSectionId: enr.classSectionId,
          isPublished: true,
        },
        include: {
          subjectOffering: { include: { subject: true } },
          teacher: { select: { firstName: true, lastName: true } },
          room: true,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      })
      return {
        studentEnrollmentId: enr.id,
        shift: enr.classSection.shift,
        classSection: enr.classSection,
        slots,
      }
    })
  )

  const eligibleElectives = enrollment
    ? await prisma.subjectOffering.findMany({
        where: {
          academicYearId: activeYear.id,
          classSectionId: enrollment.classSectionId,
          isMandatory: false,
        },
        include: {
          subject: true,
          teacher: { select: { firstName: true, lastName: true } },
          electiveGroup: true,
        },
        orderBy: { subject: { name: 'asc' } },
      })
    : []

  const timetable = timetablesByEnrollment[0]?.slots ?? []

  return successResponse({
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      rollNumber: student.rollNumber,
      deliveryMode: student.deliveryMode,
      shift: student.shift,
      campus: student.campus,
      batch: student.batch,
      class: student.class,
      house: student.house,
    },
    activeYear: { id: activeYear.id, name: activeYear.name, isLocked: activeYear.isLocked },
    enrollments,
    enrollment,
    eligibleElectives,
    subjectEnrollments: enrollment?.subjectEnrollments ?? [],
    timetable,
    timetablesByEnrollment,
    canSelectElectives:
      !!enrollment &&
      enrollment.classSection.curriculumMode === 'ELECTIVE' &&
      !activeYear.isLocked,
  })
}
