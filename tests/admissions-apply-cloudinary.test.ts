import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockPrisma, mockUploadProfileImageToCloudinary, mockSendPendingNotification, mockSendAdminAdmissionAlert } = vi.hoisted(() => {
  const mockPrisma = {
    admissionRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    student: { findUnique: vi.fn() },
  }
  return {
    mockPrisma,
    mockUploadProfileImageToCloudinary: vi.fn(),
    mockSendPendingNotification: vi.fn(),
    mockSendAdminAdmissionAlert: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/cloudinary', () => ({
  uploadProfileImageToCloudinary: mockUploadProfileImageToCloudinary,
}))
vi.mock('@/lib/notifications', () => ({
  sendPendingNotification: mockSendPendingNotification,
  sendAdminAdmissionAlert: mockSendAdminAdmissionAlert,
}))

import { POST } from '../app/api/admissions/apply/route'

const passportPhotoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'

const validApplication = {
  firstName: 'Ali',
  lastName: 'Hassan',
  fatherName: 'Hassan',
  cnicBForm: '3530198546250',
  dateOfBirth: '2012-04-15',
  gender: 'MALE',
  nationality: 'Pakistani',
  address: 'House 1, Street 2, City',
  city: 'Gujranwala',
  province: 'Punjab',
  phoneNumber: '+923220652321',
  emergencyContact: '+923220652321',
  passportPhotoBase64,
  guardianFirstName: 'Ali',
  guardianLastName: 'Hassan',
  guardianCnic: '3530198546250',
  guardianPhoneNumber: '+923220652321',
  guardianEmail: 'guardian@example.com',
  guardianRelationship: 'Father',
  lastClassPassed: '',
  hasDisability: false,
  hasSiblingAtAcademy: false,
  preferredShift: '',
  deliveryMode: 'PHYSICAL',
  termsAccepted: true,
}

describe('POST /api/admissions/apply Cloudinary profile photo storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.admissionRequest.findUnique.mockResolvedValue(null)
    mockPrisma.student.findUnique.mockResolvedValue(null)
    mockUploadProfileImageToCloudinary.mockResolvedValue('https://res.cloudinary.com/evershine/admission-photo.webp')
    mockPrisma.admissionRequest.create.mockResolvedValue({
      id: 'clxadmission000000001',
      firstName: 'Ali',
      lastName: 'Hassan',
      email: null,
      guardianEmail: 'guardian@example.com',
      requestedLevel: 'Unspecified',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    mockSendPendingNotification.mockResolvedValue(undefined)
    mockSendAdminAdmissionAlert.mockResolvedValue(undefined)
  })

  it('uploads the required passport photo to Cloudinary and stores the secure URL', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admissions/apply', {
      method: 'POST',
      body: JSON.stringify(validApplication),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(mockUploadProfileImageToCloudinary).toHaveBeenCalledWith(
      passportPhotoBase64,
      'students',
      '3530198546250'
    )
    expect(mockPrisma.admissionRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passportPhotoUrl: 'https://res.cloudinary.com/evershine/admission-photo.webp',
      }),
    }))
  })
})
