'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AccessDenied } from '@/components/AccessDenied'
import Modal from '@/components/Modal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { notify } from '@/lib/notify'
import { Download, Edit3, Trash2, TrendingUp } from 'lucide-react'

interface ExpenseRecord {
  id: string
  title: string
  description?: string | null
  amount: string | number
  category: string
  date: string
  paymentSource?: string | null
  paymentReference?: string | null
  isApproved: boolean
  notes?: string | null
  accountant?: { firstName?: string; lastName?: string }
}

const EXPENSE_CATEGORIES = [
  'UTILITIES',
  'SALARIES',
  'MAINTENANCE',
  'STATIONERY',
  'EQUIPMENT',
  'TRANSPORT',
  'EVENTS',
  'MISCELLANEOUS',
]

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Petty Cash', 'Online']

export default function AccountantExpensesPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as string) || ''
  const canAccess = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role)

  const queryClient = useQueryClient()
  const userCampusId = (session?.user as any)?.campusId
  const isGlobalAccountant = !userCampusId && canAccess

  const { data: campusData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchPaginatedApi<{id: string, name: string}>('/api/campuses?limit=100'),
    enabled: isGlobalAccountant,
  })
  const campuses = campusData?.data ?? []

  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    category: 'UTILITIES',
    date: new Date().toISOString().split('T')[0],
    paymentSource: '',
    paymentReference: '',
    notes: '',
    campusId: '',
  })
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    amount: '',
    category: 'UTILITIES',
    date: new Date().toISOString().split('T')[0],
    paymentSource: '',
    paymentReference: '',
    notes: '',
  })
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterCampusId, setFilterCampusId] = useState('ALL')

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: '20' })
    if (categoryFilter && categoryFilter !== 'ALL') params.set('category', categoryFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    if (filterCampusId && filterCampusId !== 'ALL') params.set('campusId', filterCampusId)
    return params.toString()
  }, [categoryFilter, startDate, endDate, filterCampusId])

  const exportQueryString = useMemo(() => {
    const params = new URLSearchParams()
    if (categoryFilter && categoryFilter !== 'ALL') params.set('category', categoryFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    if (filterCampusId && filterCampusId !== 'ALL') params.set('campusId', filterCampusId)
    return params.toString()
  }, [categoryFilter, startDate, endDate, filterCampusId])

  const { data, isLoading } = useQuery({
    queryKey: ['accountant-expenses', queryString],
    queryFn: () => fetchPaginatedApi<ExpenseRecord>(`/api/accountant/expenses?${queryString}`),
    enabled: canAccess,
  })

  const expenses = useMemo(() => data?.data ?? [], [data?.data])
  const total = useMemo(() => expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0), [expenses])

  const { data: expenseColumnSupport, isLoading: isLoadingExpenseColumns, isError: expenseColumnSupportError } = useQuery({
    queryKey: ['expense-column-support'],
    queryFn: () => fetchApi<{ paymentSource: boolean; paymentReference: boolean }>('/api/accountant/expenses/columns'),
    enabled: canAccess,
    staleTime: 60_000,
    gcTime: 300_000,
  })

  const { mutateAsync: updateExpenseAsync, isPending: isUpdatingExpense } = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      fetchApi<void>(`/api/accountant/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountant-expenses'] })
      notify.success('Expense updated successfully')
      setEditingExpense(null)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to update expense.'
      notify.error('Update failed', { description: message })
    },
  })

  const { mutateAsync: deleteExpenseAsync, isPending: isDeletingExpense } = useMutation({
    mutationFn: async (id: string) =>
      fetchApi<void>(`/api/accountant/expenses/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountant-expenses'] })
      notify.success('Expense deleted successfully')
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to delete expense.'
      notify.error('Deletion failed', { description: message })
    },
  })

  const openEditModal = (expense: ExpenseRecord) => {
    setEditingExpense(expense)
    setEditForm({
      title: expense.title,
      description: expense.description ?? '',
      amount: String(expense.amount),
      category: expense.category,
      date: expense.date,
      paymentSource: expense.paymentSource ?? '',
      paymentReference: expense.paymentReference ?? '',
      notes: expense.notes ?? '',
    })
  }

  const closeEditModal = () => {
    setEditingExpense(null)
  }

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingExpense) return

    const payload: Record<string, unknown> = {
      title: editForm.title,
      description: editForm.description || undefined,
      amount: Number(editForm.amount),
      category: editForm.category,
      date: editForm.date,
      notes: editForm.notes || undefined,
    }

    if (expenseColumnSupport?.paymentSource) {
      payload.paymentSource = editForm.paymentSource || undefined
    }
    if (expenseColumnSupport?.paymentReference) {
      payload.paymentReference = editForm.paymentReference || undefined
    }

    await updateExpenseAsync({ id: editingExpense.id, payload })
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this expense record?')) {
      deleteExpenseAsync(id)
    }
  }

  const paymentFieldsSupported = Boolean(
    !isLoadingExpenseColumns && !expenseColumnSupportError && expenseColumnSupport,
  )

  const showEditModal = Boolean(editingExpense)

  const showPaymentFields = paymentFieldsSupported
    ? expenseColumnSupport?.paymentSource || expenseColumnSupport?.paymentReference
    : false

  const exportExpenses = async () => {
    try {
      const exportUrl = `/api/accountant/expenses/export${exportQueryString ? `?${exportQueryString}` : ''}`
      const response = await fetch(exportUrl, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Unable to generate the expense export.')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `expenses-${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      notify.success('Expense export downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The export could not be created.'
      notify.error('Unable to export expenses', { description: message })
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || undefined,
        amount: Number(form.amount),
        category: form.category,
        date: form.date,
        notes: form.notes || undefined,
        campusId: form.campusId || undefined,
      }

      if (expenseColumnSupport?.paymentSource && form.paymentSource) {
        payload.paymentSource = form.paymentSource
      }
      if (expenseColumnSupport?.paymentReference && form.paymentReference) {
        payload.paymentReference = form.paymentReference
      }

      await fetchApi('/api/accountant/expenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      notify.success('Expense recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['accountant-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['accountant-expenses-dashboard'] })
      setForm({ title: '', description: '', amount: '', category: 'UTILITIES', date: new Date().toISOString().split('T')[0], paymentSource: '', paymentReference: '', notes: '', campusId: '' })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Please review the form values and try again.'
      notify.error('Unable to record expense', { description: message })
    },
  })

  if (status === 'loading') return null
  if (!canAccess) {
    return (
      <AccessDenied
        title="Finance Workspace Access"
        message="Only finance staff and admins can create and review expense records in this accounting workspace."
      />
    )
  }

  return (
    <>
      <Modal open={showEditModal} onClose={closeEditModal} title="Edit expense record" size="lg">
        {editingExpense && (
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select value={editForm.category} onValueChange={(value) => setEditForm((prev) => ({ ...prev, category: value }))}>
                  <SelectTrigger id="edit-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount (PKR)</Label>
                <Input id="edit-amount" type="number" min="0.01" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input id="edit-date" type="date" value={editForm.date} onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea id="edit-description" value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            {showPaymentFields ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentSource">Payment method</Label>
                  <Select value={editForm.paymentSource} onValueChange={(value) => setEditForm((prev) => ({ ...prev, paymentSource: value }))}>
                    <SelectTrigger id="edit-paymentSource"><SelectValue placeholder="Select payment method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentReference">Payment reference</Label>
                  <Input id="edit-paymentReference" value={editForm.paymentReference} onChange={(e) => setEditForm((prev) => ({ ...prev, paymentReference: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {isLoadingExpenseColumns
                  ? 'Checking whether payment metadata is supported in the current database schema...'
                  : expenseColumnSupportError
                  ? 'Unable to verify payment metadata support. The update will not include payment fields.'
                  : 'Payment metadata is not available in the current database schema. The update will not include payment fields.'}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeEditModal} type="button">Cancel</Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white" disabled={isUpdatingExpense}>
                {isUpdatingExpense ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Expenses</p>
          <h1 className="text-2xl font-black text-slate-900">Record and review campus expenses</h1>
          <p className="text-sm text-slate-500">This path uses the manual proof-style workflow: account managers record expenses directly, and they appear immediately in finance reports with approval set to true by default.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            <a href="/dashboard/accountant/reports" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Financial Reports
            </a>
          </Button>
        </div>
      </div>

      <Card className="border-teal-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Expense ledger steps</CardTitle>
          <CardDescription>Record expenses once, then reuse the same ledger for filtering, P&L, and Excel exports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ['1', 'Choose campus', 'Global finance users select the campus; campus-scoped users are applied automatically.'],
            ['2', 'Record expense', 'Enter title, category, amount, date, payment method/reference, and notes.'],
            ['3', 'Review ledger', 'Filter by category and date range, then edit or soft-delete incorrect records.'],
            ['4', 'Export and report', 'Download Excel or generate P&L after income, expenses, and payroll are complete.'],
          ].map(([step, title, body]) => (
            <div key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-xs font-black text-white">{step}</span>
              <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New expense</CardTitle>
            <CardDescription>Record a campus cost directly to the finance ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Utilities bill / stationery purchase" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Optional context for the finance report" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (PKR)</Label>
                <Input id="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
                  <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isGlobalAccountant && (
                <div className="space-y-2">
                  <Label htmlFor="campusId">Campus <span className="text-red-500">*</span></Label>
                  <Select value={form.campusId} onValueChange={(value) => setForm((prev) => ({ ...prev, campusId: value }))}>
                    <SelectTrigger id="campusId"><SelectValue placeholder="Select a campus" /></SelectTrigger>
                    <SelectContent>
                      {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {showPaymentFields ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="paymentSource">Payment method</Label>
                  <Select value={form.paymentSource} onValueChange={(value) => setForm((prev) => ({ ...prev, paymentSource: value }))}>
                    <SelectTrigger id="paymentSource"><SelectValue placeholder="Select payment method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentReference">Payment reference</Label>
                  <Input
                    id="paymentReference"
                    value={form.paymentReference}
                    onChange={(e) => setForm((prev) => ({ ...prev, paymentReference: e.target.value }))}
                    placeholder="Cheque number / transaction ID"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {isLoadingExpenseColumns
                  ? 'Checking whether payment metadata is supported in the current database schema...'
                  : expenseColumnSupportError
                  ? 'Unable to verify payment metadata support. Expenses will be recorded with core fields only.'
                  : 'Payment metadata is not available in the current database schema. Expenses will be recorded without payment method or reference.'}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional remarks for the finance team" />
            </div>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                !form.title ||
                !form.amount ||
                isLoadingExpenseColumns
              }
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              {mutation.isPending ? 'Saving…' : isLoadingExpenseColumns ? 'Checking schema…' : 'Record expense'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent campus expenses</CardTitle>
            <CardDescription>Total recorded this month: {formatCurrency(total)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 border-b border-slate-200 pb-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="filter-category">Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger id="filter-category"><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All categories</SelectItem>
                    {EXPENSE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-start">From</Label>
                <Input id="filter-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-end">To</Label>
                <Input id="filter-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Filter the ledger instantly; export the current view to Excel for finance reporting.</p>
              <Button variant="outline" onClick={exportExpenses} className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50">
                <Download className="h-4 w-4" /> Export Excel
              </Button>
            </div>
          </CardContent>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading expense ledger…</p>
            ) : expenses.length === 0 ? (
              <p className="text-sm text-slate-500">No expense records yet in this campus ledger.</p>
            ) : (
              expenses.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{item.title}</h3>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-600">{item.category}</span>
                        {item.isApproved && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-emerald-700">Approved</span>}
                      </div>
                      <p className="text-sm text-slate-500">{item.description || item.notes || 'No further notes.'}</p>
                      {(item.paymentSource || item.paymentReference) && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                          {item.paymentSource && <span className="rounded-full bg-slate-100 px-2 py-1">Method: {item.paymentSource}</span>}
                          {item.paymentReference && <span className="rounded-full bg-slate-100 px-2 py-1">Ref: {item.paymentReference}</span>}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">Recorded on {formatDate(item.date)} by {item.accountant?.firstName || 'Accountant'} {item.accountant?.lastName || ''}</p>
                    </div>
                    <div className="flex flex-col items-start gap-3 text-right md:items-end">
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-slate-300 text-slate-700"
                          onClick={() => openEditModal(item)}
                        >
                          <Edit3 className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(item.id)}
                          disabled={isDeletingExpense}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  )
}
