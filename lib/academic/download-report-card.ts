import { fetchApi } from '@/lib/api-client'
import { generateAcademicReportCard } from '@/lib/pdf'

type ReportCardApi = {
  studentName: string
  className: string
  rollNo: string
  registrationNumber: string
  session: string
  subjects: Array<{ subject: string; marks: number; maxMarks: number; grade: string; status: string }>
  totalObtained: number
  percentage: number
  overallGrade: string
  attendancePct: number | null
}

export async function downloadReportCardForEnrollment(studentEnrollmentId: string): Promise<void> {
  const card = await fetchApi<ReportCardApi>(
    `/api/report-cards?studentEnrollmentId=${studentEnrollmentId}`
  )
  if (!card.subjects?.length) {
    throw new Error('No published results available for report card')
  }
  await generateAcademicReportCard({
    studentName: card.studentName,
    className: card.className,
    rollNo: card.rollNo,
    registrationNumber: card.registrationNumber,
    session: card.session,
    subjects: card.subjects.map((s) => ({
      subject: s.subject,
      marks: s.marks,
      maxMarks: s.maxMarks,
      grade: s.grade,
    })),
    totalObtained: card.totalObtained,
    percentage: card.percentage,
    overallGrade: card.overallGrade,
    attendancePct: card.attendancePct,
  })
}
