/**
 * GET /api/cron/birthday-check
 *
 * Runs daily via Vercel Cron.
 * Checks for students with birthdays today, generates a PDF card (handled client-side usually,
 * but here we just send an email for the backend cron), and emails them.
 *
 * WHY GET: Vercel Cron triggers GET requests.
 * SECURITY: Protected by CRON_SECRET authorization header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()

  // Find students whose birthday matches today's month and day
  // Prisma doesn't have a native DAY() / MONTH() extractor for Date fields in findMany
  // So we fetch active students and filter in memory (acceptable for 500-700 students)
  const students = await prisma.student.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, email: true, dateOfBirth: true },
  })

  const birthdayStudents = students.filter((s) => {
    const dob = new Date(s.dateOfBirth)
    return dob.getMonth() + 1 === currentMonth && dob.getDate() === currentDay
  })

  let emailsSent = 0

  for (const student of birthdayStudents) {
    if (!student.email) continue

    const sent = await sendEmail({
      to: student.email,
      subject: `Happy Birthday ${student.firstName}! 🎉`,
      html: `
        <div style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h1 style="color: #1E40AF;">Happy Birthday, ${student.firstName}!</h1>
          <p style="font-size: 18px;">Wishing you a fantastic day from all of us at Evershine Academy!</p>
          <img src="https://evershineacademy.edu.pk/images/birthday-bg.png" alt="Birthday Card" style="max-width: 100%; border-radius: 10px; margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
        </div>
      `,
    })

    if (sent) emailsSent++
  }

  return NextResponse.json({
    success: true,
    totalBirthdays: birthdayStudents.length,
    emailsSent,
  })
}
