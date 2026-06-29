'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { useSession } from 'next-auth/react'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw,
  Eye, CalendarDays, Layers, Info, MapPin, Globe, Clock
} from 'lucide-react'

// ─── Constants & Types ─────────────────────────────────────────────────────────

interface Campus {
  id: string
  name: string
}

interface CalendarEvent {
  id: string
  title: string
  description?: string | null
  startDate: string
  endDate: string
  eventType: 'Holiday' | 'Exam' | 'Sports' | 'Ceremony' | 'Other'
  campusId?: string | null
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  Holiday: { bg: 'bg-red-50 text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  Exam: { bg: 'bg-purple-50 text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  Sports: { bg: 'bg-green-50 text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  Ceremony: { bg: 'bg-blue-50 text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  Other: { bg: 'bg-gray-50 text-gray-700', border: 'border-gray-200', dot: 'bg-gray-400' },
}
function formatLocalDateTime(isoString: string) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  
  const pad = (num: number) => num.toString().padStart(2, '0')
  
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const date = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  
  return `${year}-${month}-${date}T${hours}:${minutes}`
}

function formatEventRange(startStr: string, endStr: string) {
  if (!startStr || !endStr) return ''
  const start = new Date(startStr)
  const end = new Date(endStr)
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return ''
  
  const isSameDay = start.toDateString() === end.toDateString()
  
  const formatDate = (d: Date) => d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
  const formatTime = (d: Date) => d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
  
  if (isSameDay) {
    return `${formatDate(start)} (${formatTime(start)} — ${formatTime(end)})`
  } else {
    return `${formatDate(start)} at ${formatTime(start)} — ${formatDate(end)} at ${formatTime(end)}`
  }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const EMPTY_FORM = {
  title: '',
  description: '',
  startDate: '',
  endDate: '',
  eventType: 'Other' as 'Holiday' | 'Exam' | 'Sports' | 'Ceremony' | 'Other',
  campusId: 'ALL',
}

// ─── Calendar Form (shared by Create & Edit Dialogs) ───────────────────────────

function CalendarEventForm({
  form,
  onChange,
  campuses,
}: {
  form: typeof EMPTY_FORM
  onChange: (patch: Partial<typeof EMPTY_FORM>) => void
  campuses: Campus[]
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="event-title">Event Title <span className="text-red-500">*</span></Label>
        <Input
          id="event-title"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. Annual Sports Gala"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event-description">Description</Label>
        <Textarea
          id="event-description"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Provide additional details about the event…"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Event Type</Label>
          <Select
            value={form.eventType}
            onValueChange={(v) => onChange({ eventType: v as any })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Holiday">Holiday 🎈</SelectItem>
              <SelectItem value="Exam">Exam 📝</SelectItem>
              <SelectItem value="Sports">Sports 🏆</SelectItem>
              <SelectItem value="Ceremony">Ceremony 🎓</SelectItem>
              <SelectItem value="Other">Other ✨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Campus Scope</Label>
          <Select
            value={form.campusId}
            onValueChange={(v) => onChange({ campusId: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Campuses 🌍</SelectItem>
              {campuses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  🏫 {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-start">Start Date & Time <span className="text-red-500">*</span></Label>
          <Input
            id="event-start"
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end">End Date & Time <span className="text-red-500">*</span></Label>
          <Input
            id="event-end"
            type="datetime-local"
            value={form.endDate}
            min={form.startDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  const role = session?.user?.role as string | undefined
  const userCampusId = session?.user?.campusId as string | undefined
  const canCreate = role === 'SUPER_ADMIN' || role === 'ADMIN'

  // View States
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  // Dialog States
  const [createOpen, setCreateOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [deleteEvent, setDeleteEvent] = useState<CalendarEvent | null>(null)
  const [viewEvent, setViewEvent] = useState<CalendarEvent | null>(null)

  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM })
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })

  // Date ranges based on viewMode
  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)

  // ── Query: Calendar Events ─────────────────────────────────────────────────
  
  const monthlyQueryUrl = `/api/calendar?startDate=${startOfMonth.toISOString().split('T')[0]}&endDate=${endOfMonth.toISOString().split('T')[0]}&limit=100`
  const yearlyQueryUrl = `/api/calendar?startDate=${selectedYear}-01-01&endDate=${selectedYear}-12-31&limit=500`

  const { data: eventsData, isLoading } = useQuery({
    queryKey: viewMode === 'monthly'
      ? ['calendar-events-monthly', viewDate.getFullYear(), viewDate.getMonth()]
      : ['calendar-events-yearly', selectedYear],
    queryFn: () => fetchPaginatedApi<CalendarEvent>(viewMode === 'monthly' ? monthlyQueryUrl : yearlyQueryUrl),
  })

  const rawEvents = eventsData?.data ?? []
  
  // Sort and unique the events just in case
  const events = [...rawEvents].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  )

  // ── Query: Campuses (for admins only) ──────────────────────────────────────
  
  const { data: campusesData } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => fetchApi<Campus[]>('/api/campuses'),
    enabled: canCreate,
  })
  
  const campuses = campusesData ?? []

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (f: typeof EMPTY_FORM) =>
      fetchApi('/api/calendar', {
        method: 'POST',
        body: JSON.stringify({
          title: f.title,
          description: f.description || null,
          startDate: f.startDate,
          endDate: f.endDate,
          eventType: f.eventType,
          campusId: f.campusId === 'ALL' ? null : f.campusId,
        }),
      }),
    onSuccess: () => {
      notify.success('Calendar event created successfully')
      queryClient.invalidateQueries({ queryKey: ['calendar-events-monthly'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events-yearly'] })
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_FORM })
    },
    onError: (err: any) => notify.error('Failed to create event', { description: err.message }),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: typeof EMPTY_FORM }) =>
      fetchApi(`/api/calendar/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: f.title,
          description: f.description || null,
          startDate: f.startDate,
          endDate: f.endDate,
          eventType: f.eventType,
          campusId: f.campusId === 'ALL' ? null : f.campusId,
        }),
      }),
    onSuccess: () => {
      notify.success('Calendar event updated')
      queryClient.invalidateQueries({ queryKey: ['calendar-events-monthly'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events-yearly'] })
      setEditEvent(null)
    },
    onError: (err: any) => notify.error('Failed to update event', { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/calendar/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Calendar event removed')
      queryClient.invalidateQueries({ queryKey: ['calendar-events-monthly'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events-yearly'] })
      setDeleteEvent(null)
    },
    onError: (err: any) => notify.error('Failed to delete event', { description: err.message }),
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const validate = (f: typeof EMPTY_FORM) => {
    if (!f.title.trim()) { notify.error('Title is required'); return false }
    if (!f.startDate) { notify.error('Start date is required'); return false }
    if (!f.endDate) { notify.error('End date is required'); return false }
    if (new Date(f.endDate) < new Date(f.startDate)) {
      notify.error('End date cannot be earlier than start date')
      return false
    }
    return true
  }

  const openEdit = (e: CalendarEvent) => {
    setEditForm({
      title: e.title,
      description: e.description ?? '',
      startDate: formatLocalDateTime(e.startDate),
      endDate: formatLocalDateTime(e.endDate),
      eventType: e.eventType,
      campusId: e.campusId ?? 'ALL',
    })
    setEditEvent(e)
  }

  const openCreateForDate = (dayNumber: number) => {
    if (!canCreate) return
    const targetDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNumber)
    const pad = (num: number) => num.toString().padStart(2, '0')
    const dateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(dayNumber)}`
    setCreateForm({
      ...EMPTY_FORM,
      startDate: `${dateStr}T09:00`,
      endDate: `${dateStr}T17:00`,
    })
    setCreateOpen(true)
  }

  const handleOpenCreateGeneral = () => {
    const pad = (num: number) => num.toString().padStart(2, '0')
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    setCreateForm({
      ...EMPTY_FORM,
      startDate: `${dateStr}T09:00`,
      endDate: `${dateStr}T17:00`,
    })
    setCreateOpen(true)
  }

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  // ── Monthly Grid Helpers ───────────────────────────────────────────────────

  const firstDayOfMonth = startOfMonth.getDay() // 0=Sun
  const firstMonday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const daysInMonth = endOfMonth.getDate()

  const getEventsForDay = (year: number, month: number, day: number) => {
    const d = new Date(year, month, day)
    return events.filter((e) => {
      const start = new Date(e.startDate)
      const end = new Date(e.endDate)
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
             d <= new Date(end.getFullYear(), end.getMonth(), end.getDate())
    })
  }

  // ── Yearly Mini Grid Helpers ────────────────────────────────────────────────

  const getDaysInYearMonth = (year: number, monthIndex: number) => {
    return new Date(year, monthIndex + 1, 0).getDate()
  }

  const getFirstMondayOffset = (year: number, monthIndex: number) => {
    const day = new Date(year, monthIndex, 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  // Group events by month for the Yearly Roadmap Timeline
  const groupedEventsByMonth = MONTH_NAMES.map((name, index) => {
    const monthEvents = events.filter(e => {
      const start = new Date(e.startDate)
      const end = new Date(e.endDate)
      // Check if event touches this month
      const startMonthIndex = start.getFullYear() === selectedYear ? start.getMonth() : -1
      const endMonthIndex = end.getFullYear() === selectedYear ? end.getMonth() : -1
      return (index >= startMonthIndex && index <= endMonthIndex) ||
             (start.getFullYear() < selectedYear && end.getFullYear() > selectedYear)
    })
    return { name, index, events: monthEvents }
  }).filter(group => group.events.length > 0)

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-indigo-600" /> Academic Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse institution holidays, exams, sports meets, and ceremony schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Dual tab views toggle */}
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border">
            <button
              onClick={() => setViewMode('monthly')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'monthly'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Monthly View
            </button>
            <button
              onClick={() => setViewMode('yearly')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'yearly'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Yearly Roadmap
            </button>
          </div>

          {/* Year selector (Visible only in yearly view) */}
          {viewMode === 'yearly' && (
            <Select
              value={selectedYear.toString()}
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-[110px] h-[38px] rounded-xl font-semibold border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = new Date().getFullYear() - 2 + i
                  return (
                    <SelectItem key={y} value={y.toString()} className="font-semibold">
                      Year {y}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}

          {canCreate && (
            <Button
              className="gap-2 rounded-xl h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold ml-auto md:ml-0"
              onClick={handleOpenCreateGeneral}
            >
              <Plus className="w-4 h-4" /> New Event
            </Button>
          )}
        </div>
      </div>

      {/* ── MONTHLY VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'monthly' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-300">
          {/* Monthly navigation header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-white border rounded-xl shadow-sm transition-all"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-black text-gray-900 tracking-tight">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-white border rounded-xl shadow-sm transition-all"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Weekday day labels */}
          <div className="grid grid-cols-7 border-b bg-gray-50/20 text-center">
            {DAYS.map((d) => (
              <div key={d} className="py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                {d}
              </div>
            ))}
          </div>

          {/* Monthly grid */}
          {isLoading ? (
            <div className="grid grid-cols-7 divide-x divide-y border-b">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-28 p-2 bg-white flex flex-col justify-between">
                  <Skeleton className="h-4 w-6 rounded-md" />
                  <Skeleton className="h-5 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 divide-x divide-y border-b">
              {/* Mon-indexed offset spacer cells */}
              {Array.from({ length: firstMonday }).map((_, i) => (
                <div key={`empty-${i}`} className="h-28 bg-gray-50/30 border-gray-100" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const isToday =
                  day === today.getDate() &&
                  viewDate.getMonth() === today.getMonth() &&
                  viewDate.getFullYear() === today.getFullYear()
                const dayEvents = getEventsForDay(viewDate.getFullYear(), viewDate.getMonth(), day)

                return (
                  <div
                    key={day}
                    onClick={() => canCreate && dayEvents.length === 0 && openCreateForDate(day)}
                    className={`h-28 p-2 flex flex-col justify-between overflow-hidden relative group cursor-pointer transition-all ${
                      isToday ? 'bg-indigo-50/30' : 'hover:bg-gray-50/80 bg-white'
                    }`}
                  >
                    {/* Inner header cell */}
                    <div className="flex justify-between items-start">
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg ${
                        isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 bg-gray-100/50'
                      }`}>
                        {day}
                      </span>
                      {canCreate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openCreateForDate(day) }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-50 text-indigo-600 rounded-md transition-all"
                          title="Add event here"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Events listed in cell */}
                    <div className="space-y-1 mt-2 flex-grow overflow-y-auto max-h-16 no-scrollbar">
                      {dayEvents.slice(0, 3).map((e) => {
                        const style = EVENT_TYPE_COLORS[e.eventType] ?? EVENT_TYPE_COLORS.Other
                        const eventTimeStr = `${new Date(e.startDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${new Date(e.endDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                        return (
                          <div
                            key={e.id}
                            onClick={(evt) => { evt.stopPropagation(); setViewEvent(e) }}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg border leading-tight truncate shadow-sm transition-all hover:scale-[1.02] ${style.bg} ${style.border}`}
                            title={`${e.title} (${eventTimeStr})`}
                          >
                            {e.title}
                          </div>
                        )
                      }) }
                      {dayEvents.length > 3 && (
                        <p className="text-[9px] text-gray-400 font-bold pl-1">
                          +{dayEvents.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── YEARLY VIEW ───────────────────────────────────────────────────────── */}
      {viewMode === 'yearly' && (
        <div className="space-y-6 transition-all duration-300">
          {/* 12-Month Card Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MONTH_NAMES.map((monthName, monthIdx) => {
              const daysNum = getDaysInYearMonth(selectedYear, monthIdx)
              const offset = getFirstMondayOffset(selectedYear, monthIdx)
              const isCurrentMonth = today.getFullYear() === selectedYear && today.getMonth() === monthIdx

              return (
                <Card
                  key={monthName}
                  className={`border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden bg-white ${
                    isCurrentMonth ? 'ring-2 ring-indigo-500/30' : ''
                  }`}
                >
                  <div className="p-4">
                    <h3 className="text-sm font-black text-gray-900 border-b pb-2 mb-3 flex items-center justify-between">
                      {monthName}
                      {isCurrentMonth && (
                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold border-none px-2 rounded-md">
                          Current
                        </Badge>
                      )}
                    </h3>

                    {/* Small Mini-Weekday header */}
                    <div className="grid grid-cols-7 text-center mb-1 text-[9px] font-bold text-gray-400">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((val, idx) => (
                        <div key={idx}>{val}</div>
                      ))}
                    </div>

                    {/* Small Mini-Month grid */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                      {/* Empty cells before start */}
                      {Array.from({ length: offset }).map((_, i) => (
                        <div key={`empty-${i}`} className="w-5 h-5" />
                      ))}

                      {/* Day circles */}
                      {Array.from({ length: daysNum }).map((_, i) => {
                        const day = i + 1
                        const dayEvents = getEventsForDay(selectedYear, monthIdx, day)
                        const isDayToday =
                          today.getFullYear() === selectedYear &&
                          today.getMonth() === monthIdx &&
                          today.getDate() === day

                        // Get primary event dot color if exists
                        const primaryEvent = dayEvents[0]
                        const dotColor = primaryEvent
                          ? (EVENT_TYPE_COLORS[primaryEvent.eventType]?.dot ?? 'bg-gray-400')
                          : ''

                        return (
                          <div
                            key={day}
                            onClick={() => {
                              if (dayEvents.length > 0) {
                                setViewEvent(dayEvents[0])
                              } else if (canCreate) {
                                const targetDate = new Date(selectedYear, monthIdx, day)
                                const formatted = targetDate.toISOString().split('T')[0]
                                setCreateForm({ ...EMPTY_FORM, startDate: formatted, endDate: formatted })
                                setCreateOpen(true)
                              }
                            }}
                            className={`w-5.5 h-5.5 rounded-full flex flex-col items-center justify-center font-bold cursor-pointer transition-all relative ${
                              isDayToday
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : dayEvents.length > 0
                                ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                            title={primaryEvent ? `${day}: ${primaryEvent.title}` : `${day}`}
                          >
                            {day}
                            {/* Tiny event type colored indicator dot */}
                            {dayEvents.length > 0 && !isDayToday && (
                              <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Academic Roadmap Timeline (Events grouped by month) */}
          <div className="bg-white rounded-2xl border shadow-sm p-6">
            <h2 className="text-lg font-black text-gray-900 tracking-tight mb-5 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" /> Year {selectedYear} Academic Roadmap
            </h2>

            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : groupedEventsByMonth.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300 animate-pulse" />
                <p className="font-semibold text-gray-500">No events scheduled for the year {selectedYear}.</p>
                {canCreate && (
                  <Button
                    variant="link"
                    className="text-indigo-600 text-sm font-bold mt-1"
                    onClick={() => setCreateOpen(true)}
                  >
                    Schedule the first year-long event →
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative border-l pl-6 space-y-8 ml-2.5">
                {groupedEventsByMonth.map((group) => (
                  <div key={group.name} className="relative">
                    {/* Circle Month Node */}
                    <span className="absolute -left-10 top-1.5 w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs border border-indigo-100 shadow-sm flex items-center justify-center">
                      {group.name.slice(0, 3)}
                    </span>

                    <div className="space-y-3">
                      <h3 className="font-black text-gray-900 tracking-tight text-sm uppercase text-indigo-600 pl-1">
                        {group.name} Events
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {group.events.map((e) => {
                          const style = EVENT_TYPE_COLORS[e.eventType] ?? EVENT_TYPE_COLORS.Other
                          const campusName = campuses.find((c) => c.id === e.campusId)?.name
                          return (
                            <div
                              key={e.id}
                              onClick={() => setViewEvent(e)}
                              className="border rounded-xl p-4 bg-gray-50/40 hover:bg-white hover:shadow-md cursor-pointer transition-all duration-200 border-gray-100 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <Badge className={`${style.bg} ${style.border} text-[10px] font-bold px-2 rounded-md border shadow-none`}>
                                    {e.eventType}
                                  </Badge>
                                  {e.campusId ? (
                                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 rounded-md shadow-none">
                                      🏫 {campusName ?? 'Specific Campus'}
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-bold px-2 rounded-md shadow-none">
                                      🌍 All Campuses
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="font-black text-gray-900 tracking-tight leading-snug">{e.title}</h4>
                                {e.description && (
                                  <p className="text-xs text-gray-500 mt-1 whitespace-pre-line line-clamp-2">
                                    {e.description}
                                  </p>
                                )}
                              </div>

                              <div className="mt-3 pt-2 border-t flex items-center justify-between text-[11px] text-gray-400">
                                <span className="font-semibold flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                                  {formatEventRange(e.startDate, e.endDate)}
                                </span>
                                <span className="text-[10px] text-gray-400 hover:text-indigo-600 font-bold">
                                  View Details →
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Event Legend ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-3 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Info className="w-4 h-4 text-indigo-600" /> Legend
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(EVENT_TYPE_COLORS).map(([type, style]) => (
            <span
              key={type}
              className={`text-xs px-3 py-1 rounded-xl border font-bold shadow-sm flex items-center gap-2 ${style.bg} ${style.border}`}
            >
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* ── Create Event Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight text-gray-900">
              Create New Event
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Schedule academic calendar milestones, campus holidays, or ceremonies.
            </DialogDescription>
          </DialogHeader>
          <CalendarEventForm
            form={createForm}
            onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
            campuses={campuses}
          />
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-gray-200 font-bold"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={() => validate(createForm) && createMutation.mutate(createForm)}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Creating…</>
              ) : (
                'Create Event'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Event Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!editEvent} onOpenChange={(o) => !o && setEditEvent(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight text-gray-900">
              Edit Event
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Modify details or reschedule this calendar milestone.
            </DialogDescription>
          </DialogHeader>
          <CalendarEventForm
            form={editForm}
            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
            campuses={campuses}
          />
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-gray-200 font-bold"
              onClick={() => setEditEvent(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={() => editEvent && validate(editForm) && editMutation.mutate({ id: editEvent.id, f: editForm })}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving…</>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Event Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!viewEvent} onOpenChange={(o) => !o && setViewEvent(null)}>
        <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {viewEvent && (
                <>
                  <Badge className={`${EVENT_TYPE_COLORS[viewEvent.eventType]?.bg} ${EVENT_TYPE_COLORS[viewEvent.eventType]?.border} text-[10px] font-bold px-2 rounded-md border shadow-none`}>
                    {viewEvent.eventType}
                  </Badge>
                  {viewEvent.campusId ? (
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 rounded-md shadow-none flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {campuses.find((c) => c.id === viewEvent.campusId)?.name ?? 'Campus Specific'}
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-bold px-2 rounded-md shadow-none flex items-center gap-1">
                      <Globe className="w-3 h-3" /> All Campuses
                    </Badge>
                  )}
                </>
              )}
            </div>
            <DialogTitle className="text-xl font-black text-gray-900 tracking-tight leading-snug">
              {viewEvent?.title}
            </DialogTitle>
          </DialogHeader>

          {viewEvent && (
            <div className="space-y-4 py-2">
              {viewEvent.description ? (
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                  {viewEvent.description}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">No description provided for this event.</p>
              )}

              <div className="pt-3 border-t space-y-2.5 text-xs text-gray-500">
                <div className="flex items-start justify-between">
                  <span className="font-semibold text-gray-400 flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" /> Start Time
                  </span>
                  <span className="font-bold text-gray-700 text-right">
                    {new Date(viewEvent.startDate).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="block text-[11px] text-indigo-600 font-semibold mt-0.5">
                      at {new Date(viewEvent.startDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="font-semibold text-gray-400 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5" /> End Time
                  </span>
                  <span className="font-bold text-gray-700 text-right">
                    {new Date(viewEvent.endDate).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="block text-[11px] text-indigo-600 font-semibold mt-0.5">
                      at {new Date(viewEvent.endDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-gray-200 font-bold"
              onClick={() => setViewEvent(null)}
            >
              Close
            </Button>
            {canCreate && viewEvent && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 font-bold"
                  onClick={() => { openEdit(viewEvent); setViewEvent(null) }}
                >
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-xl font-bold"
                  onClick={() => { setDeleteEvent(viewEvent); setViewEvent(null) }}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Event Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!deleteEvent} onOpenChange={(o) => !o && setDeleteEvent(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight text-gray-900">
              Delete Event
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Are you sure you want to delete <strong>&quot;{deleteEvent?.title}&quot;</strong>? This action will remove it from all user portals and roadmaps.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-gray-200 font-bold"
              onClick={() => setDeleteEvent(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl font-bold"
              onClick={() => deleteEvent && deleteMutation.mutate(deleteEvent.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Deleting…</>
              ) : (
                'Delete Event'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
