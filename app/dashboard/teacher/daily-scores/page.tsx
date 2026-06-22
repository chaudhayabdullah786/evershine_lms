'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { notify } from '@/lib/notify'
import { Loader2, Save, Target, AlertCircle, Sparkles, UserX, UserCheck, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SubjectOffering {
  id: string
  maxDailyScore: number
  subject: {
    id: string
    name: string
    code: string
  }
  classSection: {
    id: string
    className: string
    sectionName: string
  }
}

interface RosterStudent {
  studentId: string
  rollNumber: string
  name: string
  score: number | null
  isAbsent: boolean
  remarks: string
}

export default function DailyScoresPage() {
  const queryClient = useQueryClient()
  const [selectedOfferingId, setSelectedOfferingId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString('en-CA') // YYYY-MM-DD format in local timezone
  )
  const [rosterState, setRosterState] = useState<Record<string, { score: string; isAbsent: boolean; remarks: string }>>({})

  // Fetch teacher's subject offerings
  const { data: offerings = [], isLoading: isLoadingOfferings } = useQuery<SubjectOffering[]>({
    queryKey: ['teacher-subject-offerings'],
    queryFn: () => fetchApi<SubjectOffering[]>('/api/teacher-portal/subject-offerings'),
  })

  // Set default offering if none selected
  if (offerings.length > 0 && !selectedOfferingId) {
    setSelectedOfferingId(offerings[0].id)
  }

  // Fetch roster & existing scores for selected offering and date
  // WHY separate state: API now returns { maxDailyScore, roster } instead of bare array.
  // We track the server-reported max separately so score entry stays in sync.
  const [serverMaxScore, setServerMaxScore] = useState<number | null>(null)

  const { data: roster = [], isLoading: isLoadingRoster, refetch } = useQuery<RosterStudent[]>({
    queryKey: ['daily-scores-roster', selectedOfferingId, selectedDate],
    queryFn: async () => {
      const response = await fetchApi<{ maxDailyScore: number; roster: RosterStudent[] }>(
        `/api/academic-upgrades/daily-performance?subjectOfferingId=${selectedOfferingId}&date=${selectedDate}`
      )
      setServerMaxScore(response.maxDailyScore)
      const data = response.roster
      // Initialize editing state with database records
      const initial: Record<string, { score: string; isAbsent: boolean; remarks: string }> = {}
      data.forEach((s) => {
        initial[s.studentId] = {
          score: s.score !== null ? s.score.toString() : '',
          isAbsent: s.isAbsent,
          remarks: s.remarks,
        }
      })
      setRosterState(initial)
      return data
    },
    enabled: !!selectedOfferingId && !!selectedDate,
  })

  // Save scores mutation
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/academic-upgrades/daily-performance', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Daily performance scores saved successfully')
      queryClient.invalidateQueries({ queryKey: ['daily-scores-roster', selectedOfferingId, selectedDate] })
      refetch()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to save daily scores')
    },
  })

  const selectedOffering = offerings.find((o) => o.id === selectedOfferingId)

  // Resolve maxDailyScore: prefer server-reported value, then offering field, fallback 20
  const maxDailyScore = serverMaxScore
    ?? selectedOffering?.maxDailyScore
    ?? 20

  const handleScoreChange = (studentId: string, val: string) => {
    // Basic sanitization — allow empty string or float/integer within bounds
    if (val === '') {
      setRosterState((prev) => ({
        ...prev,
        [studentId]: { ...prev[studentId], score: '' },
      }))
      return
    }

    const num = parseFloat(val)
    if (isNaN(num)) return

    // Limit between 0 and the offering's configurable max
    if (num < 0 || num > maxDailyScore) {
      notify.error(`Score must be between 0 and ${maxDailyScore}`)
      return
    }

    setRosterState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], score: val },
    }))
  }

  const handleAbsentChange = (studentId: string, checked: boolean) => {
    setRosterState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        isAbsent: checked,
        // If absent, reset score visually, though backend will ignore/set to 0
        score: checked ? '' : prev[studentId]?.score || '',
      },
    }))
  }

  const handleRemarksChange = (studentId: string, val: string) => {
    setRosterState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks: val,
      },
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOfferingId) return

    // Map records to matches backend validation expectations
    const records = roster.map((s) => {
      const state = rosterState[s.studentId] || { score: '', isAbsent: false, remarks: '' }
      const isAbsent = state.isAbsent
      let scoreVal = 0

      if (!isAbsent) {
        const num = parseFloat(state.score)
        if (state.score === '' || isNaN(num)) {
          throw new Error(`Please enter valid score for ${s.name} or mark them as absent.`)
        }
        scoreVal = num
      }

      return {
        studentId: s.studentId,
        score: scoreVal,
        isAbsent,
        remarks: state.remarks.trim() || undefined,
      }
    })

    saveMutation.mutate({
      subjectOfferingId: selectedOfferingId,
      date: selectedDate,
      records,
    })
  }

  // Roster summaries
  const totalCount = roster.length
  const absentCount = Object.values(rosterState).filter((v) => v.isAbsent).length
  const presentCount = totalCount - absentCount

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" />
            Daily Academic Score Entry
          </h1>
          <p className="text-sm text-gray-500">Record daily academic progress scores out of {maxDailyScore} marks.</p>
        </div>
      </div>

      {/* Select Filters */}
      <Card className="border-indigo-100 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Subject & Section</label>
              {isLoadingOfferings ? (
                <div className="h-10 bg-gray-100 rounded-md animate-pulse" />
              ) : (
                <Select value={selectedOfferingId} onValueChange={setSelectedOfferingId}>
                  <SelectTrigger className="w-full border-gray-200">
                    <SelectValue placeholder="Select class & subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {offerings.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.classSection.className} - {o.classSection.sectionName} ({o.subject.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Evaluation Date</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border-gray-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedOfferingId ? (
        <Card className="p-8 text-center border-dashed border-gray-300">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No subject offerings assigned. Verify database configuration.</p>
        </Card>
      ) : isLoadingRoster ? (
        <div className="flex flex-col items-center gap-2 text-gray-500 py-16 justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-sm">Fetching student roster & scores...</span>
        </div>
      ) : roster.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">No active students enrolled in this section.</p>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quick Stats Banner */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-slate-50/50 border-slate-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-600">Total Enrolled</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{totalCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-green-50/50 border-green-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-700">Marked Present</p>
                  <p className="text-xl font-bold text-green-900 mt-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-green-600" />
                    {presentCount}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-rose-50/50 border-rose-100">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-rose-700">Marked Absent</p>
                  <p className="text-xl font-bold text-rose-900 mt-1 flex items-center gap-1.5">
                    <UserX className="w-4 h-4 text-rose-600" />
                    {absentCount}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="bg-gray-50 border-b py-4 px-6">
              <CardTitle className="text-base text-gray-900 flex justify-between items-center">
                <span className="flex items-center gap-2 font-semibold">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Roster Score Sheet
                </span>
                <span className="text-xs font-normal text-gray-500 flex items-center gap-1.5">
                  Maximum Score: {maxDailyScore}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                        Max score is configured per subject offering by the admin in the Academic Engine.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-full divide-y divide-gray-200">
                <TableHeader className="bg-gray-100/75">
                  <TableRow>
                    <TableHead className="w-[100px] font-bold text-center">Roll No</TableHead>
                    <TableHead className="font-bold">Student Name</TableHead>
                    <TableHead className="w-[120px] font-bold text-center">Absent</TableHead>
                    <TableHead className="w-[160px] font-bold text-center">Obtained Score (0-{maxDailyScore})</TableHead>
                    <TableHead className="font-bold">Remarks / Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-200">
                  {roster.map((row) => {
                    const state = rosterState[row.studentId] || { score: '', isAbsent: false, remarks: '' }
                    return (
                      <TableRow key={row.studentId} className={state.isAbsent ? 'bg-rose-50/20' : 'hover:bg-gray-50/50'}>
                        <TableCell className="text-center font-mono font-medium text-sm text-gray-600">
                          {row.rollNumber}
                        </TableCell>
                        <TableCell className={`font-semibold ${state.isAbsent ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {row.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={state.isAbsent}
                              onCheckedChange={(checked) => handleAbsentChange(row.studentId, !!checked)}
                              className="border-rose-300 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max={maxDailyScore}
                            step="0.5"
                            value={state.score}
                            disabled={state.isAbsent}
                            placeholder={state.isAbsent ? 'ABSENT' : `0.0 - ${maxDailyScore}.0`}
                            onChange={(e) => handleScoreChange(row.studentId, e.target.value)}
                            className="w-32 mx-auto text-center font-bold text-indigo-700 bg-white border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            placeholder="Optional performance remarks..."
                            value={state.remarks}
                            onChange={(e) => handleRemarksChange(row.studentId, e.target.value)}
                            className="w-full border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="gap-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Score Sheet
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
