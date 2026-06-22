import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors } from '@/lib/api-response'
import ExcelJS from 'exceljs'
import type { Role } from '@prisma/client'

/** Export results as Excel or PDF */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'read')) return errors.forbidden()

  try {
    const { examId, format = 'excel', classSectionId } = await request.json()

    if (!examId) {
      return errors.validation({
        errors: [{ path: ['examId'], message: 'examId is required' }],
      } as never)
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        results: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
              },
            },
          },
        },
      },
    })

    if (!exam) return errors.notFound('Exam not found')

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Results')

      // Set column widths
      worksheet.columns = [
        { header: 'Roll #', key: 'rollNumber', width: 8 },
        { header: 'Student Name', key: 'name', width: 20 },
        { header: 'Subject', key: 'subject', width: 15 },
        { header: 'Marks Obtained', key: 'marksObtained', width: 12 },
        { header: 'Total Marks', key: 'totalMarks', width: 12 },
        { header: 'Percentage', key: 'percentage', width: 12 },
        { header: 'Grade', key: 'grade', width: 8 },
        { header: 'Status', key: 'status', width: 10 },
      ]

      // Style header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }

      // Add data rows
      exam.results.forEach((result) => {
        const percentage = (result.marksObtained / result.totalMarks) * 100
        const row = worksheet.addRow({
          rollNumber: result.student.rollNumber,
          name: `${result.student.firstName} ${result.student.lastName}`,
          subject: result.subject || 'N/A',
          marksObtained: result.marksObtained,
          totalMarks: result.totalMarks,
          percentage: `${Math.round(percentage)}%`,
          grade: result.grade || 'N/A',
          status: result.remarks || 'PASS',
        })

        // Alternate row colors
        if (row.number % 2 === 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        }

        // Color code based on percentage
        if (percentage >= 80) {
          row.getCell('percentage').font = { color: { argb: 'FF00B050' }, bold: true }
        } else if (percentage >= 60) {
          row.getCell('percentage').font = { color: { argb: 'FFFFC000' }, bold: true }
        } else {
          row.getCell('percentage').font = { color: { argb: 'FFFF0000' }, bold: true }
        }
      })

      // Add summary section
      const summaryRow = exam.results.length + 3
      worksheet.getCell(`A${summaryRow}`).value = 'Summary Statistics'
      worksheet.getCell(`A${summaryRow}`).font = { bold: true, size: 12 }

      const avgMarks = exam.results.length > 0 
        ? (exam.results.reduce((sum, r) => sum + r.marksObtained, 0) / exam.results.length).toFixed(2)
        : 0

      const maxMarks = Math.max(...exam.results.map((r) => r.marksObtained), 0)
      const minMarks = exam.results.length > 0 ? Math.min(...exam.results.map((r) => r.marksObtained)) : 0

      worksheet.getCell(`A${summaryRow + 1}`).value = 'Total Students:'
      worksheet.getCell(`B${summaryRow + 1}`).value = exam.results.length

      worksheet.getCell(`A${summaryRow + 2}`).value = 'Average Marks:'
      worksheet.getCell(`B${summaryRow + 2}`).value = avgMarks

      worksheet.getCell(`A${summaryRow + 3}`).value = 'Highest Marks:'
      worksheet.getCell(`B${summaryRow + 3}`).value = maxMarks

      worksheet.getCell(`A${summaryRow + 4}`).value = 'Lowest Marks:'
      worksheet.getCell(`B${summaryRow + 4}`).value = minMarks

      const buffer = await workbook.xlsx.writeBuffer()

      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="results_${exam.name}_${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      })
    }

    return errors.validation({
      errors: [{ path: ['format'], message: 'PDF format coming soon' }],
    } as never)
  } catch (err) {
    console.error('Results export error:', err)
    return errors.internal('Failed to generate export')
  }
}
