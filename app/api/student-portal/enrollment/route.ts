import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getActiveEnrollmentsForStudent } from '@/lib/academic/student-enrollment'


/** Student portal: enrollments (multi-shift), electives, and timetables per section. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  // WHY STUDENT-only: This route resolves the student via session.user.id.
  // SUPER_ADMIN/ADMIN users have no Student record linked to their userId,
  // so their calls always fail with 404. The route is a student self-service
  // endpoint and must not be conflated with admin data access.
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      campus: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, grade: true, shift: true } },
      house: { select: { id: true, name: true, color: true } },
    },
  })

  if (!student) return errors.notFound('Student profile')


  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return successResponse({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        fatherName: student.fatherName,
        registrationNumber: student.registrationNumber,
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

  // WHY: Auto-enrollment of mandatory subjects is intentionally NOT performed here.
  // This is a read-only GET route; side-effecting it with SubjectEnrollment creation
  // caused phantom subject assignments to appear for students who were placed in a
  // FIXED section without a formal admin enrollment action. Auto-enrollment must be
  // triggered explicitly by an admin via a dedicated mutation endpoint.
  const freshEnrollments = enrollments
  const enrollment = freshEnrollments[0] ?? null

  const timetablesByEnrollment = await Promise.all(
    freshEnrollments.map(async (enr) => {
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

  // Backward-compatible flat field used by older timetable widgets.
  // Include every active enrollment so multi-shift students do not lose non-primary shift slots.
  const timetable = timetablesByEnrollment.flatMap((record) => record.slots)

  return successResponse({
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fatherName: student.fatherName,
      registrationNumber: student.registrationNumber,
      rollNumber: student.rollNumber,
      profilePicture: student.profilePicture ?? null,
      deliveryMode: student.deliveryMode,
      shift: student.shift,
      campus: student.campus,
      batch: student.batch,
      class: student.class,
      house: student.house,
    },
    activeYear: { id: activeYear.id, name: activeYear.name, isLocked: activeYear.isLocked },
    enrollments: freshEnrollments,
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
