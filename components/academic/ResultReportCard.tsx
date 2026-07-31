'use client'

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
  const normBatch = (batch || "").toLowerCase()
  if (normBatch.includes("ever shine") || normBatch.includes("shine") || normBatch.includes("quaid")) {
    return { bg: "bg-[#E6F4EA]", text: "text-[#16835D]", border: "border-[#A3E2C9]" } // Success green
  }
  if (normBatch.includes("iqbal")) {
    return { bg: "bg-[#FFF9E6]", text: "text-[#B78103]", border: "border-[#FFE59E]" } // Amber
  }
  if (normBatch.includes("improvement") || normBatch.includes("fail")) {
    return { bg: "bg-[#FCE8E6]", text: "text-[#B4233C]", border: "border-[#F9C2BD]" } // Warning red
  }
  return { bg: "bg-[#EBF3FC]", text: "text-[#2F66B3]", border: "border-[#BFDAF7]" } // Info Blue
}

function gradeColor(grade: string): string {
  const g = (grade || "").toUpperCase()
  if (['A+', 'A', 'B+'].includes(g)) return 'text-[#16835D]'
  if (['B', 'C+'].includes(g)) return 'text-[#2F66B3]'
  if (['C', 'D'].includes(g)) return 'text-[#B78103]'
  return 'text-[#B4233C]'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(first?: string, last?: string): string {
  return `${(first?.[0] ?? 'S').toUpperCase()}${(last?.[0] ?? 'T').toUpperCase()}`
}

// ── Main Component ────────────────────────────────────────────────────────────

const ResultReportCard = forwardRef<HTMLDivElement, ResultReportCardProps>(
  function ResultReportCard({ result, student, sessionName, attendancePct }, ref) {
    const totalObtained = result.subjects
      .filter((s) => !s.isAbsent && !s.isNotApplicable)
      .reduce((acc, s) => acc + (s.obtainedMarks ?? 0), 0)

    const totalPossible = result.subjects
      .filter((s) => !s.isNotApplicable)
      .reduce((acc, s) => acc + s.totalMarks, 0)

    const campusName = student.campus?.name ?? 'Madina Town Campus'

    return (
      <div
        ref={ref}
        data-pdf-page
        className="w-full max-w-[210mm] mx-auto bg-white font-sans border border-[#D9E0E8] overflow-hidden flex flex-col"
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: '#172033' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            .page-break-inside-avoid {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        ` }} />

        {/* Header */}
        <ResultCardHeader
          examSessionLabel={result.examSessionLabel}
          sectionLabel={result.sectionLabel}
          shiftName={result.shiftName}
          sessionName={sessionName}
          declaredAt={result.declaredAt}
          campusName={campusName}
        />

        {/* Student Information */}
        <StudentInformation
          student={student}
          result={result}
          attendancePct={attendancePct}
          sessionName={sessionName}
        />

        {/* Subject wise Results */}
        <SubjectResultTable
          subjects={result.subjects}
          overallPercentage={result.overallPercentage}
          grade={result.grade}
        />

        {/* Character Development Assessment */}
        <CharacterAssessment
          customFields={result.customFields}
          attendancePct={attendancePct}
        />

        {/* Teacher Remarks */}
        {result.teacherRemarks && (
          <div className="px-[15mm] pb-[6mm] page-break-inside-avoid">
            <div className="bg-[#F5F7FA] border border-[#D9E0E8] rounded-lg p-4">
              <p className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
                Teacher Remarks
              </p>
              <p className="text-xs text-[#172033] italic leading-relaxed">
                &ldquo;{result.teacherRemarks}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* Performance Summary */}
        <PerformanceSummary
          result={result}
          totalObtained={totalObtained}
          totalPossible={totalPossible}
          attendancePct={attendancePct}
        />

        {/* Signatures & Footer */}
        <div className="px-[15mm] pb-[6mm] mt-auto">
          <SignatureSection />
          <div className="mt-6">
            <ResultCardFooter
              termResultId={result.termResultId}
              declaredAt={result.declaredAt}
            />
          </div>
        </div>
      </div>
    )
  }
)

ResultReportCard.displayName = 'ResultReportCard'
export default ResultReportCard

// ── Sub-components ────────────────────────────────────────────────────────────

export function ResultCardHeader({
  examSessionLabel,
  sectionLabel,
  shiftName,
  sessionName,
  declaredAt,
  campusName,
}: {
  examSessionLabel: string
  sectionLabel: string
  shiftName: string | null
  sessionName: string | null
  declaredAt: string | null
  campusName: string
}) {
  return (
    <div className="bg-[#173B7A] text-white px-[15mm] py-[8mm] relative flex flex-col gap-4 select-none">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src="/brand/logo-crest-web.png"
            alt="Evershine Academy Logo"
            className="w-16 h-16 object-contain bg-white p-1 rounded-lg"
            crossOrigin="anonymous"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight leading-none mb-1">
              Evershine Academy
            </h1>
            <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider">
              {campusName}
            </p>
            <p className="text-[10px] text-blue-200/90 mt-0.5">
              Madina Town, Gujranwala
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-[#2F66B3] text-white text-xs font-extrabold px-3.5 py-1 rounded-md uppercase tracking-wider mb-2">
            Examination Report Card
          </span>
          <p className="text-[10px] text-blue-200">
            Academic Year: {sessionName ?? "—"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-blue-100">Term:</span>
          <span>{examSessionLabel}</span>
          <span className="text-white/30">|</span>
          <span className="font-bold text-blue-100">Class:</span>
          <span>{sectionLabel}</span>
          {shiftName && (
            <>
              <span className="text-white/30">|</span>
              <span className="font-bold text-blue-100">Shift:</span>
              <span>{shiftName}</span>
            </>
          )}
        </div>
        {declaredAt && (
          <span className="text-[11px] text-blue-200">
            Declaration Date: {fmtDate(declaredAt)}
          </span>
        )}
      </div>
    </div>
  )
}

export function StudentInformation({
  student,
  result,
  attendancePct,
  sessionName,
}: {
  student: ReportCardStudent
  result: ReportCardResult
  attendancePct: number | null | undefined
  sessionName?: string | null
}) {
  const studentName = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim()
  const hasPhoto = !!student.profilePicture
  const batchStyle = performanceBatchStyle(result.performanceBatch)

  return (
    <div className="flex flex-col md:flex-row gap-6 px-[15mm] py-[6mm] bg-white border-b border-[#D9E0E8]">
      <div className="flex-1 flex flex-col sm:flex-row gap-5">
        <div className="flex-shrink-0">
          {hasPhoto ? (
            <img
              src={student.profilePicture!}
              alt={studentName}
              className="w-24 h-24 rounded-lg object-cover border border-[#D9E0E8] shadow-sm"
              crossOrigin="anonymous"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-lg flex items-center justify-center border border-[#D9E0E8] shadow-sm text-white font-black text-3xl"
              style={{ background: "linear-gradient(135deg, #173B7A, #2F66B3)" }}
            >
              {initials(student.firstName, student.lastName)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight leading-tight truncate mb-1">
            {studentName || "Student Name"}
          </h2>
          {student.fatherName && (
            <p className="text-sm text-[#5F6B7A] mb-3">
              Father/Guardian: <span className="text-[#172033] font-semibold">{student.fatherName}</span>
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <InfoRow label="Reg. Number" value={student.registrationNumber} />
            <InfoRow label="Roll Number" value={result.subjects.length > 0 ? (student.rollNumber ?? "—") : "—"} />
            <InfoRow label="Class / Section" value={result.sectionLabel} />
            <InfoRow label="Shift" value={result.shiftName ?? "Regular"} />
            <InfoRow label="Campus" value={student.campus?.name ?? "Evershine Academy"} />
            <InfoRow label="Batch / Program" value={student.batch?.name} />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 w-full md:w-48 flex flex-row md:flex-col gap-3 justify-end md:justify-start">
        <div className={`flex-1 p-2.5 rounded-lg border text-center ${batchStyle.bg} ${batchStyle.border}`}>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#5F6B7A] mb-1">
            Performance Group
          </p>
          <p className={`text-xs font-extrabold ${batchStyle.text}`}>
            {result.performanceBatch}
          </p>
        </div>

        {result.classPosition !== null && (
          <div className="flex-1 p-2.5 rounded-lg border border-[#D9E0E8] bg-[#F5F7FA] text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#5F6B7A] mb-1">
              Class Rank
            </p>
            <p className="text-sm font-extrabold text-[#172033]">
              #{result.classPosition}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[#5F6B7A]">{label}</span>
      <span className="text-xs font-semibold text-[#172033] truncate">{value ?? "—"}</span>
    </div>
  )
}

export function SubjectResultTable({ subjects, overallPercentage, grade }: {
  subjects: ReportCardSubject[]
  overallPercentage: number
  grade: string
}) {
  const totalObtained = subjects
    .filter((s) => !s.isAbsent && !s.isNotApplicable)
    .reduce((acc, s) => acc + (s.obtainedMarks ?? 0), 0)

  const totalPossible = subjects
    .filter((s) => !s.isNotApplicable)
    .reduce((acc, s) => acc + s.totalMarks, 0)

  const overallPassed = subjects
    .filter((s) => !s.isNotApplicable && !s.isAbsent)
    .every((s) => s.isPassed)

  return (
    <div className="px-[15mm] py-[6mm]">
      <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-1.5 h-3 bg-[#173B7A] rounded-sm" />
        Subject-Wise Result
      </h3>
      <div className="overflow-x-auto rounded-lg border border-[#D9E0E8] shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#173B7A] text-white text-[10px] font-bold uppercase tracking-wider border-b border-[#173B7A]">
              <th className="px-4 py-3 text-left">Subject</th>
              <th className="px-4 py-3 text-center">Obtained Marks</th>
              <th className="px-4 py-3 text-center">Total Marks</th>
              <th className="px-4 py-3 text-center">Percentage</th>
              <th className="px-4 py-3 text-center">Grade</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left max-w-xs">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9E0E8] text-xs text-[#172033]">
            {subjects.map((sub) => {
              const isAbsent = sub.isAbsent
              const isNA = sub.isNotApplicable
              const passed = sub.isPassed && !isAbsent

              return (
                <tr key={sub.subjectId} className="hover:bg-[#F5F7FA] transition-colors page-break-inside-avoid">
                  <td className="px-4 py-3 font-semibold">
                    <div>{sub.subjectName}</div>
                    <div className="text-[10px] text-[#5F6B7A] font-mono mt-0.5">{sub.subjectCode}</div>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-sm">
                    {isNA ? "—" : isAbsent ? "Abs" : sub.obtainedMarks}
                  </td>
                  <td className="px-4 py-3 text-center text-[#5F6B7A]">
                    {sub.totalMarks}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-[#2F66B3]">
                    {isNA || isAbsent ? "—" : `${sub.percentage.toFixed(1)}%`}
                  </td>
                  <td className={`px-4 py-3 text-center font-extrabold ${gradeColor(sub.grade)}`}>
                    {isNA ? "—" : isAbsent ? "Abs" : sub.grade}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isNA ? (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-[#F5F7FA] text-[#5F6B7A] font-bold">
                        N/A
                      </span>
                    ) : isAbsent ? (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-[#FFF9E6] text-[#B78103] font-bold">
                        Absent
                      </span>
                    ) : passed ? (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-[#E6F4EA] text-[#16835D] font-bold">
                        Pass
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-[#FCE8E6] text-[#B4233C] font-bold">
                        Fail
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-left max-w-xs whitespace-normal break-words text-[#5F6B7A]">
                    {sub.remarks || "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#172033] text-white text-xs font-bold border-t border-[#D9E0E8]">
              <td className="px-4 py-3 font-extrabold uppercase">Total / Summary</td>
              <td className="px-4 py-3 text-center font-black text-sm text-[#A3E2C9]">
                {Math.round(totalObtained * 100) / 100}
              </td>
              <td className="px-4 py-3 text-center text-slate-300">
                {totalPossible}
              </td>
              <td className="px-4 py-3 text-center font-black text-sm text-blue-200">
                {overallPercentage.toFixed(1)}%
              </td>
              <td className={`px-4 py-3 text-center font-black text-sm ${gradeColor(grade)} !text-white`}>
                {grade}
              </td>
              <td className="px-4 py-3 text-center">
                {overallPassed ? (
                  <span className="inline-block text-[10px] px-2.5 py-0.5 rounded-md bg-[#E6F4EA] text-[#16835D] font-bold">
                    Pass
                  </span>
                ) : (
                  <span className="inline-block text-[10px] px-2.5 py-0.5 rounded-md bg-[#FCE8E6] text-[#B4233C] font-bold">
                    Fail
                  </span>
                )}
              </td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function CharacterAssessment({ customFields, attendancePct }: {
  customFields: ReportCardCustomField[]
  attendancePct: number | null | undefined
}) {
  const fields = [...customFields]
  if (attendancePct !== null && attendancePct !== undefined) {
    fields.push({ label: "Attendance", value: `${attendancePct}%` })
  }

  if (fields.length === 0) return null

  return (
    <div className="px-[15mm] pb-[6mm] page-break-inside-avoid">
      <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-1.5 h-3 bg-[#2F66B3] rounded-sm" />
        Character &amp; Development Assessment
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {fields.map((field) => (
          <div
            key={field.label}
            className="bg-white border border-[#D9E0E8] rounded-lg p-3 flex flex-col justify-center"
          >
            <p className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              {field.label}
            </p>
            <p className="text-sm font-extrabold text-[#172033] leading-none">
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PerformanceSummary({
  result,
  totalObtained,
  totalPossible,
  attendancePct,
}: {
  result: ReportCardResult
  totalObtained: number
  totalPossible: number
  attendancePct: number | null | undefined
}) {
  const batchStyle = performanceBatchStyle(result.performanceBatch)

  return (
    <div className="px-[15mm] pb-[6mm] page-break-inside-avoid">
      <div className="bg-[#F5F7FA] border border-[#D9E0E8] rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-widest mb-4">
          Overall Performance Summary
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Marks Obtained
            </span>
            <span className="text-base font-extrabold text-[#172033]">
              {Math.round(totalObtained * 100) / 100} / {totalPossible}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Overall Percentage
            </span>
            <span className="text-base font-extrabold text-[#2F66B3]">
              {result.overallPercentage.toFixed(1)}%
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Final Grade
            </span>
            <span className={`text-base font-black ${gradeColor(result.grade)}`}>
              {result.grade}
            </span>
          </div>

          <div className="flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Group &amp; Class Rank
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${batchStyle.bg} ${batchStyle.text} ${batchStyle.border}`}>
                {result.performanceBatch}
              </span>
              {result.classPosition !== null && (
                <span className="font-extrabold text-[#172033]">
                  Rank #{result.classPosition}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SignatureSection() {
  return (
    <div className="grid grid-cols-3 gap-6 text-center border-t border-[#D9E0E8] pt-6 mt-6 page-break-inside-avoid">
      <SignatureLine title="Class Teacher" subtitle="Signature & Stamp" />
      <SignatureLine title="Head of Department" subtitle="Signature & Stamp" />
      <SignatureLine title="Principal / Controller" subtitle="Official Seal" />
    </div>
  )
}

function SignatureLine({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full h-12 border-b border-dashed border-[#5F6B7A] rounded-t-lg bg-white/40" />
      <div>
        <p className="text-xs font-bold text-[#172033]">{title}</p>
        <p className="text-[9px] text-[#5F6B7A] uppercase tracking-wider mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

export function ResultCardFooter({ termResultId, declaredAt }: {
  termResultId: string
  declaredAt: string | null
}) {
  return (
    <div className="pt-4 border-t border-[#D9E0E8]/60 flex items-center justify-between text-[9px] text-[#5F6B7A] uppercase tracking-wider">
      <p>
        Official Document of Evershine Academy. All rights reserved.
      </p>
      <p className="font-mono">
        REF: ESA/{termResultId.slice(-8).toUpperCase()}
      </p>
    </div>
  )
}
