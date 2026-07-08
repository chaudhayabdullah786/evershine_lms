'use client'

/**
 * /dashboard/exams/roll-number-slip
 *
 * Professional Roll Number Slip (admit card) for students.
 * HTML preview and generated PDF are pixel-for-pixel consistent.
 *
 * Design:
 *  - Google Fonts: Noto Serif (document) + Noto Sans (UI)
 *  - Real academy logo (bglogo.png) in both HTML preview and PDF
 *  - A4 proportioned preview card
 *  - STUDENT role only
 */

import { useState, useCallback, useEffect } from 'react'
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
import { Download, FileText, RefreshCw, AlertCircle, GraduationCap, Printer } from 'lucide-react'
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

// ─── Utility: URL → base64 data URL ─────────────────────────────────────────
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

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function fmtDay(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-PK', { weekday: 'long' }) }
  catch { return '' }
}

// ─── Design tokens (shared between HTML preview and PDF) ─────────────────────
const NAVY  = '#1e3a8a'
const TEAL  = '#0d9488'
const BLUE  = '#3b82f6'
const AMBER = '#fbbf24'
const AMBER_BG = '#fffbeb'

// ─── Component ───────────────────────────────────────────────────────────────
export default function RollNumberSlipPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role

  const [selectedSessionId, setSelectedSessionId] = useState<string>('__latest__')
  const [isGenerating, setIsGenerating]           = useState(false)
  const [logoBase64, setLogoBase64]               = useState<string | undefined>()

  // Pre-load logo as base64 for PDF embedding
  useEffect(() => {
    urlToBase64('/bglogo.png').then(setLogoBase64)
  }, [])

  // ── Exam sessions ─────────────────────────────────────────────────────────
  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn:  () => fetchApi<ExamSession[]>('/api/exam-sessions'),
    enabled:  status === 'authenticated',
  })

  // ── Slip data ─────────────────────────────────────────────────────────────
  const { data: slip, isFetching: isFetchingSlip, error: slipError } =
    useQuery<SlipResponse | null>({
      queryKey: ['roll-number-slip', selectedSessionId],
      queryFn: () => {
        const qs = selectedSessionId !== '__latest__'
          ? `?examSessionId=${selectedSessionId}` : ''
        return fetchApi<SlipResponse | null>(`/api/student-portal/roll-number-slip${qs}`)
      },
      enabled: status === 'authenticated' && role === 'STUDENT',
    })

  // ── PDF download ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!slip?.dateSheet) return
    setIsGenerating(true)
    try {
      const { generateRollNumberSlipPDF } = await import('@/lib/pdf-upgrades')

      // Convert student photo to base64 if available
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
        logoUrl:            logoBase64,
        colorMode:          'color',
      }

      const pdf = generateRollNumberSlipPDF(options)
      pdf.save(`roll-number-slip-${slip.student.rollNumber}-${Date.now()}.pdf`)
      notify.success('Roll Number Slip downloaded successfully')
    } catch (err) {
      console.error('[RollNumberSlip]', err)
      notify.error('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [slip, logoBase64])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (status === 'loading') return null
  if (!session?.user) return <AccessDenied title="Roll Number Slip" message="Please sign in to view your slip." />
  if (role !== 'STUDENT') return <AccessDenied title="Roll Number Slip" message="This page is only accessible to registered students." />

  const hasSlip = slip && slip.dateSheet !== null

  return (
    <>
      {/* Google Fonts — Noto Serif + Noto Sans */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Sans:wght@400;500;600;700&display=swap"
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5" style={{ fontFamily: '"Noto Sans", sans-serif' }}>

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <FileText className="w-6 h-6 text-indigo-700" />
              Roll Number Slip
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Download your official exam admit card for any examination session.
            </p>
          </div>
          {hasSlip && (
            <div className="flex gap-2">
              <Button
                id="download-slip-btn"
                onClick={handleDownload}
                disabled={isGenerating}
                className="gap-2 bg-indigo-700 hover:bg-indigo-800 text-white shadow"
              >
                {isGenerating ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Generating…</>
                ) : (
                  <><Download className="w-4 h-4" />Download PDF</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />Print
              </Button>
            </div>
          )}
        </div>

        {/* ── Session Selector ── */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="max-w-xs">
              <Label htmlFor="exam-session-select" className="text-sm font-semibold text-slate-700">
                Select Exam Session
              </Label>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
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
            <p className="text-sm font-medium">Failed to load slip data. Please refresh.</p>
          </div>
        )}

        {/* ── No enrollment ── */}
        {!isFetchingSlip && slip === null && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <GraduationCap className="w-12 h-12 opacity-50" />
            <p className="text-base font-semibold text-slate-600">No active enrollment found</p>
            <p className="text-sm text-center max-w-sm">
              You have not been assigned to a class section. Please contact administration.
            </p>
          </div>
        )}

        {/* ── No date sheet ── */}
        {!isFetchingSlip && slip && !slip.dateSheet && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <FileText className="w-12 h-12 opacity-50" />
            <p className="text-base font-semibold text-slate-600">No date sheet published yet</p>
            <p className="text-sm text-center max-w-sm">
              The examination schedule for <strong>{slip.section.className} — {slip.section.sectionName}</strong> has not been published. Check back later.
            </p>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* A4 PREVIEW — mirrors the PDF layout exactly                        */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {!isFetchingSlip && hasSlip && (
          <div className="flex justify-center print:justify-start">
            <div
              id="roll-number-slip-preview"
              className="bg-white shadow-2xl border border-slate-200 print:shadow-none print:border-none"
              style={{
                width: '210mm',
                maxWidth: '100%',
                minHeight: '297mm',
                fontFamily: '"Noto Serif", Georgia, "Times New Roman", serif',
                color: '#111827',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* ── TOP STRIPE ── */}
              <div style={{ background: NAVY, height: 6 }} />

              {/* ── HEADER: Logo | Academy Info | Photo ── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px 8px',
                gap: 12,
                borderBottom: `2px solid ${NAVY}`,
              }}>
                {/* Academy Logo */}
                <div style={{ flexShrink: 0, width: 62, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/bglogo.png"
                    alt="Evershine Academy"
                    style={{ width: 58, height: 58, objectFit: 'contain' }}
                  />
                </div>

                {/* Academy Name + Info */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: NAVY,
                    letterSpacing: 2.5,
                    fontFamily: '"Noto Serif", Georgia, serif',
                    lineHeight: 1.1,
                  }}>
                    EVERSHINE ACADEMY
                  </div>
                  <div style={{ fontSize: 8.5, color: TEAL, fontStyle: 'italic', marginTop: 2 }}>
                    "We Make your Children More Valueable"
                  </div>
                  <div style={{ fontSize: 7.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>
                    Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony
                  </div>
                  <div style={{ fontSize: 7, color: '#6b7280' }}>
                    Boys: 0328-4010522 &nbsp;|&nbsp; Girls: 0324-8985526
                  </div>
                  {/* Admit Card Badge */}
                  <div style={{
                    marginTop: 5,
                    display: 'inline-block',
                    background: NAVY,
                    color: '#fff',
                    padding: '3px 22px',
                    borderRadius: 3,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    fontFamily: '"Noto Sans", sans-serif',
                  }}>
                    ROLL NUMBER SLIP / ADMIT CARD
                  </div>
                </div>

                {/* Student Passport Photo */}
                <div style={{
                  flexShrink: 0,
                  width: 72,
                  height: 84,
                  border: `2px solid ${NAVY}`,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8fafc',
                }}>
                  {slip.student.profilePicture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slip.student.profilePicture}
                      alt="Passport photo"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>PHOTO</span>
                  )}
                </div>
              </div>

              {/* ── STUDENT INFO TABLE ── */}
              <div style={{ padding: '0 14px' }}>
                <SectionHeader title="STUDENT INFORMATION" />

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
                  <tbody>
                    <TR
                      left={{ label: 'REGISTRATION NO.', value: slip.student.registrationNumber, teal: true }}
                      right={{ label: 'ROLL NO.', value: slip.student.rollNumber, teal: true, bold: true, large: true }}
                    />
                    <TR
                      left={{ label: 'STUDENT NAME', value: slip.student.name.toUpperCase(), bold: true }}
                      full
                    />
                    <TR
                      left={{ label: 'CLASS / SECTION', value: `${slip.section.className} — ${slip.section.sectionName}`, bold: true }}
                      right={{ label: 'SHIFT', value: slip.section.shiftName, bold: true }}
                    />
                    <TR
                      left={{ label: 'FATHER NAME', value: slip.student.fatherName, bold: true }}
                      right={{ label: 'GENDER', value: slip.student.gender, bold: true }}
                    />
                    <TR
                      left={{ label: 'CAMPUS', value: slip.student.campus, bold: true }}
                      right={{ label: 'BATCH / PROGRAM', value: slip.student.batch, bold: true }}
                    />
                  </tbody>
                </table>

                {/* ── EXAM SCHEDULE ── */}
                <SectionHeader
                  title={`EXAMINATION SCHEDULE — ${(slip.examSession.name ?? slip.dateSheet.title).toUpperCase()}`}
                  mt={14}
                />

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                  <thead>
                    <tr style={{ background: BLUE, color: '#fff', fontFamily: '"Noto Sans", sans-serif' }}>
                      {['S.No','Date','Day','Subject Name','Start Time','End Time','Room'].map((h) => (
                        <th key={h} style={{ border: `1px solid ${NAVY}`, padding: '5px 4px', textAlign: 'center', fontWeight: 600, letterSpacing: 0.2 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slip.dateSheet.slots.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '14px 8px', color: '#6b7280', fontStyle: 'italic', border: '1px solid #e2e8f0' }}>
                          No exam slots scheduled.
                        </td>
                      </tr>
                    ) : (
                      slip.dateSheet.slots.map((slot, idx) => (
                        <tr key={slot.subjectCode + idx} style={{ background: idx % 2 === 0 ? '#fff' : '#eff6ff' }}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', whiteSpace: 'nowrap', fontFamily: '"Noto Sans", sans-serif' }}>{fmtDate(String(slot.examDate))}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>{fmtDay(String(slot.examDate)).slice(0,3)}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 600, color: NAVY, fontFamily: '"Noto Serif", Georgia, serif' }}>{slot.subjectName}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>{slot.startTime}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>{slot.endTime}</td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 4px', textAlign: 'center', fontFamily: '"Noto Sans", sans-serif' }}>{slot.roomNumber ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* ── INSTRUCTIONS ── */}
                <div style={{
                  marginTop: 14,
                  background: AMBER_BG,
                  border: `1px solid ${AMBER}`,
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 8.5,
                  fontFamily: '"Noto Sans", sans-serif',
                }}>
                  <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 5 }}>IMPORTANT INSTRUCTIONS:</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: '#5c2d0a', lineHeight: 1.8 }}>
                    <li>Students must bring this printed Roll Number Slip and their official ID Card to the examination hall.</li>
                    <li>Arrive at least 15 minutes before start time. Entry will NOT be permitted after the exam begins.</li>
                    <li>Mobile phones, calculators, and unauthorized materials are strictly prohibited in the exam hall.</li>
                  </ol>
                </div>

                {/* ── SIGNATURES ── */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  marginTop: 32,
                  paddingBottom: 8,
                  fontFamily: '"Noto Sans", sans-serif',
                }}>
                  <SigLine label="Controller of Examinations" />

                  {/* Academy Official Seal */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: 80,
                      height: 80,
                      border: `2px solid ${NAVY}`,
                      borderRadius: '50%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                    }}>
                      <div style={{ fontSize: 6.5, fontWeight: 700, color: NAVY, textAlign: 'center', lineHeight: 1.4, fontFamily: '"Noto Serif", Georgia, serif' }}>
                        EVERSHINE<br />ACADEMY<br />
                        <span style={{ fontSize: 5.5, color: TEAL }}>OFFICIAL SEAL</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 7, color: '#374151', marginTop: 4, fontWeight: 600 }}>Exam Office Stamp</div>
                  </div>

                  <SigLine label="Principal Signature & Stamp" right />
                </div>

                {/* ── SLIP INFO BADGES ── */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0 14px', fontFamily: '"Noto Sans", sans-serif' }}>
                  <Badge variant="secondary" className="text-xs font-mono">Roll No: {slip.student.rollNumber}</Badge>
                  {slip.dateSheet.version > 1 && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Version {slip.dateSheet.version}</Badge>
                  )}
                  <Badge variant="outline" className="text-xs text-slate-500">{slip.examSession.name ?? slip.dateSheet.title}</Badge>
                </div>
              </div>

              {/* ── FOOTER ── */}
              <div style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '6px 14px',
                textAlign: 'center',
                fontSize: 7.5,
                color: '#9ca3af',
                fontFamily: '"Noto Sans", sans-serif',
              }}>
                This slip is generated by EverShine Academy LMS. For corrections or re-issuance, contact the Examination Office.
              </div>
              <div style={{ background: NAVY, height: 5 }} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Shared sub-components (HTML preview) ───────────────────────────────────

function SectionHeader({ title, mt = 10 }: { title: string; mt?: number }) {
  return (
    <div style={{
      background: NAVY,
      color: '#fff',
      fontWeight: 700,
      fontSize: 9.5,
      textAlign: 'center',
      padding: '5px 6px',
      letterSpacing: 0.6,
      marginTop: mt,
      fontFamily: '"Noto Sans", sans-serif',
    }}>
      {title}
    </div>
  )
}

interface CellData {
  label: string
  value: string
  teal?: boolean
  bold?: boolean
  large?: boolean
}

function TR({ left, right, full }: { left: CellData; right?: CellData; full?: boolean }) {
  const cell: React.CSSProperties = {
    border: `1px solid ${NAVY}`,
    padding: '5px 7px',
    verticalAlign: 'middle',
    width: full ? '100%' : '50%',
  }
  const lbl: React.CSSProperties = {
    fontSize: 7.5,
    fontWeight: 700,
    color: '#374151',
    fontFamily: '"Noto Sans", sans-serif',
    display: 'block',
    marginBottom: 1,
  }
  const val = (d: CellData): React.CSSProperties => ({
    fontSize: d.large ? 11 : 9.5,
    fontWeight: d.bold ? 700 : 400,
    color: d.teal ? TEAL : '#111827',
    fontFamily: d.bold ? '"Noto Serif", Georgia, serif' : '"Noto Sans", sans-serif',
  })

  return (
    <tr>
      <td style={cell} colSpan={full ? 2 : 1}>
        <span style={lbl}>{left.label}</span>
        <span style={val(left)}>{left.value}</span>
      </td>
      {!full && right && (
        <td style={cell}>
          <span style={lbl}>{right.label}</span>
          <span style={val(right)}>{right.value}</span>
        </td>
      )}
    </tr>
  )
}

function SigLine({ label, right }: { label: string; right?: boolean }) {
  return (
    <div style={{ textAlign: right ? 'right' : 'left', minWidth: 130 }}>
      <div style={{
        borderTop: '1px solid #6b7280',
        width: 130,
        marginBottom: 5,
        ...(right ? { marginLeft: 'auto' } : {}),
      }} />
      <div style={{ fontSize: 7.5, color: '#374151', fontWeight: 600 }}>{label}</div>
    </div>
  )
}
