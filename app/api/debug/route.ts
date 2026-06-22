import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sections = await prisma.classSection.findMany({
    include: { shift: true, batch: true }
  })
  const shifts = await prisma.shift.findMany()
  return NextResponse.json({ sections, shifts })
}
