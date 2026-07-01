'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { downloadPdf } from '@/lib/pdf'
import { AcademyLogo } from '@/components/AcademyLogo'
import { 
  Banknote, 
  Download, 
  Printer, 
  CheckCircle, 
  Calendar, 
  User, 
  DollarSign, 
  FileText,
  Clock, 
  Plus, 
  Inbox, 
  Loader2,
  Lock
} from 'lucide-react'
import { AccessDenied } from '@/components/AccessDenied'

interface SalarySlip {
  id: string
  employeeId: string
  employeeName: string
  employeeRole: string
  month: string
  basicSalary: number | string
  overtimeAmount: number | string
  totalAdditions: number | string
  lunchDues: number | string
  totalDeductions: number | string
  netSalary: number | string
  status: 'PENDING' | 'ISSUED' | 'PAID' | 'CANCELLED'
  notes: string | null
  createdAt: string
}

interface StaffMember {
  id: string
  name: string
  role: string
  designation: string
  salary: number
}

export default function SalariesPage() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role ?? ''
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
  const preparedBy = session?.user?.name ?? 'Account Manager'

  const getAllowanceAmount = (slip: SalarySlip) => {
    const basic = Number(slip.basicSalary) || 0
    const totalAdditions = Number(slip.totalAdditions) || 0
    const overtime = Number(slip.overtimeAmount) || 0
    return Math.max(totalAdditions - basic, overtime, 0)
  }

  const getDeductionAmount = (slip: SalarySlip) => {
    const totalDeductions = Number(slip.totalDeductions)
    if (Number.isFinite(totalDeductions)) return totalDeductions
    return Number(slip.lunchDues) || 0
  }

  // Print Ref
  const printContainerRef = useRef<HTMLDivElement>(null)

  // Selection state
  const [selectedSlip, setSelectedSlip] = useState<SalarySlip | null>(null)
  
  // Slip Form State
  const [employeeId, setEmployeeId] = useState('')
  const [month, setMonth] = useState('June 2026')
  const [basicSalary, setBasicSalary] = useState('')
  const [allowances, setAllowances] = useState('0')
  const [deductions, setDeductions] = useState('0')
  const [notes, setNotes] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // Query Slips
  const { data: slipsData, isLoading } = useQuery({
    queryKey: ['salaries'],
    queryFn: () => fetchPaginatedApi<SalarySlip>('/api/salaries?limit=100'),
    enabled: !!session,
  })

  const slips = slipsData?.data ?? []

  // Query Active Staff (Admins only)
  const { data: staffData } = useQuery({
    queryKey: ['staff-list'],
    queryFn: () => fetchApi<StaffMember[]>('/api/salaries?getStaff=true'),
    enabled: !!session && isAdmin,
  })

  const staff = staffData ?? []

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => fetchApi('/api/salaries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salaries'] })
      notify.success('Salary Slip Generated', {
        description: 'Slip has been compiled and saved into the payroll registries.',
      })
      setEmployeeId('')
      setBasicSalary('')
      setAllowances('0')
      setDeductions('0')
      setNotes('')
    },
    onError: (err: any) => {
      notify.error('Failed to generate payroll', { description: err.message })
    }
  })

  // Handle Employee Change -> Autofill Basic Salary!
  const handleEmployeeChange = (empId: string) => {
    setEmployeeId(empId)
    const selectedEmp = staff.find(s => s.id === empId)
    if (selectedEmp) {
      setBasicSalary(selectedEmp.salary.toString())
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId || !month || !basicSalary) {
      notify.error('Incomplete Fields', { description: 'Select an employee, specify payroll month, and provide basic salary.' })
      return
    }

    setIsGenerating(true)
    try {
      await createMutation.mutateAsync({
        employeeId,
        month,
        basicSalary: Number(basicSalary),
        allowances: Number(allowances),
        deductions: Number(deductions),
        notes
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!printContainerRef.current || !selectedSlip) {
      notify.error('No slip selected or preview missing.')
      return
    }

    setIsDownloading(true)
    try {
      // Short delay for rendering safety
      await new Promise(resolve => setTimeout(resolve, 600))
      
      const fileBaseName = `${selectedSlip.employeeName.replace(/\s+/g, '_')}_Salary_Slip_${selectedSlip.month.replace(/\s+/g, '_')}`

      await downloadPdf({
        element: printContainerRef.current,
        filename: fileBaseName,
        orientation: 'portrait',
        scale: 3,
        format: 'a4'
      })

      notify.success('PDF Download Complete', {
        description: 'Official verified salary slip PDF saved to your device.',
      })
    } catch (err) {
      console.error(err)
      notify.error('PDF Engine failed to save download.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (status === 'loading') return null

  // Route guard: TEACHER, STUDENT, PARENT cannot access the global payroll ledger
  // Teachers have a dedicated HR portal at /dashboard/teacher/hr
  if (!['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(userRole)) {
    return (
      <AccessDenied
        title="Payroll Access Restricted"
        message="The payroll ledger is restricted to administrators and accountants. Teachers can view their own salary slips from the HR &amp; Salary section in the Teacher Portal."
      />
    )
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.06),transparent)]" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold mb-4">
            <Banknote className="w-3.5 h-3.5" />
            Financial Payroll Desk
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Staff Salaries & Slips
          </h1>
          <p className="mt-2 text-blue-100 max-w-2xl text-sm leading-relaxed">
            Generate detailed salary certificates, manage monthly disbursements, and print high-fidelity corporate statements for teachers and account managers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Admin Form or Visual Interactive PDF Slip */}
        <div className="lg:col-span-6 space-y-6">
          {selectedSlip ? (
            /* Printable PDF Preview Voucher */
            <Card className="border border-slate-200 shadow-lg bg-white overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800">
                    Salary Voucher Preview
                  </CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    High contrast official corporate print format.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    disabled={isDownloading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 text-xs shadow-sm h-8"
                    onClick={handleDownloadPdf}
                  >
                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Download PDF
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-slate-350 hover:bg-slate-100 text-slate-700 font-bold h-8 text-xs"
                    onClick={() => setSelectedSlip(null)}
                  >
                    Close Preview
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 bg-slate-100/40">
                {/* Print Ready Viewport Container */}
                <div className="w-full overflow-x-auto pb-4">
                  <div 
                    ref={printContainerRef}
                    className="bg-white p-8 rounded-none border-[3px] border-slate-800 shadow-sm relative overflow-hidden font-serif max-w-[620px] mx-auto text-slate-900"
                    style={{ minHeight: '680px', minWidth: '580px' }}
                  >
                  {/* Subtle watermarked background */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                    <AcademyLogo className="w-[300px] h-[300px]" />
                  </div>

                  {/* Dual Border Framework */}
                  <div className="border border-slate-700 p-6 h-full space-y-6 relative z-10">
                    {/* Header Grid */}
                    <div className="flex justify-between items-center pb-4 border-b-[2px] border-slate-800">
                      <div className="flex items-center gap-3">
                        <AcademyLogo className="w-14 h-14 shrink-0 text-blue-900" />
                        <div>
                          <h2 className="text-xl font-bold tracking-tight text-slate-950 uppercase">
                            EverShine Academy
                          </h2>
                          <p className="text-[9px] font-sans tracking-widest text-slate-500 font-bold uppercase mt-0.5">
                            Excellence in Education · Payroll Ledger
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1 rounded bg-slate-900 text-white text-[10px] font-sans font-bold tracking-wider uppercase">
                          Official Voucher
                        </span>
                        <p className="text-[10px] text-slate-500 font-sans mt-1">
                          Voucher: #SAL-{selectedSlip.id.substring(3, 9).toUpperCase()}
                        </p>
                      </div>
                    </div>

                    {/* Metadata Subledger */}
                    <div className="grid grid-cols-2 gap-4 text-xs font-sans border-b border-slate-200 pb-4">
                      <div className="space-y-1">
                        <p className="text-slate-500">Employee Details:</p>
                        <p className="font-bold text-slate-900 text-sm">
                          {selectedSlip.employeeName}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Role: <span className="font-semibold">{selectedSlip.employeeRole}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Disbursed: <span className="font-semibold">{selectedSlip.month}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Prepared by: <span className="font-semibold">{preparedBy}</span>
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-slate-500">Academy Registrar Details:</p>
                        <p className="font-bold text-slate-800">
                          Main Branch Campus
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Date Issued: {new Date(selectedSlip.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-emerald-700 font-bold uppercase flex items-center justify-end gap-1 mt-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Disbursement {selectedSlip.status}
                        </p>
                      </div>
                    </div>

                    {/* Tabular Salary Calculation */}
                    <table className="w-full text-xs font-sans text-left border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase text-[9px] tracking-wider font-bold">
                          <th className="p-2 border border-slate-700">Account Head Description</th>
                          <th className="p-2 border border-slate-700 text-right">Amount (PKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="p-2 border border-slate-300 font-medium">Basic Monthly Salary</td>
                          <td className="p-2 border border-slate-300 text-right font-bold">
                            {Number(selectedSlip.basicSalary).toLocaleString()} /-
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 border border-slate-300 font-medium text-emerald-700">Allowances (Bonuses, Medical, Conveyance)</td>
                          <td className="p-2 border border-slate-300 text-right font-bold text-emerald-700">
                            + {getAllowanceAmount(selectedSlip).toLocaleString()} /-
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 border border-slate-300 font-medium text-rose-700">Deductions (Tax, Unexcused Leaves, Fund)</td>
                          <td className="p-2 border border-slate-300 text-right font-bold text-rose-700">
                            - {getDeductionAmount(selectedSlip).toLocaleString()} /-
                          </td>
                        </tr>
                        <tr className="bg-slate-100 font-bold border-t-[2px] border-slate-800 text-[13px]">
                          <td className="p-2 border border-slate-300 uppercase tracking-tight text-slate-900 font-extrabold">
                            Net Disbursed Take-home Salary
                          </td>
                          <td className="p-2 border border-slate-300 text-right text-slate-950 font-extrabold underline decoration-double">
                            Rs. {Number(selectedSlip.netSalary).toLocaleString()} /-
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Notes Section */}
                    {selectedSlip.notes && (
                      <div className="font-sans text-[11px] bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed">
                        <strong className="text-slate-700">Audit Ledger Note:</strong> "{selectedSlip.notes}"
                      </div>
                    )}

                    {/* Signature Block */}
                    <div className="grid grid-cols-2 gap-8 pt-8 font-sans text-xs">
                      <div>
                        <div className="border-t border-slate-400 pt-1 text-slate-500 mt-6 text-center">
                          Employee Acknowledgment Signature
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-serif italic text-sm text-slate-800 mr-8 select-none">
                          EverShine Payroll Dep.
                        </p>
                        <div className="border-t border-slate-400 pt-1 text-slate-500 text-center">
                          Authorized Officer Stamp & Signature
                        </div>
                      </div>
                    </div>

                    {/* Verification Footer Disclaimer */}
                    <div className="pt-4 border-t border-slate-200 text-center font-sans text-[8px] text-slate-450 leading-relaxed">
                      This is a digitally generated, audited payroll disbursement ledger statement representing monthly salary credits. Securely issued under the EverShine LMS Registrar and Finance Act compliance rules.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            </Card>
          ) : isAdmin ? (
            /* Admin Panel: Generate Slip */
            <Card className="border border-slate-200/80 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-slate-850 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Generate Salary Slip
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Select a registered staff member, customize allowances or deductions, and issue a secured salary voucher record.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGenerate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Select Staff Employee
                    </label>
                    <Select 
                      value={employeeId} 
                      onValueChange={handleEmployeeChange}
                    >
                      <SelectTrigger className="border-slate-300/80 bg-white">
                        <SelectValue placeholder="Select teacher or accountant..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.designation || s.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Billing Month / Year
                      </label>
                      <Input
                        placeholder="e.g. June 2026"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="border-slate-300/80 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Basic Salary (PKR)
                      </label>
                      <Input
                        type="number"
                        placeholder="Autofilled"
                        value={basicSalary}
                        onChange={(e) => setBasicSalary(e.target.value)}
                        className="border-slate-300/80 bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Allowances (PKR)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 5000"
                        value={allowances}
                        onChange={(e) => setAllowances(e.target.value)}
                        className="border-slate-300/80 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Deductions (PKR)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 1500"
                        value={deductions}
                        onChange={(e) => setDeductions(e.target.value)}
                        className="border-slate-300/80 bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Audit Remarks / Notes (Internal)
                    </label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Specify optional bonuses or deductions reason..."
                      className="w-full text-sm rounded-lg border border-slate-300/80 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isGenerating}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 shadow-md flex items-center justify-center gap-2 rounded-lg"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <>
                        Compile & Generate Slip
                        <Plus className="w-4.5 h-4.5" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
              <div className="flex flex-col items-center text-center space-y-2 py-10">
                <FileText className="w-12 h-12 text-slate-400" />
                <h3 className="font-bold text-slate-800 text-base">Select a Salary Slip</h3>
                <p className="text-xs text-slate-500">
                  Select a processed billing month slip from your history ledger on the right to view, verify, and download your high-fidelity official printable PDF salary slip.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: List of slips */}
        <div className="lg:col-span-6">
          <Card className="border border-slate-200/80 shadow-md">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-indigo-600" />
                Disbursement Logs
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                History of generated salary credits and payments.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <p className="text-sm">Loading logs...</p>
                </div>
              ) : slips.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Inbox className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">No salary records found</p>
                  <p className="text-xs">There are no monthly salary disburals posted in this record.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {slips.map((s) => {
                    const isSelected = selectedSlip?.id === s.id

                    return (
                      <div 
                        key={s.id} 
                        className={`p-4 hover:bg-slate-50/50 transition-all flex items-center justify-between gap-4 cursor-pointer ${
                          isSelected ? 'bg-indigo-50/40 border-l-[3px] border-indigo-600' : ''
                        }`}
                        onClick={() => setSelectedSlip(s)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">
                              {s.month}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                              {s.employeeName}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Disbursed: {new Date(s.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-900">
                              Rs. {Number(s.netSalary).toLocaleString()}
                            </p>
                            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full uppercase">
                              {s.status}
                            </span>
                          </div>
                          
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-slate-450 hover:text-indigo-600 hover:bg-indigo-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSlip(s)
                            }}
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
