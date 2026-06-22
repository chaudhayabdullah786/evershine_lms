import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateChallanSchema } from '@/lib/validation/fee'
import { createdResponse, errors } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = generateChallanSchema.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }

    const { studentId, month, academicYear, dueDate, bankAccounts, items, discount, lateFee, notes } = parsed.data

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, isActive: true, firstName: true, lastName: true, rollNumber: true, registrationNumber: true },
    })

    if (!student || !student.isActive) return NextResponse.json({ error: 'Student not found or inactive' }, { status: 404 })

    const duplicate = await prisma.feeInvoice.findFirst({
      where: { studentId, month, academicYear, status: { not: 'CANCELLED' } },
      select: { challanNumber: true },
    })

    if (duplicate) {
      return NextResponse.json({ error: `Challan exists: ${duplicate.challanNumber}` }, { status: 409 })
    }

    const monthCode = month.split(' ')[0].slice(0, 3).toUpperCase()
    const parts = academicYear.split('-')
    const yearCode = parts.length === 2 ? `${parts[0].slice(-2)}${parts[1].slice(-2)}` : academicYear.replace('-', '').slice(2, 6)

    const studentIdentifier = student.rollNumber && student.rollNumber.trim()
      ? student.rollNumber.trim().replace(/\//g, '-')
      : student.registrationNumber.replace(/\//g, '-')

    const challanNumber = `CHL/${studentIdentifier}/${yearCode}/${monthCode}`

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
    const totalAmount = subtotal - discount + lateFee

    return NextResponse.json({ 
      success: true, 
      simulated: {
        challanNumber, studentId, month, academicYear, dueDate: new Date(dueDate),
        subtotal, discount, lateFee, totalAmount, items
      } 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 })
  }
}
