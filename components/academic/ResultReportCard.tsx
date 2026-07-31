'use client'

/**
 * ResultReportCard
 *
 * A premium, A4-proportioned report card rendered as React/HTML that is
 * designed to be captured by downloadPdf() (html2canvas + jsPDF). All
 * styling uses Tailwind classes that are available in the project.
 *
 * WHY DOM-capture over jsPDF direct: custom teacher fields, per-subject
 * remarks, and student photos vary per result — encoding all that logic
 * into jsPDF primitives is fragile. Capturing the rendered DOM gives us
 * exact visual parity between what the student sees on screen and what
 * they download, with zero layout duplication.
 *
 * TRADEOFF: html2canvas capture is slower (~2s on a mid-range device)
 * and is sensitive to oklch/oklab CSS colors (mitigated by the safeColor
 * proxy in lib/pdf.ts). We accept this because fidelity is paramount.
 */

import React, { forwardRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type ReportCardSubject = {
  subjectId: string
  subjectName: string
  subjectCode: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string
  resultStatus: string
  isPassed: boolean
  isAbsent: boolean
  isNotApplicable: boolean
  remarks: string | null
  performanceBatch?: string | null
}

export type ReportCardCustomField = {
  label: string
  value: string
}

export type ReportCardResult = {
  termResultId: string
  examSessionId: string
  examSessionLabel: string
  sectionLabel: string
  shiftName: string | null
  overallPercentage: number
  grade: string
  classPosition: number | null
  performanceBatch: string
  teacherRemarks: string | null
  customFields: ReportCardCustomField[]
  declaredAt: string | null
  subjects: ReportCardSubject[]
}

export type ReportCardStudent = {
  firstName?: string
  lastName?: string
  fatherName?: string
  registrationNumber?: string
  rollNumber?: string | null
  profilePicture?: string | null
  campus?: { name: string } | null
  batch?: { name: string } | null
  class?: { name: string } | null
  house?: { name: string; color: string } | null
}

export type ResultReportCardProps = {
  result: ReportCardResult
  student: ReportCardStudent
  sessionName?: string | null
  attendancePct?: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function performanceBatchStyle(batch: string): { bg: string; text: string; border: string } {
  switch (batch) {
    case 'Ever Shine':
      return { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' }
    case 'Quaid':
      return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }
    case 'Iqbal':
      return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' }
    default:
      return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' }
  }
}

function gradeColor(grade: string): string {
  if (['A+', 'A'].includes(grade)) return 'text-emerald-700 font-black'
  if (['B+', 'B'].includes(grade)) return 'text-blue-700 font-bold'
  if (['C+', 'C'].includes(grade)) return 'text-amber-700 font-bold'
  return 'text-rose-700 font-bold'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(first?: string, last?: string): string {
  return `${(first?.[0] ?? 'S').toUpperCase()}${(last?.[0] ?? 'T').toUpperCase()}`
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ResultReportCard renders a single declared exam result as a beautifully
 * formatted A4 report card. Wrap with React.forwardRef so the parent can
 * pass a ref and call downloadPdf({ element: ref.current, ... }).
 */
const ResultReportCard = forwardRef<HTMLDivElement, ResultReportCardProps>(
  function ResultReportCard({ result, student, sessionName, attendancePct }, ref) {
    const totalObtained = result.subjects
      .filter((s) => !s.isAbsent && !s.isNotApplicable)
      .reduce((acc, s) => acc + (s.obtainedMarks ?? 0), 0)

    const totalPossible = result.subjects
      .filter((s) => !s.isNotApplicable)
      .reduce((acc, s) => acc + s.totalMarks, 0)

    const batchStyle = performanceBatchStyle(result.performanceBatch)
    const studentName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
    const hasPhoto = !!student.profilePicture
    const hasCustomFields = result.customFields.length > 0

    return (
      // data-pdf-page: signals html2canvas to treat this as the PDF page target
      <div
        ref={ref}
        data-pdf-page
        className="w-full max-w-[210mm] mx-auto bg-white font-sans shadow-2xl rounded-2xl overflow-hidden border border-slate-200"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden px-8 pt-6 pb-8"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #312e81 100%)',
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-8 w-24 h-24 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }} />

          <div className="relative flex items-center gap-6">
            {/* Academy Logo */}
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center p-1 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon-128x128.png"
                alt="Evershine Academy"
                width={52}
                height={52}
                className="w-full h-full object-contain"
                crossOrigin="anonymous"
              />
            </div>

            {/* Academy Identity */}
            <div className="flex-1">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-[0.2em] mb-0.5">
                Official Document
              </p>
              <h1 className="text-white text-xl font-black leading-tight tracking-tight">
                Evershine Academy
              </h1>
              <p className="text-blue-200 text-xs font-medium mt-0.5">
                Madina Town Campus · Boys & Girls Divisions
              </p>
            </div>

            {/* Doc Type Badge */}
            <div className="flex-shrink-0 text-right">
              <div className="inline-flex flex-col items-end gap-1">
                <span className="bg-white/15 border border-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Examination Report Card
                </span>
                {result.declaredAt && (
                  <span className="text-blue-200/80 text-[10px]">
                    Declared: {fmtDate(result.declaredAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Session + Section Info Bar */}
          <div className="relative mt-5 flex flex-wrap items-center gap-2">
            <span className="bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-lg">
              {result.examSessionLabel}
            </span>
            <span className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1 rounded-lg">
              {result.sectionLabel}
            </span>
            {result.shiftName && (
              <span className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1 rounded-lg">
                {result.shiftName}
              </span>
            )}
            {sessionName && (
              <span className="ml-auto text-blue-200/70 text-[10px]">
                Academic Year: {sessionName}
              </span>
            )}
          </div>
        </div>

        {/* ── STUDENT IDENTITY ────────────────────────────────────────────── */}
        <div className="px-8 py-5 bg-slate-50/70 border-b border-slate-200">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {hasPhoto ? (
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-blue-200 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={student.profilePicture!}
                    alt={studentName}
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center border-2 border-blue-200 shadow-md"
                  style={{ background: 'linear-gradient(135deg, #1e3a8a, #312e81)' }}
                >
                  <span className="text-white text-2xl font-black">
                    {initials(student.firstName, student.lastName)}
                  </span>
                </div>
              )}
            </div>

            {/* Identity Grid */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              <div className="col-span-2 sm:col-span-3 mb-1">
                <p className="text-xl font-black text-slate-900 leading-tight">
                  {studentName || 'Student Name'}
                </p>
                {student.fatherName && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    S/D of <span className="text-slate-700 font-semibold">{student.fatherName}</span>
                  </p>
                )}
              </div>

              <IdentityField label="Registration No." value={student.registrationNumber} />
              <IdentityField label="Roll Number" value={result.subjects.length > 0 ? (student.rollNumber ?? '—') : '—'} />
              <IdentityField label="Class / Section" value={result.sectionLabel} />
              <IdentityField label="Shift" value={result.shiftName ?? 'Regular'} />
              <IdentityField label="Campus" value={student.campus?.name ?? 'Evershine Academy'} />
              {student.batch && <IdentityField label="Batch" value={student.batch.name} />}
            </div>

            {/* Performance Badges (right column) */}
            <div className="flex-shrink-0 flex flex-col items-end gap-2">
              <div
                className={`px-4 py-2 rounded-xl border text-center ${batchStyle.bg} ${batchStyle.border}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Group</p>
                <p className={`text-base font-black ${batchStyle.text}`}>{result.performanceBatch}</p>
              </div>
              {result.classPosition !== null && (
                <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rank</p>
                  <p className="text-lg font-black leading-none">#{result.classPosition}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SUBJECTS TABLE ──────────────────────────────────────────────── */}
        <div className="px-8 py-5">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-4 h-0.5 bg-blue-500 inline-block" />
            Subject-Wise Result
            <span className="w-4 h-0.5 bg-blue-500 inline-block" />
          </h2>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wide px-4 py-2.5">
              <div className="col-span-4">Subject</div>
              <div className="col-span-2 text-center">Obtained</div>
              <div className="col-span-1 text-center">Total</div>
              <div className="col-span-2 text-center">Percentage</div>
              <div className="col-span-1 text-center">Grade</div>
              <div className="col-span-2 text-center">Status</div>
            </div>

            {/* Subject Rows */}
            {result.subjects.map((sub, idx) => {
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
              const isAbsent = sub.isAbsent
              const isNA = sub.isNotApplicable
              const passed = sub.isPassed && !isAbsent

              return (
                <div key={sub.subjectId} className={`${rowBg} border-t border-slate-100`}>
                  <div className="grid grid-cols-12 items-center px-4 py-2.5 text-sm">
                    <div className="col-span-4">
                      <p className="font-semibold text-slate-900 text-sm">{sub.subjectName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{sub.subjectCode}</p>
                    </div>
                    <div className="col-span-2 text-center font-black text-slate-800 text-base">
                      {isNA ? '—' : isAbsent ? 'Abs' : sub.obtainedMarks}
                    </div>
                    <div className="col-span-1 text-center text-slate-500 text-sm">{sub.totalMarks}</div>
                    <div className="col-span-2 text-center font-bold text-indigo-700 text-sm">
                      {isNA || isAbsent ? '—' : `${sub.percentage.toFixed(1)}%`}
                    </div>
                    <div className={`col-span-1 text-center text-sm ${gradeColor(sub.grade)}`}>
                      {isNA ? '—' : isAbsent ? 'Abs' : sub.grade}
                    </div>
                    <div className="col-span-2 text-center">
                      {isNA ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">N/A</span>
                      ) : isAbsent ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Absent</span>
                      ) : passed ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Pass</span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">Fail</span>
                      )}
                    </div>
                  </div>
                  {sub.remarks && (
                    <div className="px-4 pb-2">
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                        Remark: {sub.remarks}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Totals Row */}
            <div className="grid grid-cols-12 items-center px-4 py-3 bg-slate-900 text-white">
              <div className="col-span-4 text-sm font-bold uppercase tracking-wide">Total</div>
              <div className="col-span-2 text-center text-base font-black text-emerald-400">
                {Math.round(totalObtained * 100) / 100}
              </div>
              <div className="col-span-1 text-center text-sm text-slate-400">{totalPossible}</div>
              <div className="col-span-2 text-center text-base font-black text-blue-300">
                {result.overallPercentage.toFixed(1)}%
              </div>
              <div className={`col-span-1 text-center text-base ${gradeColor(result.grade)} !text-white`}>
                {result.grade}
              </div>
              <div className="col-span-2 text-center">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${batchStyle.bg} ${batchStyle.text}`}>
                  {result.performanceBatch}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CUSTOM FIELDS (Ethics, Character, etc.) ─────────────────────── */}
        {hasCustomFields && (
          <div className="px-8 pb-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-4 h-0.5 bg-purple-500 inline-block" />
              Character &amp; Development Assessment
              <span className="w-4 h-0.5 bg-purple-500 inline-block" />
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {result.customFields.map((field) => (
                <div
                  key={field.label}
                  className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex flex-col"
                >
                  <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-1">
                    {field.label}
                  </p>
                  <p className="text-base font-black text-purple-900 leading-none">{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TEACHER REMARKS ─────────────────────────────────────────────── */}
        {result.teacherRemarks && (
          <div className="px-8 pb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">
                Head Teacher Remarks
              </p>
              <p className="text-sm text-blue-900 italic leading-relaxed">
                &ldquo;{result.teacherRemarks}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ── OVERALL PERFORMANCE SUMMARY ─────────────────────────────────── */}
        <div className="px-8 pb-5">
          <div
            className="rounded-2xl p-5 border"
            style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
              borderColor: '#bae6fd',
            }}
          >
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4">
              Overall Performance Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryMetric label="Marks Obtained" value={`${Math.round(totalObtained * 100) / 100} / ${totalPossible}`} accent="blue" />
              <SummaryMetric label="Overall %" value={`${result.overallPercentage.toFixed(1)}%`} accent="emerald" />
              <SummaryMetric label="Final Grade" value={result.grade} accent="purple" />
              {attendancePct !== null && attendancePct !== undefined && (
                <SummaryMetric label="Attendance" value={`${attendancePct}%`} accent={attendancePct >= 75 ? 'emerald' : 'rose'} />
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-blue-100/60 flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Performance Group:</span>
              <span className={`text-sm font-black px-3 py-1 rounded-full border ${batchStyle.bg} ${batchStyle.text} ${batchStyle.border}`}>
                {result.performanceBatch} Group
              </span>
              {result.classPosition !== null && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-sm font-bold text-slate-700">
                    Class Rank: <span className="text-blue-700">#{result.classPosition}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── SIGNATURES FOOTER ────────────────────────────────────────────── */}
        <div
          className="px-8 py-6 border-t border-slate-200"
          style={{ background: 'linear-gradient(to bottom, #f8fafc, #f1f5f9)' }}
        >
          <div className="grid grid-cols-3 gap-6 text-center">
            <SignatureLine title="Class Teacher" subtitle="Signature & Stamp" />
            <SignatureLine title="Head of Department" subtitle="Signature & Stamp" />
            <SignatureLine title="Principal / Controller" subtitle="Official Seal" />
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              This is an official document of Evershine Academy, Madina Town Campus.
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              REF: ESA/{result.termResultId.slice(-8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    )
  }
)

ResultReportCard.displayName = 'ResultReportCard'
export default ResultReportCard

// ── Sub-components ────────────────────────────────────────────────────────────

function IdentityField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-slate-800 truncate">{value ?? '—'}</p>
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'blue' | 'emerald' | 'purple' | 'rose'
}) {
  const colors = {
    blue: 'text-blue-700 bg-blue-50/80 border-blue-100',
    emerald: 'text-emerald-700 bg-emerald-50/80 border-emerald-100',
    purple: 'text-purple-700 bg-purple-50/80 border-purple-100',
    rose: 'text-rose-700 bg-rose-50/80 border-rose-100',
  }
  return (
    <div className={`rounded-xl p-3 border text-center ${colors[accent]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-black leading-none">{value}</p>
    </div>
  )
}

function SignatureLine({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full h-16 border-b-2 border-dashed border-slate-300 rounded-t-lg bg-white/60" />
      <div>
        <p className="text-xs font-bold text-slate-700">{title}</p>
        <p className="text-[10px] text-slate-400">{subtitle}</p>
      </div>
    </div>
  )
}
