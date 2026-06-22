'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AcademicScopeState } from '@/lib/academic/types'

export type TeacherPickerMode = 'all' | 'scoped'

export interface TeacherOption {
  id: string
  firstName: string
  lastName: string
  designation: string
  employeeId?: string
  campus?: { name: string }
  batch?: { name: string }
  house?: { name: string }
}

interface TeacherPickerProps {
  value: string
  onValueChange: (teacherId: string) => void
  scope: Pick<AcademicScopeState, 'campusId' | 'batchId' | 'classId' | 'houseId' | 'shift'>
  mode: TeacherPickerMode
  onModeChange?: (mode: TeacherPickerMode) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  showModeToggle?: boolean
}

export function TeacherPicker({
  value,
  onValueChange,
  scope,
  mode,
  onModeChange,
  label = 'Teacher',
  placeholder = 'Select a teacher…',
  disabled = false,
  className = '',
  showModeToggle = true,
}: TeacherPickerProps) {
  const { data, isLoading } = useQuery({
    queryKey: [
      'teachers-for-selection',
      mode,
      scope.campusId,
      scope.batchId,
      scope.classId,
      scope.houseId,
      scope.shift,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ mode, limit: '500' })
      if (scope.campusId) params.set('campusId', scope.campusId)
      if (scope.batchId) params.set('batchId', scope.batchId)
      if (scope.classId) params.set('classId', scope.classId)
      if (scope.houseId) params.set('houseId', scope.houseId)
      if (scope.shift) params.set('shift', scope.shift)
      const res = await fetchApi<{ teachers: TeacherOption[]; total: number }>(
        `/api/teachers/for-selection?${params}`
      )
      return res.teachers ?? []
    },
    enabled: !disabled,
    staleTime: 60_000,
  })

  const teachers = data ?? []

  return (
    <div className={`space-y-2 ${className}`}>
      {showModeToggle && onModeChange && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onModeChange('scoped')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
              mode === 'scoped'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Matched to filters above
          </button>
          <button
            type="button"
            onClick={() => onModeChange('all')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
              mode === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All academy teachers
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-600">{label}</Label>
        <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled || isLoading}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoading
                  ? 'Loading teachers…'
                  : teachers.length === 0
                    ? mode === 'scoped'
                      ? 'No teachers matched — try “All academy teachers”'
                      : 'No teachers found'
                    : placeholder
              }
            />
          </SelectTrigger>
          <SelectContent>
            {teachers.length === 0 ? (
              <SelectItem value="__empty" disabled>
                {isLoading ? 'Loading…' : 'No teachers available'}
              </SelectItem>
            ) : (
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wide text-gray-500">
                  {mode === 'scoped' ? 'Matched teachers' : 'All teachers'} ({teachers.length})
                </SelectLabel>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} — {t.designation}
                    {t.batch?.name ? ` · ${t.batch.name}` : ''}
                    {t.house?.name ? ` · ${t.house.name}` : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-500">
          {mode === 'scoped'
            ? 'Teachers assigned to the selected class or matching campus/batch/house.'
            : 'All active teachers in the system (optionally filtered by campus above).'}
        </p>
      </div>
    </div>
  )
}
