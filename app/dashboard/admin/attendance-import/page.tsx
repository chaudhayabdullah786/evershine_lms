'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  ArrowRight, 
  Info,
  Calendar,
  Users
} from 'lucide-react'

interface RowValidationError {
  row: number
  errors: string[]
}

export default function AdminAttendanceImportPage() {
  const [activeTab, setActiveTab] = useState<'staff' | 'student'>('staff')
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<RowValidationError[]>([])
  const [successCount, setSuccessCount] = useState<number | null>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      setFile(droppedFile)
      setValidationErrors([])
      setSuccessCount(null)
    } else {
      notify.error('Please upload only Excel files (.xlsx or .xls)')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setValidationErrors([])
      setSuccessCount(null)
    }
  }

  const downloadTemplate = () => {
    const url = `/api/admin/attendance/templates/${activeTab}`
    window.open(url, '_blank')
  }

  const triggerUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setValidationErrors([])
    setSuccessCount(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/admin/attendance/import/${activeTab}`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.rowErrors) {
          setValidationErrors(data.rowErrors)
          notify.error('File validation failed. Please check the errors below.')
        } else {
          notify.error(data.message || 'Failed to import attendance')
        }
      } else {
        setSuccessCount(data.data.count)
        notify.success(data.message || 'Attendance imported successfully!')
        setFile(null)
      }
    } catch (err: any) {
      notify.error('An error occurred during upload')
      console.error(err)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Biometric & Excel Attendance Ingestion
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Download verified templates, parse raw biometric logs, and import attendance records directly.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 space-y-4">
          <Card className="shadow-md border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-400">Import Target</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              <button
                onClick={() => { setActiveTab('staff'); setFile(null); setValidationErrors([]); setSuccessCount(null) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'staff' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Users className="w-4 h-4" />
                Staff & Teacher Ingestion
              </button>
              <button
                onClick={() => { setActiveTab('student'); setFile(null); setValidationErrors([]); setSuccessCount(null) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'student' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Calendar className="w-4 h-4" />
                Student Ingestion
              </button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <Info className="w-4 h-4" />
                System Rule Constraints
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-amber-700 dark:text-amber-300 space-y-2 leading-relaxed">
              <p>• Only <strong>Superadmins</strong> and <strong>Admins</strong> have write access to attendance imports.</p>
              <p>• Excel files must adhere to the exact column schema defined in the download template.</p>
              <p>• Check-in time lateness parameters are automatically matched against the registered shift definitions.</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Panel */}
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-lg border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-xl font-bold">
                {activeTab === 'staff' ? 'Staff & Teacher Attendance Ingestion' : 'Student Attendance Ingestion'}
              </CardTitle>
              <CardDescription>
                Download the verified validation schema or drag and drop your completed file to process the batch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template Download */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl gap-4">
                <div className="space-y-1">
                  <div className="font-semibold text-sm">Download Verified Schema</div>
                  <div className="text-xs text-slate-500">Ensure the downloaded biometric report is mapped to this template.</div>
                </div>
                <Button onClick={downloadTemplate} variant="outline" className="flex items-center gap-2 border-indigo-200 hover:border-indigo-400 text-indigo-600 dark:text-indigo-400">
                  <FileSpreadsheet className="w-4 h-4" />
                  Get Excel Template
                </Button>
              </div>

              {/* Upload Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center cursor-pointer ${isDragOver ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-300 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-700'}`}
              >
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isUploading}
                />
                <UploadCloud className="w-12 h-12 text-slate-400 mb-3" />
                {file ? (
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <p className="font-medium text-slate-700 dark:text-slate-300">Drag & drop your Excel report here, or click to browse</p>
                    <p className="text-xs text-slate-400">Only .xlsx and .xls formats are accepted</p>
                  </div>
                )}
              </div>

              {/* Success Result */}
              {successCount !== null && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="text-sm">
                    <strong>Success:</strong> Successfully ingested {successCount} attendance records to the database. Updated statuses are now live.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {file && (
                <div className="flex justify-end gap-3 pt-2">
                  <Button onClick={() => setFile(null)} variant="ghost" disabled={isUploading}>
                    Cancel
                  </Button>
                  <Button onClick={triggerUpload} disabled={isUploading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing File...
                      </>
                    ) : (
                      <>
                        Start Ingestion
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Validation Errors Panel */}
              {validationErrors.length > 0 && (
                <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Row-Level Schema Errors Detected ({validationErrors.length})
                  </div>
                  <div className="max-h-72 overflow-y-auto border border-rose-100 dark:border-rose-950/30 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 font-semibold border-b border-rose-100 dark:border-rose-950/30">
                          <th className="p-3 w-20">Row #</th>
                          <th className="p-3">Diagnostics & Validation Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-50 dark:divide-rose-950/10">
                        {validationErrors.map((err) => (
                          <tr key={err.row} className="hover:bg-rose-50/30 dark:hover:bg-rose-950/5">
                            <td className="p-3 font-semibold text-rose-700 dark:text-rose-400">{err.row}</td>
                            <td className="p-3 text-rose-600 dark:text-rose-300 space-y-1">
                              {err.errors.map((msg, index) => (
                                <div key={index}>• {msg}</div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
