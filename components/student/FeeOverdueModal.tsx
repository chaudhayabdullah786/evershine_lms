'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface OverdueData {
  hasOverdue: boolean
  totalOverdue: number
  overdueCount: number
}

export function FeeOverdueModal() {
  const pathname = usePathname()
  const DISMISS_KEY = 'studentFeeOverdueModalDismissed'
  const [data, setData] = useState<OverdueData | null>(null)
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (isDismissed) {
      return
    }

    fetch('/api/student/fees/overdue')
      .then(res => res.json())
      .then(json => {
        if (json.hasOverdue) {
          setData(json)
        }
      })
      .catch(err => console.error('Error fetching overdue fees', err))
  }, [isDismissed])

  const handleClose = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // ignore storage errors and still close the modal
    }

    setIsDismissed(true)
  }

  const shouldShowModal = Boolean(data && !pathname?.startsWith('/dashboard/fees') && !isDismissed)

  if (!shouldShowModal) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
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
            Your account has overdue fees. Please visit the fee section to settle the amount and continue using the portal smoothly.
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
          </div>

          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6">
            <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 font-medium leading-relaxed">
              This is a reminder only. You can continue using the dashboard, or go to the fee section to complete payment.
            </p>
          </div>

          <Link href="/dashboard/fees" className="w-full block">
            <Button className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold h-13 text-base shadow-lg shadow-red-200 gap-2.5 rounded-xl transition-all">
              <CreditCard className="w-5 h-5" />
              Go to Fee Section &amp; Pay Now
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
