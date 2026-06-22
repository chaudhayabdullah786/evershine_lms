'use client'

/**
 * Landing Page Leads Hub — Unified management for all three landing page data tracks:
 * 1. Visitor Inquiries (contact form)
 * 2. Student Admissions (existing AdmissionRequest)
 * 3. Staff Applications (new StaffApplicationRequest)
 *
 * Three-tab layout with status-filtered views, inline actions, and Excel export.
 * RBAC: SUPER_ADMIN | ADMIN only (enforced at API level + sidebar visibility).
 */

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import {
  Inbox,
  GraduationCap,
  Briefcase,
  Download,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  MessageSquare,
  Calendar,
  Loader2,
  Ban,
  Pause,
  RotateCcw,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Inquiry {
  id: string
  name: string
  phone: string
  email: string | null
  message: string
  source: string
  status: string
  adminReply: string | null
  createdAt: string
}

interface StaffApp {
  id: string
  fullName: string
  cnic: string
  phone: string
  email: string
  applicantType: string
  qualification: string
  specialization: string
  experienceYears: number
  preferredShift: string | null
  status: string
  interviewDate: string | null
  createdAt: string
}

interface LeadCounts {
  inquiries: number
  admissions: number
  staffApplications: number
}

// ── Status Badge Component ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: 'bg-amber-100 text-amber-800',
    PENDING: 'bg-amber-100 text-amber-800',
    SEEN: 'bg-blue-100 text-blue-800',
    UNDER_REVIEW: 'bg-blue-100 text-blue-800',
    REPLIED: 'bg-indigo-100 text-indigo-800',
    INTERVIEW_SCHEDULED: 'bg-purple-100 text-purple-800',
    RESOLVED: 'bg-green-100 text-green-800',
    APPROVED: 'bg-green-100 text-green-800',
    DECLINED: 'bg-red-100 text-red-800',
    SPAM: 'bg-gray-100 text-gray-800',
    ON_HOLD: 'bg-gray-100 text-gray-600',
  }
  const label = status.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

