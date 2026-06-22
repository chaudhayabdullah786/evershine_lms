import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can export feedback')

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const feedback = await prisma.teacherFeedback.findMany({
    where: { teacherId: teacher.id },
    include: {
      class: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const exportData = feedback.map((item, index) => ({
    'S.No': index + 1,
    'Class': item.class.name,
    'Month': item.month,
    'Rating (1-5)': item.rating,
    'Comments': item.comments || 'No comment provided',
    'Date Submitted': new Date(item.createdAt).toLocaleDateString('en-PK'),
  }))

  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Feedback')

  worksheet['!cols'] = [
    { wch: 5 },  // S.No
    { wch: 15 }, // Class
    { wch: 12 }, // Month
    { wch: 15 }, // Rating
    { wch: 50 }, // Comments
    { wch: 15 }, // Date Submitted
  ]

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Feedback_Report_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}
