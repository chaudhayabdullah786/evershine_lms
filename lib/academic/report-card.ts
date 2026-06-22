import { prisma } from '@/lib/prisma'
import { calculateWeightedPercentage } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'

export type ReportCardPayload = {
  studentName: string
  fatherName: string
  className: string
  rollNo: string
  registrationNumber: string
  session: string
  shift?: string
  photo?: string | null
  subjects: Array<{
    subject: string
    marks: number
    maxMarks: number
    grade: string
    status: string
  }>
  totalObtained: number
  totalPossible: number
  percentage: number
  overallGrade: string
  attendancePct: number | null
}

export async function buildReportCardForEnrollment(
  studentEnrollmentId: string
): Promise<ReportCardPayload | null> {
  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: studentEnrollmentId },
    include: {
      academicYear: true,
      classSection: { include: { shift: true } },
      student: true,
      subjectEnrollments: {
        where: { status: 'APPROVED' },
        include: { subjectOffering: { include: { subject: true } } },
      },
    },
  })
  if (!enrollment) return null

  const subjects: ReportCardPayload['subjects'] = []
  let totalObtained = 0
  let totalPossible = 0

  for (const se of enrollment.subjectEnrollments) {
    const scheme = await prisma.academicGradingScheme.findFirst({
      where: {
        academicYearId: enrollment.academicYearId,
        classSectionId: enrollment.classSectionId,
        subjectId: se.subjectOffering.subjectId,
        isPublished: true,
      },
      include: { components: { include: { assessments: { include: { scores: true } } } } },
    })
    if (!scheme) continue

    const components = scheme.components.map((comp) => {
      const obtained = comp.assessments.reduce((sum, a) => {
        const score = a.scores.find((s) => s.studentEnrollmentId === enrollment.id)
        return sum + (score?.obtainedMarks ?? 0)
      }, 0)
      return { maxMarks: comp.maxMarks, weightPercentage: comp.weightPercentage, obtained }
    })

    const subjectMax = scheme.components.reduce((s, c) => s + c.maxMarks, 0)
    const subjectObtained = components.reduce((s, c) => s + c.obtained, 0)
    const pct = calculateWeightedPercentage(components)
    const grade = mapGradeLetter(pct)

    subjects.push({
      subject: se.subjectOffering.subject.name,
      marks: Math.round(subjectObtained * 100) / 100,
      maxMarks: subjectMax,
      grade,
      status: pct >= 33 ? 'Pass' : 'Fail',
    })
    totalObtained += subjectObtained
    totalPossible += subjectMax
  }

  const records = await prisma.enrollmentAttendanceRecord.findMany({
    where: { studentEnrollmentId: enrollment.id },
  })
  const attTotal = records.length
  const attendancePct =
    attTotal > 0
      ? Math.round(
          ((records.filter((r) => ['PRESENT', 'LATE', 'EXCUSED'].includes(r.status)).length) /
            attTotal) *
            100
        )
      : null

  const percentage =
    subjects.length > 0
      ? Math.round(
          (subjects.reduce((s, sub) => {
            const subPct = sub.maxMarks > 0 ? (sub.marks / sub.maxMarks) * 100 : 0
            return s + subPct
          }, 0) /
            subjects.length) *
            100
        ) / 100
      : totalPossible > 0
        ? Math.round((totalObtained / totalPossible) * 10000) / 100
        : 0

  const section = enrollment.classSection
  const classLabel = `${section.className}-${section.sectionName}`

  return {
    studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    fatherName: enrollment.student.fatherName,
    className: classLabel,
    rollNo: enrollment.rollNumber,
    registrationNumber: enrollment.student.registrationNumber,
    session: enrollment.academicYear.name,
    shift: section.shift?.name,
    photo: enrollment.student.profilePicture,
    subjects,
    totalObtained: Math.round(totalObtained * 100) / 100,
    totalPossible: Math.round(totalPossible * 100) / 100,
    percentage,
    overallGrade: mapGradeLetter(percentage),
    attendancePct,
  }
}
