'use client'

/**
 * Teacher Portal — Import Student Attendance
 *
 * Allows teachers to upload a biometric Excel export and import student
 * attendance records for their assigned class sections.
 *
 * Endpoint: POST /api/teacher-portal/attendance/import/student
 * Template: GET  /api/admin/attendance/templates/student
 *
 * Scope enforcement is handled server-side. Teachers can only import for
 * their own sections — the API will return row-level errors for any
 * section they are not assigned to.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Info,
  Download,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'

interface RowValidationError {
  row: number
  errors: string[]
}

export default function TeacherAttendanceImportPage() {
  const [file,             setFile]             = useState<File | null>(null)
  const [isDragOver,       setIsDragOver]       = useState(false)
  const [isUploading,      setIsUploading]      = useState(false)
  const [validationErrors, setValidationErrors] = useState<RowValidationError[]>([])
  const [successCount,     setSuccessCount]     = useState<number | null>(null)

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && (dropped.name.endsWith('.xlsx') || dropped.name.endsWith('.xls'))) {
      selectFile(dropped)
    } else {
      notify.error('Only Excel files (.xlsx or .xls) are accepted')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) selectFile(selected)
  }

  const selectFile = (f: File) => {
    setFile(f)
    setValidationErrors([])
    setSuccessCount(null)
  }

  // ── Template download ──────────────────────────────────────────────────────

  const downloadTemplate = () => {
    window.open('/api/admin/attendance/templates/student', '_blank')
  }

  // ── Import submission ──────────────────────────────────────────────────────

  const triggerUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setValidationErrors([])
    setSuccessCount(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/teacher-portal/attendance/import/student', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data?.rowErrors?.length > 0) {
          setValidationErrors(data.rowErrors)
          notify.error('Validation failed. Review the errors below and fix your file.')
        } else {
          notify.error(data?.message || 'Import failed. Please try again.')
        }
      } else {
        setSuccessCount(data?.data?.count ?? 0)
        notify.success(data?.message || 'Attendance imported successfully!')
        setFile(null)
      }
    } catch {
      notify.error('A network error occurred. Please check your connection and try again.')
    } finally {
      setIsUploading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-1">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/teacher/attendance"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium mb-2 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Attendance
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <UploadCloud className="w-6 h-6 text-emerald-600" />
            Import Student Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload a biometric Excel export to bulk-update attendance records for your class sections.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left column: info cards */}
        <div className="space-y-4">

          {/* Scope notice */}
          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-800">
                <ShieldCheck className="w-4 h-4" />
                Your Import Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-700 space-y-2 leading-relaxed">
              <p>• You can only import attendance for <strong>class sections you are assigned to teach</strong>.</p>
              <p>• Rows referencing other sections will be rejected with a row-level error.</p>
              <p>• All imports are logged with your identity for audit trail purposes.</p>
            </CardContent>
          </Card>

          {/* Column schema guide */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700">
                <Info className="w-4 h-4 text-slate-500" />
                Required Excel Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 space-y-1.5">
              {[
                { col: 'Student ID', desc: 'Roll number or Registration No.' },
                { col: 'Class Section ID', desc: 'Exact section CUID from the LMS' },
                { col: 'Date (YYYY-MM-DD)', desc: 'e.g. 2026-07-13' },
                { col: 'Status (PRESENT/ABSENT/LATE/EXCUSED)', desc: 'Exact value required' },
                { col: 'Remarks', desc: 'Optional — free text' },
              ].map(({ col, desc }) => (
                <div key={col}>
                  <span className="font-semibold text-slate-800">{col}</span>
                  <br />
                  <span className="text-slate-500">{desc}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right column: action panel */}
        <div className="md:col-span-2">
          <Card className="shadow-md border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900">
                Student Attendance Ingestion
              </CardTitle>
              <CardDescription>
                Download the schema template, fill it with your biometric data, then upload it here.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Template download strip */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4">
                <div>
                  <p className="font-semibold text-sm text-slate-800">Download Schema Template</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Fill this template with your biometric export data before uploading.
                  </p>
                </div>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Get Excel Template
                </Button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center text-center cursor-pointer ${
                  isDragOver
                    ? 'border-emerald-500 bg-emerald-50/30'
                    : file
                    ? 'border-emerald-400 bg-emerald-50/20'
                    : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/10'
                }`}
              >
                <input
                  id="teacher-attendance-file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isUploading}
                />
                <UploadCloud
                  className={`w-10 h-10 mb-3 transition-colors ${
                    file ? 'text-emerald-500' : 'text-slate-400'
                  }`}
                />
                {file ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-emerald-700 text-sm">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB · Click to change file
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="font-medium text-slate-700 text-sm">
                      Drag & drop your Excel file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-400">
                      Accepts .xlsx and .xls formats only
                    </p>
                  </div>
                )}
              </div>

              {/* Success banner */}
              {successCount !== null && (
                <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-800">
                    <strong>Import Successful:</strong> {successCount} attendance record
                    {successCount !== 1 ? 's' : ''} have been upserted into the database.
                    Updated statuses are now live.
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {file && (
                <div className="flex justify-end gap-3 pt-1">
                  <Button
                    onClick={() => { setFile(null); setValidationErrors([]); setSuccessCount(null) }}
                    variant="ghost"
                    disabled={isUploading}
                    size="sm"
                  >
                    Clear
                  </Button>
                  <Button
                    id="teacher-import-submit-btn"
                    onClick={triggerUpload}
                    disabled={isUploading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2"
                    size="sm"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        Start Import
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Validation errors table */}
              {validationErrors.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-rose-600 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {validationErrors.length} Row{validationErrors.length !== 1 ? 's' : ''} Failed Validation
                    <span className="font-normal text-rose-500">— No records were imported.</span>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-lg border border-rose-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-rose-50 text-rose-800 font-semibold border-b border-rose-200">
                          <th className="p-3 w-20">Row #</th>
                          <th className="p-3">Validation Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {validationErrors.map((err) => (
                          <tr key={err.row} className="hover:bg-rose-50/40">
                            <td className="p-3 font-bold text-rose-700">{err.row}</td>
                            <td className="p-3 text-rose-600 space-y-0.5">
                              {err.errors.map((msg, idx) => (
                                <div key={idx}>• {msg}</div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-slate-500">
                    Fix all highlighted rows in your Excel file and re-upload. Partial imports are not allowed.
                  </p>
                </div>
              )}

            </CardContent>
          </Card>

          {/* How-to guide */}
          <Card className="mt-4 border-slate-200 bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Download className="w-4 h-4 text-slate-500" />
                How to Import Biometric Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="text-xs text-slate-600 space-y-2 list-decimal pl-4">
                <li>Click <strong>Get Excel Template</strong> above to download the schema file.</li>
                <li>Open the template and fill in the <strong>Template</strong> sheet with your biometric data.</li>
                <li>
                  For each student, enter their <strong>Student ID</strong> (Roll No. or Registration No.)
                  and the exact <strong>Class Section ID</strong> from the LMS.
                </li>
                <li>Set the <strong>Status</strong> column to one of: <code>PRESENT</code>, <code>ABSENT</code>, <code>LATE</code>, or <code>EXCUSED</code>.</li>
                <li>Save the file as <strong>.xlsx</strong>, then drag it into the upload zone above.</li>
                <li>Click <strong>Start Import</strong>. Any errors will be shown row by row before any data is saved.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
