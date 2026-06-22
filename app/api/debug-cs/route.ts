import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const sections = await prisma.classSection.findMany({
      include: {
        campus: true,
        batch: true,
        shift: true,
      }
    })
    const campuses = await prisma.campus.findMany()
    const batches = await prisma.batch.findMany()
    const shifts = await prisma.shift.findMany()
    
    return NextResponse.json({
      sections,
      campuses,
      batches,
      shifts
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
