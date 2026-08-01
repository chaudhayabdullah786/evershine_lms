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

function getPerformanceBatchStyle(batch: string): { bg: string; text: string; border: string } {
  const normBatch = (batch || "").toLowerCase()
  if (normBatch.includes("ever shine") || normBatch.includes("shine")) {
    return { bg: "bg-[#E6F4EA]", text: "text-[#16835D]", border: "border-[#A3E2C9]" } // Success green
  }
  if (normBatch.includes("quaid")) {
    return { bg: "bg-[#EBF3FC]", text: "text-[#2F66B3]", border: "border-[#BFDAF7]" } // Blue
  }
  if (normBatch.includes("iqbal")) {
    return { bg: "bg-[#FFF9E6]", text: "text-[#B78103]", border: "border-[#FFE59E]" } // Amber
  }
  if (normBatch.includes("improvement") || normBatch.includes("fail")) {
    return { bg: "bg-[#FCE8E6]", text: "text-[#B4233C]", border: "border-[#F9C2BD]" } // Warning red
  }
  return { bg: "bg-[#F5F7FA]", text: "text-[#5F6B7A]", border: "border-[#D9E0E8]" } // Default grey
}

function getGradeColor(grade: string): string {
  const g = (grade || "").toUpperCase()
  if (['A+', 'A', 'B+'].includes(g)) return 'text-[#16835D]'
  if (['B', 'C+'].includes(g)) return 'text-[#2F66B3]'
  if (['C', 'D'].includes(g)) return 'text-[#B78103]'
  return 'text-[#B4233C]'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getInitials(first?: string, last?: string): string {
  return `${(first?.[0] ?? 'S').toUpperCase()}${(last?.[0] ?? 'T').toUpperCase()}`
}

// ── Main Wrapper Component ───────────────────────────────────────────────────

const ResultReportCard = forwardRef<HTMLDivElement, ResultReportCardProps>(
  function ResultReportCard({ result, student, sessionName, attendancePct }, ref) {
    return (
      <div
        ref={ref}
        data-pdf-page
        data-pdf-physical-unit="mm"
        data-pdf-physical-width="210"
        data-pdf-physical-height="297"
        className="w-full max-w-[210mm] mx-auto bg-white border border-[#D9E0E8] overflow-hidden flex flex-col print-container"
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          color: '#172033',
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              margin: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background-color: #ffffff !important;
            }
            .print-container {
              border: none !important;
              box-shadow: none !important;
              width: 210mm !important;
              height: 297mm !important;
              max-width: 210mm !important;
              min-height: 297mm !important;
              padding: 15mm !important;
              box-sizing: border-box !important;
              background-color: #ffffff !important;
            }
            .page-break-inside-avoid {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            thead {
              display: table-header-group !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        ` }} />

        <ResultCardDocument
          result={result}
          student={student}
          sessionName={sessionName}
          attendancePct={attendancePct}
        />
      </div>
    )
  }
)

ResultReportCard.displayName = 'ResultReportCard'
export default ResultReportCard

// ── Document Builder Component ────────────────────────────────────────────────

export function ResultCardDocument({
  result,
  student,
  sessionName,
  attendancePct,
}: ResultReportCardProps) {
  // Calculations
  const validSubjects = result.subjects.filter((s) => !s.isAbsent && !s.isNotApplicable)
  const totalObtained = validSubjects.reduce((acc, s) => acc + (s.obtainedMarks ?? 0), 0)
  const totalPossible = result.subjects.filter((s) => !s.isNotApplicable).reduce((acc, s) => acc + s.totalMarks, 0)

  const overallPassed = result.subjects
    .filter((s) => !s.isNotApplicable && !s.isAbsent)
    .every((s) => s.isPassed)

  return (
    <div className="flex-1 flex flex-col bg-white p-6 sm:p-8 space-y-6">
      {/* Header */}
      <ResultCardHeader
        examSessionLabel={result.examSessionLabel}
        declaredAt={result.declaredAt}
        campusName={student.campus?.name}
        sessionName={sessionName}
        sectionLabel={result.sectionLabel}
        shiftName={result.shiftName}
      />

      {/* Student Information and Rank */}
      <StudentInformation
        student={student}
        result={result}
        sessionName={sessionName}
      />

      {/* Subject Result Table */}
      <SubjectResultTable
        subjects={result.subjects}
        totalObtained={totalObtained}
        totalPossible={totalPossible}
        overallPercentage={result.overallPercentage}
        grade={result.grade}
        overallPassed={overallPassed}
      />

      {/* Character and Development Assessment (Optional) */}
      <CharacterAssessment
        customFields={result.customFields}
        attendancePct={attendancePct}
      />

      {/* Instructor Remarks */}
      {result.teacherRemarks && (
        <div className="page-break-inside-avoid">
          <div className="bg-[#F5F7FA] border border-[#D9E0E8] rounded-md p-3">
            <p className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Teacher Remarks
            </p>
            <p className="text-xs text-[#172033] italic leading-relaxed whitespace-normal break-words">
              &ldquo;{result.teacherRemarks}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Overall Performance Summary */}
      <PerformanceSummary
        result={result}
        totalObtained={totalObtained}
        totalPossible={totalPossible}
      />

      {/* Signature Section */}
      <div className="mt-auto pt-6 page-break-inside-avoid">
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

// ── Reusable Component Definitions ───────────────────────────────────────────

export function ResultCardHeader({
  examSessionLabel,
  declaredAt,
  campusName,
  sessionName,
  sectionLabel,
  shiftName,
}: {
  examSessionLabel: string
  declaredAt: string | null
  campusName?: string | null
  sessionName?: string | null
  sectionLabel: string
  shiftName: string | null
}) {
  const displayCampus = campusName ?? 'Madina Town Campus'
  
  return (
    <div className="bg-[#173B7A] text-white px-6 py-5 rounded-md flex flex-col gap-4 select-none page-break-inside-avoid border border-[#173B7A]">
      <div className="flex flex-row items-center justify-between gap-4">
        {/* Logo and Academy Title */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white p-1 rounded-md shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src="/bglogo.png"
              alt="Evershine Academy Logo"
              className="w-full h-full object-contain scale-[1.75]"
              crossOrigin="anonymous"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight leading-none mb-1 text-white">
              Evershine Academy
            </h1>
            <p className="text-[11px] font-bold text-blue-100 uppercase tracking-wide">
              {displayCampus}
            </p>
            <p className="text-[9px] text-blue-200 mt-0.5 font-medium">
              Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony
            </p>
          </div>
        </div>

        {/* Title and Academic Session */}
        <div className="text-right flex flex-col items-end shrink-0">
          <span className="inline-block bg-[#2F66B3] text-white text-[11px] font-extrabold px-3 py-1 rounded uppercase tracking-wider mb-1.5 border border-[#2F66B3]">
            EXAMINATION REPORT CARD
          </span>
          <p className="text-[10px] text-blue-100 font-semibold">
            Academic Year: {sessionName ?? "—"}
          </p>
        </div>
      </div>

      {/* Meta Info Bar */}
      <div className="flex items-center justify-between border-t border-white/20 pt-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-bold text-blue-200">Term:</span>
            <span className="font-semibold text-white">{examSessionLabel}</span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1">
            <span className="font-bold text-blue-200">Class:</span>
            <span className="font-semibold text-white">{sectionLabel}</span>
          </div>
          {shiftName && (
            <>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-blue-200">Shift:</span>
                <span className="font-semibold text-white">{shiftName}</span>
              </div>
            </>
          )}
        </div>
        {declaredAt && (
          <span className="text-[10px] font-semibold text-blue-200">
            Declared: {formatDate(declaredAt)}
          </span>
        )}
      </div>
    </div>
  )
}

export function StudentInformation({
  student,
  result,
  sessionName,
}: {
  student: ReportCardStudent
  result: ReportCardResult
  sessionName?: string | null
}) {
  const studentName = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim()
  const hasPhoto = !!student.profilePicture
  const batchStyle = getPerformanceBatchStyle(result.performanceBatch)

  return (
    <div className="flex flex-row gap-6 items-stretch justify-between py-1 page-break-inside-avoid">
      <div className="flex-1 flex flex-row gap-5 items-start">
        {/* Profile Picture / Initials */}
        <div className="flex-shrink-0">
          {hasPhoto ? (
            <img
              src={student.profilePicture!}
              alt={studentName}
              className="w-20 h-24 rounded-md object-cover border border-[#D9E0E8]"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-20 h-24 rounded-md flex items-center justify-center border border-[#D9E0E8] bg-[#173B7A] text-white font-extrabold text-2xl select-none">
              {getInitials(student.firstName, student.lastName)}
            </div>
          )}
        </div>

        {/* Student Fields */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-[#172033] tracking-tight leading-none mb-3 break-words">
            {studentName || "Student Name"}
          </h2>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            <StudentField label="Father / Guardian" value={student.fatherName} />
            <StudentField label="Reg. Number" value={student.registrationNumber} />
            <StudentField label="Roll Number" value={result.subjects.length > 0 ? (student.rollNumber ?? "—") : "—"} />
            <StudentField label="Class / Section" value={student.class?.name ?? result.sectionLabel} />
            <StudentField label="Program / Batch" value={student.batch?.name} />
            <StudentField label="Academic Year" value={sessionName ?? "—"} />
          </div>
        </div>
      </div>

      {/* Performance Status Indicators */}
      <div className="flex-shrink-0 w-44 flex flex-col gap-3 justify-center border border-[#D9E0E8] bg-[#F5F7FA] rounded-md p-3">
        <div className="text-center">
          <p className="text-[8px] font-bold uppercase tracking-wider text-[#5F6B7A] mb-1">
            Performance Group
          </p>
          <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-extrabold border ${batchStyle.bg} ${batchStyle.text} ${batchStyle.border} break-all`}>
            {result.performanceBatch}
          </span>
        </div>

        {result.classPosition !== null && (
          <div className="text-center border-t border-[#D9E0E8] pt-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-[#5F6B7A] mb-0.5">
              Class Rank
            </p>
            <p className="text-sm font-black text-[#172033]">
              #{result.classPosition}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function StudentField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col min-w-0 text-left">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[#5F6B7A]">{label}</span>
      <span className="text-[11px] font-bold text-[#172033] mt-0.5 break-words whitespace-normal">{value ?? "—"}</span>
    </div>
  )
}

export function SubjectResultTable({
  subjects,
  totalObtained,
  totalPossible,
  overallPercentage,
  grade,
  overallPassed,
}: {
  subjects: ReportCardSubject[]
  totalObtained: number
  totalPossible: number
  overallPercentage: number
  grade: string
  overallPassed: boolean
}) {
  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-md border border-[#D9E0E8] shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#173B7A] text-white text-[10px] font-bold uppercase tracking-wider border-b border-[#173B7A]">
              <th className="px-4 py-2.5 text-left font-extrabold">Subject</th>
              <th className="px-4 py-2.5 text-center font-extrabold">Obtained Marks</th>
              <th className="px-4 py-2.5 text-center font-extrabold">Total Marks</th>
              <th className="px-4 py-2.5 text-center font-extrabold">Percentage</th>
              <th className="px-4 py-2.5 text-center font-extrabold">Grade</th>
              <th className="px-4 py-2.5 text-center font-extrabold">Status</th>
              <th className="px-4 py-2.5 text-left font-extrabold max-w-xs">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9E0E8] text-xs text-[#172033] bg-white">
            {subjects.map((sub) => {
              const isAbsent = sub.isAbsent
              const isNA = sub.isNotApplicable
              const passed = sub.isPassed && !isAbsent

              return (
                <tr key={sub.subjectId} className="hover:bg-[#F5F7FA] transition-colors page-break-inside-avoid">
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-[#172033] block">{sub.subjectName}</span>
                    <span className="text-[9px] text-[#5F6B7A] font-semibold block mt-0.5">{sub.subjectCode}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-extrabold text-xs">
                    {isNA ? "—" : isAbsent ? "Abs" : sub.obtainedMarks}
                  </td>
                  <td className="px-4 py-2.5 text-center text-[#5F6B7A] font-semibold">
                    {sub.totalMarks}
                  </td>
                  <td className="px-4 py-2.5 text-center font-extrabold text-[#2F66B3]">
                    {isNA || isAbsent ? "—" : `${sub.percentage.toFixed(1)}%`}
                  </td>
                  <td className={`px-4 py-2.5 text-center font-extrabold ${getGradeColor(sub.grade)}`}>
                    {isNA ? "—" : isAbsent ? "Abs" : sub.grade}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isNA ? (
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-[#F5F7FA] text-[#5F6B7A] font-bold border border-[#D9E0E8]">
                        N/A
                      </span>
                    ) : isAbsent ? (
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-[#FFF9E6] text-[#B78103] font-bold border border-[#FFE59E]">
                        Absent
                      </span>
                    ) : passed ? (
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-[#E6F4EA] text-[#16835D] font-bold border border-[#A3E2C9]">
                        Pass
                      </span>
                    ) : (
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-[#FCE8E6] text-[#B4233C] font-bold border border-[#F9C2BD]">
                        Fail
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-left max-w-xs whitespace-normal break-words text-[#5F6B7A] font-medium">
                    {sub.remarks || "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#172033] text-white text-xs font-bold border-t border-[#D9E0E8]">
              <td className="px-4 py-3 font-extrabold uppercase">Total / Summary</td>
              <td className="px-4 py-3 text-center font-black text-[#A3E2C9]">
                {Math.round(totalObtained * 100) / 100}
              </td>
              <td className="px-4 py-3 text-center text-slate-300">
                {totalPossible}
              </td>
              <td className="px-4 py-3 text-center font-black text-blue-200">
                {overallPercentage.toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-center font-black text-white">
                {grade}
              </td>
              <td className="px-4 py-3 text-center">
                {overallPassed ? (
                  <span className="inline-block text-[9px] px-2.5 py-0.5 rounded bg-[#E6F4EA] text-[#16835D] font-bold border border-[#A3E2C9]">
                    Pass
                  </span>
                ) : (
                  <span className="inline-block text-[9px] px-2.5 py-0.5 rounded bg-[#FCE8E6] text-[#B4233C] font-bold border border-[#F9C2BD]">
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

export function CharacterAssessment({
  customFields,
  attendancePct,
}: {
  customFields: ReportCardCustomField[]
  attendancePct: number | null | undefined
}) {
  const fields = [...customFields]
  if (attendancePct !== null && attendancePct !== undefined) {
    fields.push({ label: "Attendance", value: `${attendancePct}%` })
  }

  if (fields.length === 0) return null

  return (
    <div className="page-break-inside-avoid">
      <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider mb-2.5 flex items-center gap-2 select-none">
        <span className="w-1 h-3 bg-[#2F66B3] rounded-sm" />
        Character &amp; Development Assessment
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {fields.map((field) => (
          <div
            key={field.label}
            className="bg-white border border-[#D9E0E8] rounded-md p-3 flex flex-col justify-center"
          >
            <p className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              {field.label}
            </p>
            <p className="text-xs font-extrabold text-[#172033] leading-tight break-words">
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
}: {
  result: ReportCardResult
  totalObtained: number
  totalPossible: number
}) {
  const batchStyle = getPerformanceBatchStyle(result.performanceBatch)

  return (
    <div className="page-break-inside-avoid">
      <div className="bg-[#F5F7FA] border border-[#D9E0E8] rounded-md p-4">
        <h4 className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-3 select-none">
          Overall Performance Summary
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Marks Obtained
            </span>
            <span className="text-sm font-extrabold text-[#172033] truncate">
              {Math.round(totalObtained * 100) / 100} / {totalPossible}
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Overall Percentage
            </span>
            <span className="text-sm font-extrabold text-[#2F66B3] truncate">
              {result.overallPercentage.toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Final Grade
            </span>
            <span className={`text-sm font-extrabold ${getGradeColor(result.grade)} truncate`}>
              {result.grade}
            </span>
          </div>

          <div className="flex flex-col min-w-0 justify-center">
            <span className="text-[9px] font-bold text-[#5F6B7A] uppercase tracking-wider mb-1">
              Group &amp; Rank
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${batchStyle.bg} ${batchStyle.text} ${batchStyle.border} truncate`}>
                {result.performanceBatch}
              </span>
              {result.classPosition !== null && (
                <span className="font-extrabold text-[#172033] text-xs shrink-0">
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
    <div className="grid grid-cols-3 gap-6 text-center border-t border-[#D9E0E8] pt-5 mt-2 page-break-inside-avoid">
      <SignatureLine title="Class Teacher" subtitle="Signature & Stamp" />
      <SignatureLine title="Head of Department" subtitle="Signature & Stamp" />
      <SignatureLine title="Principal / Controller" subtitle="Official Seal" />
    </div>
  )
}

function SignatureLine({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-full h-8 border-b border-dashed border-[#5F6B7A]/60 rounded-t" />
      <div>
        <p className="text-xs font-bold text-[#172033]">{title}</p>
        <p className="text-[8px] font-bold text-[#5F6B7A] uppercase tracking-wider mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

export function ResultCardFooter({
  termResultId,
  declaredAt,
}: {
  termResultId: string
  declaredAt: string | null
}) {
  return (
    <div className="pt-4 border-t border-[#D9E0E8]/60 flex items-center justify-between text-[9px] text-[#5F6B7A] uppercase tracking-wider select-none font-semibold">
      <p>
        Official Document of Evershine Academy.
      </p>
      <p className="font-mono font-bold">
        REF: ESA/{termResultId.slice(-8).toUpperCase()}
      </p>
    </div>
  )
}
