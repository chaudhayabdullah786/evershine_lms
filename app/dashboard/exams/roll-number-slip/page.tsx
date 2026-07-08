'use client'

/**
 * /dashboard/exams/roll-number-slip
 *
 * Student-only page for viewing and downloading their official Roll Number Slip
 * (exam admit card) for a selected exam session (academic year).
 *
 * Architecture:
 *  - Fetches slip data from /api/student-portal/roll-number-slip
 *  - Renders a live A4-proportioned HTML preview matching the PDF output
 *  - On "Download PDF", converts any Cloudinary photo URLs to base64 and
 *    calls generateRollNumberSlipPDF() from lib/pdf-upgrades.ts
 *  - STUDENT role only — shows AccessDenied for all other roles
 */

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { notify } from '@/lib/notify'
import { AccessDenied } from '@/components/AccessDenied'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Download, FileText, RefreshCw, AlertCircle, GraduationCap } from 'lucide-react'
import type { RollNumberSlipPDFOptions, SlipExamSlot } from '@/lib/pdf-upgrades'

// ─── API response types ───────────────────────────────────────────────────────
interface SlipStudent {
  name: string
  fatherName: string
  registrationNumber: string
  rollNumber: string
  profilePicture: string | null
  gender: string
  campus: string
  batch: string
}

interface SlipSection {
  className: string
  sectionName: string
  shiftName: string
  shiftCode: string
}

interface SlipDateSheet {
  title: string
  version: number
  slots: SlipExamSlot[]
}

interface SlipResponse {
  student: SlipStudent
  section: SlipSection
  examSession: { id: string | null; name: string | null }
  dateSheet: SlipDateSheet | null
}

interface ExamSession { id: string; name: string; term: string }

