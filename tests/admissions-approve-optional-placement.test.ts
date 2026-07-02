import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockTx, mockHash, mockSendApprovalNotification, mockGetActiveAcademicYear, mockCreateYearEnrollmentForStudent } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockHash = vi.fn()
  const mockSendApprovalNotification = vi.fn()
  const mockGetActiveAcademicYear = vi.fn()
  const mockCreateYearEnrollmentForStudent = vi.fn()

  const mockTx = {
    admissionRequest: { update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    guardian: { findUnique: vi.fn(), create: vi.fn() },
    student: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockPrisma = {
    admissionRequest: { findUnique: vi.fn() },
    batch: { findUnique: vi.fn() },
    campus: { findUnique: vi.fn() },
    student: { findFirst: vi.fn(), count: vi.fn() },
    guardian: { findUnique: vi.fn() },
    class: { findUnique: vi.fn() },
    shift: { findUnique: vi.fn() },
    classSection: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  }

  return {
    mockAuth,
    mockPrisma,
    mockTx,
    mockHash,
    mockSendApprovalNotification,
    mockGetActiveAcademicYear,
    mockCreateYearEnrollmentForStudent,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@node-rs/argon2', () => ({ hash: mockHash }))
vi.mock('@/lib/notifications', () => ({ sendApprovalNotification: mockSendApprovalNotification }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: mockGetActiveAcademicYear }))
vi.mock('@/lib/academic/enrollment', () => ({ createYearEnrollmentForStudent: mockCreateYearEnrollmentForStudent }))

import { POST } from '../app/api/admissions/[id]/approve/route'

const admissionRequest = {
  id: 'adm-1',
  status: 'PENDING',
  firstName: 'Ali',
  lastName: 'Hassan',
  fatherName: 'Hassan',
  motherName: null,
  cnicBForm: '3520112345671',
  dateOfBirth: new Date('2012-01-01'),
  placeOfBirth: null,
  gender: 'MALE',
  bloodGroup: null,
  religion: null,
  nationality: 'Pakistani',
  domicile: null,
  address: 'Lahore',
  city: 'Lahore',
  province: 'Punjab',
  tehsil: null,
  district: null,
  permanentAddress: null,
  postalCode: null,
  phoneNumber: '+923001234567',
  emergencyContact: '+923001234567',
  email: null,
  fatherOccupation: null,
  fatherQualification: null,
  fatherCnic: null,
  lastClassPassed: null,
  lastPercentage: null,
  previousMarksObtained: null,
  previousGroup: null,
  boardName: null,
  yearOfPassing: null,
  interviewDate: null,
  interviewerName: null,
  interviewOutcome: null,
  interviewNotes: null,
  interviewInstitute: null,
  interviewMarksObtained: null,
  interviewPercentage: null,
  interviewYear: null,
  interviewGroup: null,
  guardianEmploymentStatus: null,
  guardianDesignation: null,
  guardianOrganization: null,
  guardianBusinessName: null,
  guardianBusinessDealsIn: null,
  guardianCnic: null,
  guardianFirstName: null,
  guardianLastName: null,
  guardianPhoneNumber: null,
  guardianEmail: null,
  guardianRelationship: null,
  medicalConditions: null,
  hasDisability: false,
  disabilityDetails: null,
  hasSiblingAtAcademy: false,
  siblingName: null,
  siblingClass: null,
  requestedGroup: null,
  requestedGroupOther: null,
  requestedCourses: [],
  requestedCoursesOther: null,
  repeaterSubjects: null,
  sourceOfInfo: null,
  passportPhotoUrl: null,
  bFormDocUrl: null,
  previousResultUrl: null,
}

describe('POST /api/admissions/[id]/approve optional placement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockHash.mockResolvedValue('hashed-password')
    mockPrisma.admissionRequest.findUnique.mockResolvedValue(admissionRequest)
    mockPrisma.batch.findUnique.mockResolvedValue({ academicLevel: 'Middle', forceGenderSeparation: false })
    mockPrisma.campus.findUnique.mockResolvedValue({ id: 'campus-1', name: 'Main Campus', code: 'ESA' })
    mockPrisma.student.findFirst.mockResolvedValue(null)
    mockPrisma.student.count.mockResolvedValue(0)
    mockPrisma.guardian.findUnique.mockResolvedValue(null)
    mockTx.user.findUnique.mockResolvedValue(null)
    mockTx.user.create.mockResolvedValue({ id: 'student-user-1' })
    mockTx.admissionRequest.update.mockResolvedValue({ id: 'adm-1' })
    mockTx.student.create.mockResolvedValue({
      id: 'student-1',
      email: null,
      firstName: 'Ali',
      lastName: 'Hassan',
      registrationNumber: 'ESA/2026/001',
    })
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mockGetActiveAcademicYear.mockResolvedValue({ id: 'year-1' })
  })

  it('approves without house, class, class section, legacy section, or non-zero fee', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/admissions/adm-1/approve', {
        method: 'POST',
        body: JSON.stringify({
          campusId: 'campus-1',
          batchId: 'batch-1',
          classId: '',
          classSectionId: '',
          section: '',
          houseId: '',
          rollNumber: 'M-001',
          admissionFee: 0,
          courseFee: 0,
          totalAcademicFee: 0,
          shift: 'MORNING',
          deliveryMode: 'PHYSICAL',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'adm-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockTx.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        classId: undefined,
        section: undefined,
        houseId: undefined,
        rollNumber: 'M-001',
        totalFeeAmount: 0,
        dueAmount: 0,
      }),
    }))
    expect(mockCreateYearEnrollmentForStudent).not.toHaveBeenCalled()
  })
})
