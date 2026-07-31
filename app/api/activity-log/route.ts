import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: session.user.id },
      orderBy: { timestamp: 'desc' },
      take: 20,
    })

    return NextResponse.json({ success: true, data: auditLogs })
  } catch (error) {
    console.error('[ACTIVITY_LOG_GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load activity log' }, { status: 500 })
  }
}