// ─── Utility: fetch a URL and convert to base64 data URL ─────────────────────
async function urlToBase64(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

// ─── Utility: format ISO date for display ────────────────────────────────────
function formatDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function RollNumberSlipPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [selectedSessionId, setSelectedSessionId] = useState<string>('__latest__')
  const [isGenerating, setIsGenerating]           = useState(false)

  // ── Exam sessions (academic years) ────────────────────────────────────────
  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn:  () => fetchApi<ExamSession[]>('/api/exam-sessions'),
    enabled:  status === 'authenticated',
  })

  // ── Roll number slip data ─────────────────────────────────────────────────
  const slipQueryKey = ['roll-number-slip', selectedSessionId]
  const {
    data:       slip,
    isFetching: isFetchingSlip,
    error:      slipError,
  } = useQuery<SlipResponse | null>({
    queryKey: slipQueryKey,
    queryFn: () => {
      const params = selectedSessionId !== '__latest__'
        ? `?examSessionId=${selectedSessionId}`
        : ''
      return fetchApi<SlipResponse | null>(`/api/student-portal/roll-number-slip${params}`)
    },
    enabled: status === 'authenticated' && role === 'STUDENT',
  })

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!slip || !slip.dateSheet) return
    setIsGenerating(true)

    try {
      // Dynamically import so jsPDF is never bundled server-side
      const { generateRollNumberSlipPDF } = await import('@/lib/pdf-upgrades')

      // Convert Cloudinary photo to base64 for embedding in PDF
      let photoBase64: string | undefined
      if (slip.student.profilePicture) {
        photoBase64 = await urlToBase64(slip.student.profilePicture)
      }

      const options: RollNumberSlipPDFOptions = {
        studentName:        slip.student.name,
        fatherName:         slip.student.fatherName,
        registrationNumber: slip.student.registrationNumber,
        rollNumber:         slip.student.rollNumber,
        gender:             slip.student.gender,
        className:          slip.section.className,
        sectionName:        slip.section.sectionName,
        shiftName:          slip.section.shiftName,
        campus:             slip.student.campus,
        batch:              slip.student.batch,
        dateSheetTitle:     slip.dateSheet.title,
        examSessionName:    slip.examSession.name,
        slots:              slip.dateSheet.slots,
        photoUrl:           photoBase64,
        colorMode:          'color',
      }

      const pdf = generateRollNumberSlipPDF(options)
      const filename = `roll-number-slip-${slip.student.rollNumber}-${Date.now()}.pdf`
      pdf.save(filename)
      notify.success('Roll Number Slip downloaded successfully')
    } catch (err) {
      console.error('[RollNumberSlip] PDF generation failed:', err)
      notify.error('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [slip])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (status === 'loading') return null
  if (!session?.user) {
    return <AccessDenied title="Roll Number Slip" message="Please sign in to view your slip." />
  }
  if (role !== 'STUDENT') {
    return (
      <AccessDenied
        title="Roll Number Slip"
        message="This page is only accessible to registered students."
      />
    )
  }

  const hasSlip = slip && slip.dateSheet !== null

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <FileText className="w-6 h-6 text-indigo-600" />
            Roll Number Slip
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Download your official exam admit card for any examination session.
          </p>
        </div>
        {hasSlip && (
          <Button
            id="download-slip-btn"
            onClick={handleDownload}
            disabled={isGenerating}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF
              </>
            )}
          </Button>
        )}
      </div>

      {/* ── Session Selector ── */}
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="pt-5">
          <div className="max-w-xs">
            <Label htmlFor="exam-session-select" className="text-sm font-semibold text-slate-700">
              Select Exam Session
            </Label>
            <Select
              value={selectedSessionId}
              onValueChange={setSelectedSessionId}
            >
              <SelectTrigger id="exam-session-select" className="mt-2">
                <SelectValue placeholder="Latest published sheet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__latest__">Latest Published Sheet</SelectItem>
                {examSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading ── */}
      {isFetchingSlip && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm font-medium">Fetching your slip…</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {!isFetchingSlip && slipError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">Failed to load slip data. Please refresh the page.</p>
        </div>
      )}

      {/* ── No enrollment ── */}
      {!isFetchingSlip && slip === null && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <GraduationCap className="w-12 h-12 opacity-50" />
          <p className="text-base font-semibold text-slate-600">No active enrollment found</p>
          <p className="text-sm text-center max-w-sm">
            You have not been assigned to a class section yet.
            Please contact the administration office.
          </p>
        </div>
      )}

      {/* ── No date sheet ── */}
      {!isFetchingSlip && slip && !slip.dateSheet && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <FileText className="w-12 h-12 opacity-50" />
          <p className="text-base font-semibold text-slate-600">No date sheet published yet</p>
          <p className="text-sm text-center max-w-sm">
            The examination schedule for <strong>{slip.section.className} — {slip.section.sectionName}</strong>{' '}
            has not been published for this session. Check back later.
          </p>
        </div>
      )}

      {/* ── A4 Preview ── */}
      {!isFetchingSlip && hasSlip && (
        <div className="flex justify-center">
          {/* Outer container: A4 shadow frame */}
          <div
            id="roll-number-slip-preview"
            className="bg-white rounded shadow-2xl border border-slate-200 overflow-hidden"
            style={{
              width: '210mm',
              minHeight: '297mm',
              maxWidth: '100%',
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}
          >
            {/* ── Top Navy Stripe ── */}
            <div style={{ background: '#1e3a8a', height: 6 }} />

            {/* ── Header Row ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 14px 6px',
                borderBottom: '1.5px solid #1e3a8a',
                gap: 12,
              }}
            >
              {/* Logo placeholder */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1.5px solid #1e3a8a',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#1e3a8a',
                }}
              >
                ESA
              </div>

              {/* Academy title */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a8a', letterSpacing: 1 }}>
                  EVERSHINE ACADEMY
                </div>
                <div style={{ fontSize: 10, color: '#0d9488', fontStyle: 'italic', marginTop: 2 }}>
                  PAKISTAN EDUCATION SYSTEM
                </div>
                <div
                  style={{
                    marginTop: 4,
                    display: 'inline-block',
                    background: '#1e3a8a',
                    color: '#fff',
                    padding: '2px 16px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  ROLL NUMBER SLIP / ADMIT CARD
                </div>
              </div>

              {/* Student Photo */}
              <div
                style={{
                  width: 70,
                  height: 80,
                  border: '2px solid #1e3a8a',
                  flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8fafc',
                }}
              >
                {slip.student.profilePicture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slip.student.profilePicture}
                    alt="Student photo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>PHOTO</span>
                )}
              </div>
            </div>

            {/* ── Student Information Table ── */}
            <div style={{ padding: '0 14px' }}>
              {/* Section header */}
              <div
                style={{
                  background: '#1e3a8a',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: 'center',
                  padding: '5px 0',
                  letterSpacing: 0.5,
                  marginTop: 10,
                }}
              >
                STUDENT INFORMATION
              </div>

              {/* Table */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 10,
                }}
              >
                <tbody>
                  <InfoRow
                    left={{ label: 'REGISTRATION NO:', value: slip.student.registrationNumber, teal: true }}
                    right={{ label: 'ROLL NO:', value: slip.student.rollNumber, teal: true, bold: true }}
                  />
                  <InfoRow
                    left={{ label: 'STUDENT NAME:', value: slip.student.name.toUpperCase(), bold: true }}
                    colSpan
                  />
                  <InfoRow
                    left={{ label: 'CLASS / SECTION:', value: `${slip.section.className} — ${slip.section.sectionName}`, bold: true }}
                    right={{ label: 'SHIFT:', value: slip.section.shiftName, bold: true }}
                  />
                  <InfoRow
                    left={{ label: 'FATHER NAME:', value: slip.student.fatherName, bold: true }}
                    right={{ label: 'GENDER:', value: slip.student.gender, bold: true }}
                  />
                  <InfoRow
                    left={{ label: 'CAMPUS:', value: slip.student.campus, bold: true }}
                    right={{ label: 'BATCH / PROGRAM:', value: slip.student.batch, bold: true }}
                  />
                </tbody>
              </table>

              {/* ── Exam Schedule ── */}
              <div
                style={{
                  background: '#1e3a8a',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: 'center',
                  padding: '5px 0',
                  letterSpacing: 0.5,
                  marginTop: 14,
                }}
              >
                EXAMINATION SCHEDULE —{' '}
                {(slip.examSession.name ?? slip.dateSheet.title).toUpperCase()}
              </div>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 9.5,
                  marginTop: 0,
                }}
              >
                <thead>
                  <tr style={{ background: '#3b82f6', color: '#fff' }}>
                    <Th w="5%">S.No</Th>
                    <Th w="18%">Date</Th>
                    <Th w="8%">Day</Th>
                    <Th w="33%">Subject Name</Th>
                    <Th w="13%">Start Time</Th>
                    <Th w="13%">End Time</Th>
                    <Th w="10%">Room</Th>
                  </tr>
                </thead>
                <tbody>
                  {slip.dateSheet.slots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: 'center',
                          padding: '14px 8px',
                          color: '#6b7280',
                          fontStyle: 'italic',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        No exam slots scheduled for this session.
                      </td>
                    </tr>
                  ) : (
                    slip.dateSheet.slots.map((slot, idx) => (
                      <tr
                        key={slot.subjectCode + idx}
                        style={{
                          background: idx % 2 === 0 ? '#ffffff' : '#eff6ff',
                        }}
                      >
                        <Td center>{idx + 1}</Td>
                        <Td>{formatDisplayDate(String(slot.examDate))}</Td>
                        <Td>{new Date(slot.examDate).toLocaleDateString('en-PK', { weekday: 'short' })}</Td>
                        <Td bold navy>{slot.subjectName}</Td>
                        <Td center>{slot.startTime}</Td>
                        <Td center>{slot.endTime}</Td>
                        <Td center>{slot.roomNumber ?? '—'}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* ── Instructions ── */}
              <div
                style={{
                  marginTop: 14,
                  background: '#fffbeb',
                  border: '1px solid #fbbf24',
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 8.5,
                }}
              >
                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  IMPORTANT INSTRUCTIONS:
                </div>
                <ol style={{ margin: 0, paddingLeft: 16, color: '#5c2d0a', lineHeight: 1.7 }}>
                  <li>Students must bring this printed Roll Number Slip and their official ID Card to the examination hall.</li>
                  <li>Arrive at least 15 minutes before the start time. Entry will not be permitted after the exam begins.</li>
                  <li>Mobile phones, calculators, and unauthorized materials are strictly prohibited in the exam hall.</li>
                </ol>
              </div>

              {/* ── Signature Area ── */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 32,
                  paddingBottom: 8,
                }}
              >
                <SignatureLine label="Controller of Examinations" />
                <SignatureLine label="Principal Signature & Stamp" center />
                <SignatureLine label="Received by Student" right />
              </div>

              {/* ── Slip Info Badges ── */}
              <div className="flex flex-wrap gap-2 mt-4 mb-6 justify-center">
                <Badge variant="secondary" className="text-xs font-mono">
                  Roll No: {slip.student.rollNumber}
                </Badge>
                {slip.dateSheet.version > 1 && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                    Version {slip.dateSheet.version}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs text-slate-500">
                  {slip.examSession.name ?? slip.dateSheet.title}
                </Badge>
              </div>
            </div>

            {/* ── Footer Stripe ── */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '6px 14px',
                fontSize: 8,
                textAlign: 'center',
                color: '#9ca3af',
              }}
            >
              This slip is generated by EverShine Academy LMS. For corrections or re-issuance, contact the Examination Office.
            </div>
            <div style={{ background: '#1e3a8a', height: 5 }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small sub-components for the HTML preview ───────────────────────────────

interface InfoRowProps {
  left:     { label: string; value: string; teal?: boolean; bold?: boolean }
  right?:   { label: string; value: string; teal?: boolean; bold?: boolean }
  colSpan?: boolean
}

function InfoRow({ left, right, colSpan }: InfoRowProps) {
  const cellStyle: React.CSSProperties = {
    border: '1px solid #1e3a8a',
    padding: '4px 6px',
    verticalAlign: 'middle',
  }
  const labelStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: 8.5,
    color: '#374151',
    whiteSpace: 'nowrap',
  }
  const getValueStyle = (opts: { teal?: boolean; bold?: boolean }): React.CSSProperties => ({
    fontWeight: opts.bold ? 700 : 400,
    fontSize: 9.5,
    color: opts.teal ? '#0d9488' : '#111827',
    marginLeft: 4,
  })

  return (
    <tr>
      <td style={colSpan ? { ...cellStyle, width: '100%' } : { ...cellStyle, width: '50%' }} colSpan={colSpan ? 2 : 1}>
        <span style={labelStyle}>{left.label}</span>
        <span style={getValueStyle({ teal: left.teal, bold: left.bold })}>{left.value}</span>
      </td>
      {!colSpan && right && (
        <td style={{ ...cellStyle, width: '50%' }}>
          <span style={labelStyle}>{right.label}</span>
          <span style={getValueStyle({ teal: right.teal, bold: right.bold })}>{right.value}</span>
        </td>
      )}
    </tr>
  )
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) {
  return (
    <th
      style={{
        border: '1px solid #1e3a8a',
        padding: '5px 4px',
        textAlign: 'center',
        fontWeight: 700,
        letterSpacing: 0.2,
        width: w,
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  center,
  bold,
  navy,
}: {
  children: React.ReactNode
  center?: boolean
  bold?: boolean
  navy?: boolean
}) {
  return (
    <td
      style={{
        border: '1px solid #cbd5e1',
        padding: '5px 4px',
        textAlign: center ? 'center' : 'left',
        fontWeight: bold ? 700 : 400,
        color: navy ? '#1e3a8a' : '#111827',
      }}
    >
      {children}
    </td>
  )
}

function SignatureLine({
  label,
  center,
  right: isRight,
}: {
  label: string
  center?: boolean
  right?: boolean
}) {
  return (
    <div
      style={{
        textAlign: center ? 'center' : isRight ? 'right' : 'left',
        minWidth: 100,
      }}
    >
      <div
        style={{
          borderTop: '1px solid #6b7280',
          width: 120,
          marginBottom: 4,
          ...(center ? { margin: '0 auto 4px' } : {}),
          ...(isRight ? { marginLeft: 'auto' } : {}),
        }}
      />
      <div style={{ fontSize: 8, color: '#374151', fontWeight: 600 }}>{label}</div>
    </div>
  )
}
