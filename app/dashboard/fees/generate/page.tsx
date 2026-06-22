'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { notify } from '@/lib/notify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Plus, Trash2, Search, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'

interface FeeItem {
  description: string
  amount: number
}

interface StudentSearchResult {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  campus: { name: string }
  batch: { name: string }
  class?: { name: string }
  feeStatus: string
  dueAmount: number
}

// WHY amounts are 0: Fee structures are set by the Super Admin.
// Presets are convenience labels for quick-add — the admin enters the actual amount.
const PRESET_FEE_ITEMS = [
  { label: 'Tuition Fee', amount: 0 },
  { label: 'Computer Lab', amount: 0 },
  { label: 'Sports Fee', amount: 0 },
  { label: 'Library Fee', amount: 0 },
  { label: 'Transport Fee', amount: 0 },
  { label: 'Examination Fee', amount: 0 },
  { label: 'Maintenance Fee', amount: 0 },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface BankAccountItem {
  bank: string
  number: string
}

export function parseBankAccounts(str: string) {
  const accounts: BankAccountItem[] = []
  let accountTitle = ''
  
  if (!str) return { accountTitle, accounts }
  
  const parts = str.split(/[;\n]/)
  for (let part of parts) {
    part = part.trim()
    if (!part) continue
    
    const lower = part.toLowerCase()
    if (lower.includes('title:') || lower.includes('name:') || lower.includes('account title') || lower.includes('account name')) {
      const idx = part.indexOf(':')
      if (idx !== -1) {
        accountTitle = part.substring(idx + 1).trim()
      } else {
        accountTitle = part.replace(/account title/i, '').replace(/account name/i, '').replace(/:/g, '').trim()
      }
    } else {
      const idx = part.indexOf(':')
      if (idx !== -1) {
        const bank = part.substring(0, idx).trim()
        const number = part.substring(idx + 1).trim()
        accounts.push({ bank, number })
      } else {
        accounts.push({ bank: 'Bank/Account', number: part })
      }
    }
  }
  
  return { accountTitle, accounts }
}

export const renderBankAccountsTable = (bankAccountsStr: string) => {
  const { accountTitle, accounts } = parseBankAccounts(bankAccountsStr)
  if (accounts.length === 0 && !accountTitle) {
    return <p className="text-[10px] text-gray-500 italic">Please deposit cash at the Accounts Office.</p>
  }

  return (
    <div className="space-y-1.5 w-full">
      {accountTitle && (
        <div className="flex justify-between items-center bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[9px] font-bold text-blue-900 uppercase">
          <span>Account Title:</span>
          <span>{accountTitle}</span>
        </div>
      )}
      {accounts.length > 0 && (
        <table className="w-full text-left text-[9px] border-collapse border border-gray-200 rounded overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
              <th className="px-2 py-0.5 border-r border-gray-200 uppercase">Bank Name</th>
              <th className="px-2 py-0.5 uppercase">Account Number</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc, index) => (
              <tr key={index} className="border-b border-gray-200 bg-white hover:bg-gray-50/30">
                <td className="px-2 py-0.5 font-bold text-gray-700 border-r border-gray-200">{acc.bank}</td>
                <td className="px-2 py-0.5 font-mono font-bold text-blue-900">{acc.number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function GenerateChallanPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null)
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()])
  const [academicYear, setAcademicYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`)
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 10)
    return d.toISOString().split('T')[0]
  })
  const [items, setItems] = useState<FeeItem[]>([{ description: 'Tuition Fee', amount: 0 }])
  const [discount, setDiscount] = useState(0)
  const [lateFee, setLateFee] = useState(0)
  const [bankAccounts, setBankAccounts] = useState('Allied Bank: 123456789; Bank Al-Habib: 987654321')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Student search
  const { data: searchData } = useQuery({
    queryKey: ['student-search', studentSearch],
    queryFn: () => fetchPaginatedApi<StudentSearchResult>(`/api/students?search=${studentSearch}&limit=10`),
    enabled: studentSearch.length >= 2 && !selectedStudent,
    staleTime: 10_000,
  })
  const searchResults = searchData?.data ?? []

  const addItem = () => setItems((prev) => [...prev, { description: '', amount: 0 }])
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: 'description' | 'amount', value: string | number) => {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  const addPreset = (preset: { label: string; amount: number }) => {
    setItems((prev) => [...prev, { description: preset.label, amount: preset.amount }])
  }

  const subtotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const admissionFee = items.reduce((sum, item) => /admission fee/i.test(item.description) ? sum + Number(item.amount) : sum, 0)
  const courseFee = items.reduce((sum, item) => /course(?:s)? fee/i.test(item.description) ? sum + Number(item.amount) : sum, 0)
  const totalAcademicFee = admissionFee + courseFee
  const total = subtotal - discount + lateFee

  const handleSubmit = async () => {
    if (!selectedStudent) { notify.error('Please select a student'); return }
    if (items.length === 0) { notify.error('Add at least one fee item'); return }
    if (items.some((i) => !i.description || i.amount <= 0)) {
      notify.error('All fee items must have a description and amount > 0')
      return
    }

    setIsSubmitting(true)
    try {
      await fetchApi('/api/fees', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          month: `${month} ${academicYear.split('-')[0]}`,
          academicYear,
          dueDate,
          bankAccounts: bankAccounts || undefined,
          items,
          discount,
          lateFee,
          notes: notes || undefined,
        }),
      })
      notify.success('Challan generated successfully!')
      queryClient.invalidateQueries({ queryKey: ['fees'] })
      router.push('/dashboard/fees')
    } catch (err: any) {
      notify.error('Failed to generate challan', { description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/fees">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Generate Fee Challan</h1>
          <p className="text-sm text-gray-500">Create a new fee invoice for a student.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Student + dates */}
        <div className="lg:col-span-2 space-y-5">
          {/* Student selector */}
          <Card>
            <CardHeader><CardTitle className="text-base">Select Student</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selectedStudent ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder="Type name or registration number..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="border rounded-lg divide-y overflow-hidden">
                      {searchResults.map((s) => (
                        <button
                          key={s.id}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                          onClick={() => { setSelectedStudent(s); setStudentSearch('') }}
                        >
                          <p className="font-medium text-sm">{s.firstName} {s.lastName}</p>
                          <p className="text-xs text-gray-500">{s.registrationNumber} · {s.campus.name} · {s.class?.name ?? 'No class'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {studentSearch.length >= 2 && searchResults.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-3">No students found</p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-blue-900">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                      <p className="text-xs text-blue-600">{selectedStudent.registrationNumber} · {selectedStudent.campus.name}</p>
                      {selectedStudent.dueAmount > 0 && (
                        <p className="text-xs text-red-600 mt-0.5">Previous due: Rs {Number(selectedStudent.dueAmount).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)} className="text-xs text-gray-500">
                    Change
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Challan period */}
          <Card>
            <CardHeader><CardTitle className="text-base">Challan Period</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025-2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="col-span-1 sm:col-span-3 space-y-1.5">
                <Label>Deposit Bank Accounts</Label>
                <Textarea 
                  value={bankAccounts} 
                  onChange={(e) => setBankAccounts(e.target.value)} 
                  placeholder="Enter bank accounts separated by semicolons (e.g. Allied Bank: 1234; HBL: 5678)"
                  className="min-h-[60px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Fee items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Fee Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset quick-add */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-400 self-center mr-1">Quick add:</span>
                {PRESET_FEE_ITEMS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => addPreset(p)}
                    className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-md transition-colors border border-gray-200"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={item.amount || ''}
                        onChange={(e) => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                        className="h-9 text-sm"
                        min={0}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount (Rs)</Label>
                  <Input type="number" min={0} value={discount || ''} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Late Fee (Rs)</Label>
                  <Input type="number" min={0} value={lateFee || ''} onChange={(e) => setLateFee(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..." className="h-8 text-sm" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview / Summary */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="bg-blue-800 text-white rounded-t-xl">
              <CardTitle className="text-sm text-center uppercase tracking-widest text-blue-100">Challan Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {selectedStudent ? (
                <div className="text-sm">
                  <p className="font-bold">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="text-xs text-gray-500">{selectedStudent.registrationNumber}</p>
                  <p className="text-xs text-gray-500">{selectedStudent.campus.name} · {selectedStudent.class?.name ?? '—'}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center">Select a student</p>
              )}

              <div className="border-t pt-3 text-xs">
                <div className="flex justify-between text-gray-500 mb-1">
                  <span>Period:</span>
                  <span className="font-medium text-gray-900">{month} {academicYear.split('-')[0]}</span>
                </div>
                <div className="flex justify-between text-gray-500 mb-1">
                  <span>Due:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(dueDate + 'T00:00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="border-t pt-3 space-y-1.5 text-xs">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-gray-700">
                    <span className="truncate pr-2">{item.description || '—'}</span>
                    <span className="font-medium flex-shrink-0">Rs {Number(item.amount).toLocaleString()}</span>
                  </div>
                ))}
                {(admissionFee > 0 || courseFee > 0) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[10px] text-slate-700">
                    <div className="font-semibold uppercase tracking-[0.08em] text-slate-800 mb-2">Academic Fee Breakdown</div>
                    {admissionFee > 0 && (
                      <div className="flex justify-between">
                        <span>Admission Fee</span>
                        <span className="font-mono">Rs {admissionFee.toLocaleString()}</span>
                      </div>
                    )}
                    {courseFee > 0 && (
                      <div className="flex justify-between">
                        <span>Course Fee</span>
                        <span className="font-mono">Rs {courseFee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-2 mt-2 font-semibold text-slate-900">
                      <span>Total Academic Fee</span>
                      <span className="font-mono">Rs {totalAcademicFee.toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount</span>
                    <span>— Rs {discount.toLocaleString()}</span>
                  </div>
                )}
                {lateFee > 0 && (
                  <div className="flex justify-between text-red-700">
                    <span>Late Fee</span>
                    <span>+ Rs {lateFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-gray-900 border-t pt-2 mt-1">
                  <span>Total</span>
                  <span>Rs {total.toLocaleString()}</span>
                </div>
              </div>

              <div className="border-t pt-3 space-y-1.5">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Deposit Details Preview:</p>
                {renderBankAccountsTable(bankAccounts)}
              </div>

              <Button
                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-lg shadow-sm border-transparent transition-colors flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                disabled={!selectedStudent || items.length === 0 || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? 'Generating...' : 'Generate Challan'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
