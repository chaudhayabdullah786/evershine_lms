import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params;

    const request = await prisma.admissionRequest.findUnique({ where: { id } })
    if (!request) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
    }

    await prisma.admissionRequest.delete({
      where: { id }
    })

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'ADMISSION',
        entityId: id,
        changes: {
          firstName: request.firstName,
          lastName: request.lastName,
          cnic: request.cnicBForm,
          reason: 'Manual deletion by admin'
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Admission request deleted successfully'
    })
  } catch (error) {
    console.error('[ADMISSIONS_DELETE]', error)
    return NextResponse.json({ success: false, error: 'Failed to delete admission request' }, { status: 500 })
  }
}
