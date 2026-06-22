'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/api-client'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { notify } from '@/lib/notify'
import {
  Loader2, Save, Trophy, Award, TrendingUp, Info, UserCheck, Calendar, Download, FileText, Image as ImageIcon, CheckCircle, Share2, FileSpreadsheet
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { html2canvasSafe } from '@/lib/html2canvas-safe'
import { jsPDF } from 'jspdf'
import { downloadMonitoringExcel } from '@/lib/excel/monitoring-report'

interface AcademicYear {
  id: string
  name: string
  isActive: boolean
}

interface ClassSection {
  id: string
  className: string
  sectionName: string
}

interface StudentRow {
  serial: number
  studentId: string
  name: string
  fatherName: string | null
  rollNumber: string
  subjectScores: Record<string, number>
  totalMarks: number
  obtainedMarks: number
  percentage: number
  performanceBatch: string
  rank: number
}

interface Subject {
  id: string
  name: string
  code: string
}

interface ReportData {
  month?: number
  year?: number
  date?: string
  type: 'daily' | 'monthly'
  classSectionId: string
  subjects: Subject[]
  students: StudentRow[]
  statusCriteria: Array<{ label: string; min: number; max: number }>
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

export default function MonthlyMonitoringPage() {
  const { data: session } = useSession()
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('monthly')
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  
  // Monthly filter states
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString())
  const [selectedYearValue, setSelectedYearValue] = useState<string>(new Date().getFullYear().toString())
  
  // Daily filter state
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString('en-CA')
  )

  // Years list
  const { data: years = [] } = useQuery<AcademicYear[]>({
    queryKey: ['academic-years'],
    queryFn: () => fetchApi<AcademicYear[]>('/api/academic-years'),
  })

  // Set default active year
  const activeYear = years.find((y) => y.isActive)
  if (activeYear && !selectedYearId) {
    setSelectedYearId(activeYear.id)
  }

  // Class sections list
  const { data: sections = [] } = useQuery<ClassSection[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<ClassSection[]>('/api/teacher-portal/sections'),
  })

  const yearNum = parseInt(selectedYearValue)
  const monthNum = parseInt(selectedMonth) + 1

  // Fetch report data
  const { data: report, isLoading, refetch } = useQuery<ReportData>({
    queryKey: ['monthly-monitoring-data', reportType, selectedSectionId, monthNum, yearNum, selectedDate, selectedYearId],
    queryFn: () => {
      const baseUrl = `/api/teacher-portal/monthly-monitoring?classSectionId=${selectedSectionId}&academicYearId=${selectedYearId}&type=${reportType}`
      const url = reportType === 'daily'
        ? `${baseUrl}&date=${selectedDate}`
        : `${baseUrl}&month=${monthNum}&year=${yearNum}`
      return fetchApi<ReportData>(url)
    },
    enabled: !!selectedSectionId && !!selectedYearId && (
      reportType === 'daily' ? !!selectedDate : (!isNaN(monthNum) && !isNaN(yearNum))
    ),
  })

  // Save report snapshot (only applicable for monthly snapshots)
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      fetchApi('/api/teacher-portal/monthly-monitoring', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      notify.success('Monthly monitoring snapshot saved successfully')
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to save snapshot')
    },
  })

  const handleSaveSnapshot = () => {
    if (!report || reportType !== 'monthly') return
    saveMutation.mutate({
      classSectionId: selectedSectionId,
      month: monthNum,
      year: yearNum,
      academicYearId: selectedYearId,
      reportData: report,
    })
  }

  // HTML to PDF or Image Export Utility
  // WHY retry: html2canvas at scale 2.5 can exceed browser canvas size limits
  // (commonly 4096×4096 on mobile). Retrying at scale 1.5 is a safe fallback.
  // WHY overflow manipulation: The report container uses overflow:hidden for
  // UI clipping, but html2canvas needs the full content visible to capture it.
  const handleExport = async (format: 'pdf' | 'png') => {
    const element = document.getElementById('monitoring-report-view')
    if (!element) return

    const loader = notify.loading(`Preparing ${format.toUpperCase()} export...`)
    const isLargeClass = students.length > 50

    try {
      // Save and override overflow so html2canvas can see the full content
      const originalOverflow = element.style.overflow
      const originalMaxHeight = element.style.maxHeight
      element.style.overflow = 'visible'
      element.style.maxHeight = 'none'

      // Add export rendering class + compact mode for large classes
      element.classList.add('export-rendering')
      if (isLargeClass) element.classList.add('export-rendering-compact')

      // Wait for layout recalculation + image loading (logo)
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 300)))

      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvasSafe(element, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: -window.scrollY,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        })
      } catch {
        // Retry at reduced scale on canvas size limit failure
        canvas = await html2canvasSafe(element, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: -window.scrollY,
        })
      }

      // Restore original styles
      element.classList.remove('export-rendering')
      if (isLargeClass) element.classList.remove('export-rendering-compact')
      element.style.overflow = originalOverflow
      element.style.maxHeight = originalMaxHeight

      const imgData = canvas.toDataURL('image/png')
      const timestamp = new Date().toISOString().split('T')[0]
      const sectionName = sections.find((s) => s.id === selectedSectionId)?.className?.replace(/\s+/g, '_') || 'section'
      const filename = `Evershine_${reportType}_report_${sectionName}_${timestamp}`

      if (format === 'png') {
        const link = document.createElement('a')
        link.download = `${filename}.png`
        link.href = imgData
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        // WHY landscape for wide tables: Monitoring reports have many subject
        // columns. Landscape A4 prevents column truncation.
        const isWide = (report?.subjects?.length ?? 0) > 4
        const pdf = new jsPDF({
          orientation: isWide ? 'l' : 'p',
          unit: 'mm',
          format: 'a4',
        })
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = pdf.internal.pageSize.getHeight()
        const margin = 5
        const imgWidth = pdfWidth - (margin * 2)
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        const pageContentHeight = pdfHeight - (margin * 2)

        // First page
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight)
        let heightLeft = imgHeight - pageContentHeight

        // Subsequent pages: shift the image upward to show the next slice
        while (heightLeft > 0) {
          const yOffset = -(imgHeight - heightLeft) + margin
          pdf.addPage()
          pdf.addImage(imgData, 'PNG', margin, yOffset, imgWidth, imgHeight)
          heightLeft -= pageContentHeight
        }
        pdf.save(`${filename}.pdf`)
      }

      notify.dismiss(loader)
      notify.success(`${format.toUpperCase()} exported successfully`)
    } catch (err: any) {
      console.error('[EXPORT_ERROR]', err)
      element.classList.remove('export-rendering')
      element.classList.remove('export-rendering-compact')
      element.style.overflow = ''
      element.style.maxHeight = ''
      notify.dismiss(loader)
      notify.error(`Export failed: ${err?.message || 'Unknown error. Try a different browser or reduce the report size.'}`)
    }
  }

  // WHY: Web Share API with files enables direct WhatsApp image sharing on
  // mobile devices without requiring the teacher to manually download → open
  // WhatsApp → attach. On desktop browsers that lack file sharing support,
  // we fall back to downloading the PNG and opening WhatsApp Web.
  const handleWhatsAppShare = async () => {
    const element = document.getElementById('monitoring-report-view')
    if (!element) return

    // TRADEOFF: Web Share API with files requires a secure context (HTTPS or
    // localhost). On plain HTTP (common in dev/LAN deployments), we skip
    // navigator.share entirely and fall back to download + WhatsApp Web link.
    const isSecureContext = typeof window !== 'undefined' && (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost')

    const loader = notify.loading('Preparing report for WhatsApp...')

    try {
      const isLargeClass = students.length > 50

      // Save and override overflow so html2canvas can see the full content
      const originalOverflow = element.style.overflow
      const originalMaxHeight = element.style.maxHeight
      element.style.overflow = 'visible'
      element.style.maxHeight = 'none'

      element.classList.add('export-rendering')
      if (isLargeClass) element.classList.add('export-rendering-compact')

      // Wait for layout recalculation + image loading (logo)
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 300)))

      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvasSafe(element, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: -window.scrollY,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        })
      } catch {
        canvas = await html2canvasSafe(element, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: -window.scrollY,
        })
      }

      // Restore original styles
      element.classList.remove('export-rendering')
      if (isLargeClass) element.classList.remove('export-rendering-compact')
      element.style.overflow = originalOverflow
      element.style.maxHeight = originalMaxHeight

      const sectionLabel = selectedSection
        ? `${selectedSection.className}-${selectedSection.sectionName}`
        : 'report'
      const dateLabel = reportType === 'daily'
        ? selectedDate
        : `${MONTHS[monthNum - 1]?.label ?? ''}_${yearNum}`
      const filename = `Evershine_${reportType}_${sectionLabel}_${dateLabel}.png`
      const caption = `📊 *EVERSHINE ACADEMY* — ${reportType === 'daily' ? 'Daily' : 'Monthly'} Performance Report\n🏫 ${sectionLabel}\n📅 ${dateLabel}`

      // Convert canvas to Blob for Web Share API
      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png', 1.0)
      )
      const file = new File([blob], filename, { type: 'image/png' })

      // TRADEOFF: navigator.share with files is supported on Chrome Android 76+,
      // Safari iOS 15+, but NOT on desktop Chrome/Firefox. We feature-detect and
      // fall back gracefully. Also requires secure context.
      if (
        isSecureContext &&
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: 'Evershine Academy Report',
          text: caption,
          files: [file],
        })
        notify.dismiss(loader)
        notify.success('Report shared successfully')
      } else {
        // Desktop / HTTP fallback: download PNG + open WhatsApp Web with caption text
        const link = document.createElement('a')
        link.download = filename
        link.href = canvas.toDataURL('image/png')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        const whatsappText = encodeURIComponent(caption + '\n\n(Image downloaded — please attach it in this chat)')
        window.open(`https://web.whatsapp.com/send?text=${whatsappText}`, '_blank')

        notify.dismiss(loader)
        if (!isSecureContext) {
          notify.success('Image downloaded. WhatsApp file sharing requires HTTPS — please attach the downloaded image manually.')
        } else {
          notify.success('Image downloaded — attach it in WhatsApp Web')
        }
      }
    } catch (err: any) {
      console.error('[WHATSAPP_SHARE]', err)
      element?.classList.remove('export-rendering')
      element?.classList.remove('export-rendering-compact')
      if (element) {
        element.style.overflow = ''
        element.style.maxHeight = ''
      }
      notify.dismiss(loader)
      // User cancelling the share dialog throws AbortError — not a real failure
      if (err?.name !== 'AbortError') {
        notify.error('Failed to share report')
      }
    }
  }

  // Excel export handler
  const handleExcelExport = async () => {
    if (!report || !selectedSection) return

    const loader = notify.loading('Generating branded Excel report...')
    try {
      const dateLabel = reportType === 'daily'
        ? new Date(selectedDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        : `${MONTHS[monthNum - 1]?.label ?? ''} ${yearNum}`

      await downloadMonitoringExcel({
        type: reportType,
        classSectionLabel: `${selectedSection.className} - ${selectedSection.sectionName}`,
        dateLabel,
        academicYear: years.find((y) => y.id === selectedYearId)?.name || 'Current',
        teacherName: session?.user?.name || 'Assigned Instructor',
        subjects: report.subjects,
        students: report.students,
      })

      notify.dismiss(loader)
      notify.success('Excel report downloaded successfully')
    } catch (err: any) {
      console.error('[EXCEL_EXPORT]', err)
      notify.dismiss(loader)
      notify.error('Failed to generate Excel report')
    }
  }

  // Count groups
  const students = report?.students ?? []
  const everShineCount = students.filter((s) => s.performanceBatch === 'Ever Shine').length
  const quaidCount = students.filter((s) => s.performanceBatch === 'Quaid').length
  const iqbalCount = students.filter((s) => s.performanceBatch === 'Iqbal').length
  const improvementCount = students.filter((s) => s.performanceBatch === 'Improvement').length

  const getBatchBadgeColor = (batch: string) => {
    switch (batch) {
      case 'Ever Shine':
        return 'bg-amber-100 text-amber-900 border-amber-300'
      case 'Quaid':
        return 'bg-blue-100 text-blue-900 border-blue-300'
      case 'Iqbal':
        return 'bg-green-100 text-green-900 border-green-300'
      case 'Improvement':
        return 'bg-rose-100 text-rose-900 border-rose-300'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const selectedSection = sections.find((s) => s.id === selectedSectionId)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Academic Monitoring Portal</h1>
          <p className="text-sm text-gray-500">Generate and export performance reports for WhatsApp sharing.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Daily / Monthly Toggle */}
          <div className="bg-gray-100 p-1 rounded-lg flex border border-gray-200">
            <button
              onClick={() => {
                setReportType('monthly')
                refetch()
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                reportType === 'monthly'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly Sheet
            </button>
            <button
              onClick={() => {
                setReportType('daily')
                refetch()
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                reportType === 'daily'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Daily Sheet
            </button>
          </div>

          {report && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleWhatsAppShare}
                className="gap-1.5 text-xs bg-[#25D366] hover:bg-[#1da851] text-white font-semibold shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('png')}
                className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Save Image
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('pdf')}
                className="gap-1.5 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF Document
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExcelExport}
                className="gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel Sheet
              </Button>
              {reportType === 'monthly' && (
                <Button
                  size="sm"
                  onClick={handleSaveSnapshot}
                  disabled={saveMutation.isPending}
                  className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Snapshot
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Select Filters Card */}
      <Card className="print:hidden border-indigo-50 shadow-sm bg-white">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Academic Year</label>
              <Select value={selectedYearId} onValueChange={setSelectedYearId}>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name} {y.isActive ? '(Active)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Class Section</label>
              <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.className} - {s.sectionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {reportType === 'monthly' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600">Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="border-gray-200">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={(m.value - 1).toString()}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600">Calendar Year</label>
                  <Select value={selectedYearValue} onValueChange={setSelectedYearValue}>
                    <SelectTrigger className="border-gray-200">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <SelectItem key={y} value={y.toString()}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Daily Report Date</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full border-gray-200"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Roster & Grid Report View */}
      {!selectedSectionId ? (
        <Card className="p-8 text-center border-dashed border-gray-300">
          <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Please select an academic year and class section to load the sheet.</p>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 py-16 justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span>Generating reports and grouping students...</span>
        </div>
      ) : !report || students.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">No student scores found for this period/date.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Quick Overview Stats cards - Print Hidden */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
            <Card className="bg-amber-50/40 border-amber-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-800">Ever Shine Group</p>
                  <p className="text-2xl font-bold text-amber-900 mt-1">{everShineCount}</p>
                </div>
                <Trophy className="w-7 h-7 text-amber-500" />
              </CardContent>
            </Card>

            <Card className="bg-blue-50/40 border-blue-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-800">Quaid Group</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{quaidCount}</p>
                </div>
                <Award className="w-7 h-7 text-blue-500" />
              </CardContent>
            </Card>

            <Card className="bg-green-50/40 border-green-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-green-800">Iqbal Group</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">{iqbalCount}</p>
                </div>
                <UserCheck className="w-7 h-7 text-green-500" />
              </CardContent>
            </Card>

            <Card className="bg-rose-50/40 border-rose-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-rose-800">Improvement Group</p>
                  <p className="text-2xl font-bold text-rose-900 mt-1">{improvementCount}</p>
                </div>
                <TrendingUp className="w-7 h-7 text-rose-500" />
              </CardContent>
            </Card>
          </div>

          {/* BRANDED EXPORT WRAPPER */}
          <div
            id="monitoring-report-view"
            className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 max-w-full overflow-hidden print-layout"
          >
            {/* Branded Header block */}
            <div className="border-b-2 border-indigo-800 pb-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                {/* Academy crest logo — crossOrigin required for html2canvas CORS */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/bglogo.png"
                  alt="Evershine Academy Crest"
                  crossOrigin="anonymous"
                  className="w-16 h-16 object-contain flex-shrink-0"
                  onError={(e) => {
                    // Graceful fallback: hide if logo not deployed yet
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div>
                  <span className="text-2xl font-extrabold tracking-wider text-slate-900 font-serif">EVERSHINE ACADEMY</span>
                  <p className="text-[10px] text-indigo-600 italic tracking-wide">&quot;We Make your Children More Valueable&quot;</p>
                  <h2 className="text-lg font-bold text-indigo-800 mt-0.5 uppercase tracking-wide">
                    {reportType === 'daily' ? 'Daily Academic monitoring sheet' : 'Monthly Academic monitoring sheet'}
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-100 w-full md:w-auto">
                <div>
                  <span className="font-semibold text-slate-500">Class Section:</span>{' '}
                  <span className="font-bold text-slate-900">{selectedSection?.className} - {selectedSection?.sectionName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Report Date:</span>{' '}
                  <span className="font-bold text-slate-900">
                    {reportType === 'daily'
                      ? new Date(selectedDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                      : `${MONTHS[monthNum - 1].label} ${yearNum}`}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Teacher:</span>{' '}
                  <span className="font-bold text-slate-900">{session?.user?.name || 'Assigned Instructor'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Academic Year:</span>{' '}
                  <span className="font-bold text-slate-900">
                    {years.find((y) => y.id === selectedYearId)?.name || 'Current'}
                  </span>
                </div>
              </div>
            </div>

            {/* Combined Subject Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
              <Table className="min-w-full divide-y divide-slate-200">
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="w-[50px] text-center font-bold text-slate-800 border-r border-slate-200">S.No</TableHead>
                    <TableHead className="w-[100px] font-bold text-slate-800 border-r border-slate-200">Roll No</TableHead>
                    <TableHead className="font-bold text-slate-800 border-r border-slate-200">Student Name</TableHead>
                    <TableHead className="font-bold text-slate-800 border-r border-slate-200">Father&apos;s Name</TableHead>
                    {report.subjects.map((sub) => (
                      <TableHead key={sub.id} className="text-center font-bold text-slate-800 border-r border-slate-200 min-w-[70px]">
                        {sub.name}
                      </TableHead>
                    ))}
                    <TableHead className="text-center font-bold text-slate-800 border-r border-slate-200 w-[70px]">Total</TableHead>
                    <TableHead className="text-center font-bold text-slate-800 border-r border-slate-200 w-[80px]">Obt. Marks</TableHead>
                    <TableHead className="text-center font-bold text-slate-800 border-r border-slate-200 w-[70px]">Obt. %</TableHead>
                    <TableHead className="text-center font-bold text-slate-800 border-r border-slate-200 w-[140px]">Group/Batch</TableHead>
                    <TableHead className="text-center font-bold text-slate-800 w-[60px]">Rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {students.map((row) => (
                    <TableRow key={row.studentId} className="hover:bg-slate-50/50 border-b border-slate-200">
                      <TableCell className="text-center font-medium text-slate-900 border-r border-slate-150 bg-slate-50/20">{row.serial}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-950 font-bold border-r border-slate-150">{row.rollNumber}</TableCell>
                      <TableCell className="font-bold text-slate-900 border-r border-slate-150">{row.name}</TableCell>
                      <TableCell className="text-slate-600 border-r border-slate-150">{row.fatherName ?? '—'}</TableCell>
                      {report.subjects.map((sub) => (
                        <TableCell key={sub.id} className="text-center font-semibold text-slate-850 border-r border-slate-150">
                          {row.subjectScores[sub.id] ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-mono text-slate-500 border-r border-slate-150">{row.totalMarks}</TableCell>
                      <TableCell className="text-center font-bold text-indigo-900 border-r border-slate-150 bg-slate-50/10">{row.obtainedMarks}</TableCell>
                      <TableCell className="text-center font-extrabold text-slate-950 border-r border-slate-150">{row.percentage}%</TableCell>
                      <TableCell className="text-center border-r border-slate-150">
                        <Badge variant="outline" className={`font-bold px-2.5 py-0.5 rounded-full ${getBatchBadgeColor(row.performanceBatch)}`}>
                          {row.performanceBatch}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-extrabold">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                          row.rank === 1 ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                          row.rank === 2 ? 'bg-slate-200 text-slate-900 border border-slate-350' :
                          row.rank === 3 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'text-slate-600'
                        }`}>
                          {row.rank}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Academic Scale Guidelines & Signatures block */}
            <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Performance scale definition */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Performance Classification Scale</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="font-semibold text-slate-700">Ever Shine: 90% – 100%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="font-semibold text-slate-700">Quaid: 75% – 89%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="font-semibold text-slate-700">Iqbal: 50% – 74%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="font-semibold text-slate-700">Improvement: Below 50%</span>
                  </div>
                </div>
              </div>

              {/* Signature block */}
              <div className="flex flex-col justify-end space-y-8 pt-4">
                <div className="grid grid-cols-2 gap-8">
                  <div className="text-center">
                    <div className="border-b border-slate-400 w-full h-8" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 block">Class Teacher Signature</span>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-slate-400 w-full h-8" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 block">Principal Signature</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Note & System Signature Footer */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                This report is electronically generated and verified by Evershine LMS.
              </span>
              <span className="font-mono">Page 1 of 1</span>
            </div>
          </div>
        </div>
      )}

      {/* Styled JSX for rendering adjustments during image/PDF exports */}
      <style jsx global>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
        }
        .export-rendering {
          width: 1024px !important;
          min-width: 1024px !important;
          padding: 2.5rem !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        .export-rendering .md\\:flex-row {
          flex-direction: row !important;
        }
        .export-rendering .md\\:w-auto {
          width: auto !important;
        }
        .export-rendering .md\\:grid-cols-2 {
          grid-template-cols: repeat(2, minmax(0, 1fr)) !important;
        }
        /* Compact mode for classes with 50+ students */
        .export-rendering-compact table {
          font-size: 8px !important;
        }
        .export-rendering-compact th,
        .export-rendering-compact td {
          padding: 2px 4px !important;
          line-height: 1.2 !important;
        }
        .export-rendering-compact tr {
          height: 18px !important;
        }
        .export-rendering-compact .text-2xl {
          font-size: 1.25rem !important;
        }
        .export-rendering-compact .text-lg {
          font-size: 0.875rem !important;
        }
      `}</style>
    </div>
  )
}
