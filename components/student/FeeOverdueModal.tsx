'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CreditCard, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface OverdueData {
  hasOverdue: boolean
  totalOverdue: number
  overdueCount: number
  invoices: Array<{
    id: string
    challanNumber: string
    month: string
    studentName: string
    outstandingAmount: number
  }>
}

export function FeeOverdueModal() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role
  const viewerKey = session?.user?.id ? `${role}:${session.user.id}` : ''
  const [isDismissed, setIsDismissed] = useState(false)
  const previousViewerKey = useRef(viewerKey)
  const cardRef = useRef<HTMLDivElement>(null)

  const { data, refetch } = useQuery<OverdueData>({
    queryKey: ['fee-overdue-reminder', viewerKey],
    enabled: Boolean(viewerKey && ['STUDENT', 'PARENT', 'GUARDIAN'].includes(role ?? '')),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: false,
    queryFn: async () => {
      const response = await fetch('/api/student/fees/overdue', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load fee reminder')
      return response.json() as Promise<OverdueData>
    },
  })

  // A dismissal belongs to the current login only. A new login (including the
  // same user logging in again) starts with a fresh reminder state.
  useEffect(() => {
    if (previousViewerKey.current !== viewerKey) {
      setIsDismissed(false)
      previousViewerKey.current = viewerKey
    }
  }, [viewerKey])

  // Re-check after route changes so a payment completed on the fee page clears
  // the reminder without requiring a full browser refresh.
  useEffect(() => {
    if (viewerKey) void refetch()
  }, [pathname, refetch, viewerKey])

  useEffect(() => {
    if (isDismissed || !data?.hasOverdue || pathname?.startsWith('/dashboard/fees')) return

    const dismissOnOutsideClick = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsDismissed(true)
      }
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDismissed(true)
    }

    document.addEventListener('click', dismissOnOutsideClick)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('click', dismissOnOutsideClick)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [data?.hasOverdue, isDismissed, pathname])

  const handleClose = () => {
    setIsDismissed(true)
  }

  const firstInvoice = data?.invoices?.[0]
  const isGuardian = role === 'PARENT' || role === 'GUARDIAN'
  const destination = isGuardian ? '/dashboard/my-children' : firstInvoice ? `/dashboard/fees/${firstInvoice.id}` : '/dashboard/fees'
  const shouldShowModal = Boolean(data?.hasOverdue && !pathname?.startsWith('/dashboard/fees') && !isDismissed)

  if (!shouldShowModal) return null

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[100] w-[calc(100vw-1.5rem)] max-w-md sm:right-6 sm:top-20 sm:w-full" role="status" aria-live="polite">
      <div ref={cardRef} className="pointer-events-auto max-h-[calc(100vh-5rem)] overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-red-200 animate-in slide-in-from-right-4 fade-in duration-300">
        <div className="relative bg-gradient-to-br from-red-600 to-rose-700 p-8 flex flex-col items-center justify-center text-white overflow-hidden">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
            aria-label="Close overdue reminder"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-5 backdrop-blur shadow-inner ring-4 ring-white/30">
            <AlertTriangle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-black text-center mb-1 tracking-tight">Fee Overdue Reminder</h2>
          <p className="text-red-100 text-sm font-medium text-center max-w-xs leading-relaxed">
            You have an overdue fee reminder. Close this notice to continue using your portal, or open your fee details when convenient.
          </p>
        </div>

        <div className="p-6">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-red-800">Pending Invoices</span>
              <span className="text-sm font-black text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
                {data.overdueCount} overdue
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-red-800">Total Amount Due</span>
              <span className="text-2xl font-black text-red-600">Rs {data.totalOverdue.toLocaleString()}</span>
            </div>
            {isGuardian && data.invoices.slice(0, 2).map((invoice) => (
              <div key={invoice.id} className="mt-3 flex items-center justify-between gap-3 border-t border-red-100 pt-3 text-xs text-red-700">
                <span className="truncate">{invoice.studentName || 'Student'} · {invoice.month}</span>
                <span className="shrink-0 font-bold">Rs {invoice.outstandingAmount.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 font-medium leading-relaxed">
              This is a reminder only. Your portal access is not blocked. You can close it now and return to it on your next login if the balance remains unpaid.
            </p>
          </div>

          <Link href={destination} className="w-full block" onClick={handleClose}>
            <Button className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold h-13 text-base shadow-lg shadow-red-200 gap-2.5 rounded-xl transition-all">
              <CreditCard className="w-5 h-5" />
              {isGuardian ? 'View Children\'s Fees' : 'View Fee Details'}
            </Button>
          </Link>

          <p className="text-center text-[11px] text-gray-400 font-medium mt-4">
            For help, contact Accounts Office support.
          </p>
        </div>
      </div>
    </div>
  )
}