// ── Type Badge for Staff ─────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TEACHER: 'bg-emerald-100 text-emerald-800',
    ACCOUNTANT: 'bg-teal-100 text-teal-800',
    ADMIN_STAFF: 'bg-indigo-100 text-indigo-800',
  }
  const label = type === 'ADMIN_STAFF' ? 'Admin' : type.charAt(0) + type.slice(1).toLowerCase()
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'inquiries' | 'admissions' | 'staff'

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('inquiries')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  // Badge counts for tab headers
  const { data: counts } = useQuery({
    queryKey: ['lead-counts'],
    queryFn: () => fetchApi<LeadCounts>('/api/dashboard/lead-counts'),
    refetchInterval: 30000,
  })

  // Reset filters on tab change
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setStatusFilter('ALL')
    setSearchQuery('')
    setPage(1)
  }, [])

  const tabs = [
    {
      id: 'inquiries' as Tab,
      label: 'Inquiries',
      icon: Inbox,
      count: counts?.data?.inquiries ?? 0,
      statuses: ['ALL', 'NEW', 'SEEN', 'REPLIED', 'RESOLVED', 'SPAM'],
    },
    {
      id: 'admissions' as Tab,
      label: 'Admissions',
      icon: GraduationCap,
      count: counts?.data?.admissions ?? 0,
      statuses: ['ALL', 'PENDING', 'APPROVED', 'DECLINED'],
    },
    {
      id: 'staff' as Tab,
      label: 'Staff Apps',
      icon: Briefcase,
      count: counts?.data?.staffApplications ?? 0,
      statuses: ['ALL', 'PENDING', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'APPROVED', 'DECLINED', 'ON_HOLD'],
    },
  ]

  const currentTab = tabs.find(t => t.id === activeTab)!

  // Export URL builder
  const getExportUrl = () => {
    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (activeTab === 'inquiries') return `/api/landing/inquiries/export?${params}`
    if (activeTab === 'admissions') return `/api/admissions/export?${params}`
    return `/api/staff-applications/export?${params}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Page Leads</h1>
          <p className="text-sm text-gray-500 mt-1">Manage inquiries, student admissions, and staff applications from the landing page.</p>
        </div>
        <a
          href={getExportUrl()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download Excel
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
            placeholder="Search by name, email, phone, CNIC..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {currentTab.statuses.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {activeTab === 'inquiries' && (
        <InquiriesTable searchQuery={searchQuery} statusFilter={statusFilter} page={page} setPage={setPage} />
      )}
      {activeTab === 'admissions' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-semibold">Student Admissions</p>
          <p className="text-sm mt-1">Admissions are managed from the <a href="/dashboard/admissions" className="text-blue-600 hover:underline font-medium">Admissions page</a>. Use the Download Excel button above to export all admission data.</p>
        </div>
      )}
      {activeTab === 'staff' && (
        <StaffTable searchQuery={searchQuery} statusFilter={statusFilter} page={page} setPage={setPage} />
      )}
    </div>
  )
}

// ── Inquiries Table ──────────────────────────────────────────────────────────

function InquiriesTable({ searchQuery, statusFilter, page, setPage }: {
  searchQuery: string; statusFilter: string; page: number; setPage: (p: number) => void
}) {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (statusFilter !== 'ALL') params.set('status', statusFilter)
  if (searchQuery) params.set('q', searchQuery)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inquiries', page, statusFilter, searchQuery],
    queryFn: () => fetchPaginatedApi<Inquiry>(`/api/landing/inquiries?${params}`),
  })

  const inquiries = data?.data ?? []
  const totalPages = data?.pagination?.totalPages ?? 1

  const handleAction = async (id: string, action: string, replyText?: string) => {
    try {
      await fetch(`/api/landing/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, replyText }),
      })
      refetch()
    } catch { /* handled silently — user sees stale state until next refetch */ }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (inquiries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-semibold">No inquiries found</p>
        <p className="text-sm mt-1">Visitor inquiries from the contact form will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Message</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inquiries.map((inq) => (
              <tr key={inq.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{inq.name}</p>
                  {inq.email && <p className="text-xs text-gray-500">{inq.email}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <a href={`tel:${inq.phone}`} className="hover:text-blue-600">{inq.phone}</a>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell max-w-[200px] truncate">{inq.message}</td>
                <td className="px-4 py-3"><StatusBadge status={inq.status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inq.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {inq.status !== 'RESOLVED' && inq.status !== 'SPAM' && (
                      <button
                        onClick={() => handleAction(inq.id, 'resolve')}
                        className="p-1.5 rounded-md hover:bg-green-50 text-green-600 transition-colors"
                        title="Mark Resolved"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    {inq.status !== 'SPAM' && (
                      <button
                        onClick={() => handleAction(inq.id, 'spam')}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                        title="Mark as Spam"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ── Staff Applications Table ─────────────────────────────────────────────────

function StaffTable({ searchQuery, statusFilter, page, setPage }: {
  searchQuery: string; statusFilter: string; page: number; setPage: (p: number) => void
}) {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (statusFilter !== 'ALL') params.set('status', statusFilter)
  if (searchQuery) params.set('q', searchQuery)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['staff-applications', page, statusFilter, searchQuery],
    queryFn: () => fetchPaginatedApi<StaffApp>(`/api/staff-applications?${params}`),
  })

  const apps = data?.data ?? []
  const totalPages = data?.pagination?.totalPages ?? 1

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleReview = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setActionLoading(id)
    try {
      await fetch(`/api/staff-applications/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      refetch()
    } catch { /* silent */ }
    setActionLoading(null)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (apps.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-semibold">No staff applications found</p>
        <p className="text-sm mt-1">Teacher, accountant, and admin staff applications from the landing page will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Qualification</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Experience</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {apps.map((app) => (
              <tr key={app.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{app.fullName}</p>
                  <p className="text-xs text-gray-500">{app.email}</p>
                </td>
                <td className="px-4 py-3"><TypeBadge type={app.applicantType} /></td>
                <td className="px-4 py-3 text-gray-700 hidden md:table-cell">{app.qualification}</td>
                <td className="px-4 py-3 text-gray-700 hidden lg:table-cell">{app.experienceYears} yr{app.experienceYears !== 1 ? 's' : ''}</td>
                <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(app.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {actionLoading === app.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <>
                        {!['APPROVED', 'DECLINED'].includes(app.status) && (
                          <button
                            onClick={() => {
                              const reason = prompt('Enter decline reason:')
                              if (reason) handleReview(app.id, 'decline', { reason })
                            }}
                            className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
                            title="Decline"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {!['APPROVED', 'DECLINED'].includes(app.status) && (
                          <button
                            onClick={() => {
                              const date = prompt('Enter interview date (YYYY-MM-DD):')
                              if (date) handleReview(app.id, 'schedule_interview', { interviewDate: date })
                            }}
                            className="p-1.5 rounded-md hover:bg-purple-50 text-purple-500 transition-colors"
                            title="Schedule Interview"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}
                        {app.status === 'ON_HOLD' && (
                          <button
                            onClick={() => handleReview(app.id, 'reopen')}
                            className="p-1.5 rounded-md hover:bg-blue-50 text-blue-500 transition-colors"
                            title="Reopen"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {!['APPROVED', 'DECLINED', 'ON_HOLD'].includes(app.status) && (
                          <button
                            onClick={() => handleReview(app.id, 'hold')}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                            title="Put on Hold"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
