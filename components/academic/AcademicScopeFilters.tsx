'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import type { UseAcademicHierarchyReturn } from '@/hooks/useAcademicHierarchy'

export interface AcademicScopeFiltersProps {
  hierarchy: UseAcademicHierarchyReturn
  /** Show campus + batch + performance house selectors (admin workflows) */
  showCampusBatch?: boolean
  /** Show performance house (always paired with batch when true) */
  showHouse?: boolean
  /** Show morning/evening session */
  showShift?: boolean
  /** Show class dropdown */
  showClass?: boolean
  className?: string
  compact?: boolean
  onScopeChange?: () => void
  /** When false (e.g. teacher portal), class dropdown does not require full admin scope */
  requireCampusForClass?: boolean
}

/**
 * Campus → Batch → Performance House → Session → Class
 * Batch is required wherever shown. Performance house is required when the batch has houses.
 */
export function AcademicScopeFilters({
  hierarchy,
  showCampusBatch = true,
  showHouse = true,
  showShift = true,
  showClass = true,
  className = '',
  compact = false,
  onScopeChange,
  requireCampusForClass = true,
}: AcademicScopeFiltersProps) {
  const {
    campuses,
    batches,
    houses,
    filteredClasses,
    scope,
    setCampusId,
    setBatchId,
    setShift,
    setClassId,
    setHouseId,
    isLoadingCampuses,
    isLoadingBatches,
    isLoadingHouses,
    isLoadingClasses,
    hasHouses,
    houseRequired,
    scopeReady,
  } = hierarchy

  const campusOptions = Array.isArray(campuses) ? campuses : []
  const batchOptions = Array.isArray(batches) ? batches : []
  const houseOptions = Array.isArray(houses) ? houses : []
  const classOptions = Array.isArray(filteredClasses) ? filteredClasses : []

  const notify = () => onScopeChange?.()

  const classBlocked =
    requireCampusForClass && !scopeReady

  const gridCols = compact
    ? 'grid-cols-1 sm:grid-cols-2'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return (
    <div className={`space-y-3 ${className}`}>
      <div className={`grid ${gridCols} gap-3`}>
        {showCampusBatch && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Campus *</Label>
              <Select
                value={scope.campusId || undefined}
                onValueChange={(v) => {
                  setCampusId(v)
                  notify()
                }}
                disabled={isLoadingCampuses}
              >
                <SelectTrigger className={compact ? 'h-9' : ''}>
                  <SelectValue placeholder={isLoadingCampuses ? 'Loading…' : 'Select campus'} />
                </SelectTrigger>
                <SelectContent>
                  {campusOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Batch *</Label>
              <Select
                value={scope.batchId || undefined}
                disabled={!scope.campusId || isLoadingBatches}
                onValueChange={(v) => {
                  setBatchId(v)
                  notify()
                }}
              >
                <SelectTrigger className={compact ? 'h-9' : ''}>
                  <SelectValue
                    placeholder={
                      !scope.campusId
                        ? 'Select campus first'
                        : isLoadingBatches
                          ? 'Loading batches…'
                          : 'Select batch'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {batchOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showHouse && scope.batchId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">
                  Performance House {houseRequired ? '*' : ''}
                </Label>
                {isLoadingHouses ? (
                  <p className="text-xs text-gray-400 py-2">Loading houses…</p>
                ) : hasHouses ? (
                  <Select
                    value={scope.houseId || undefined}
                    disabled={!scope.batchId}
                    onValueChange={(v) => {
                      setHouseId(v)
                      notify()
                    }}
                  >
                    <SelectTrigger className={compact ? 'h-9' : ''}>
                      <SelectValue placeholder="Select performance house" />
                    </SelectTrigger>
                    <SelectContent>
                      {houseOptions.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-[10px] text-gray-500 leading-snug">
                    No performance houses for this batch.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {showShift && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Session *</Label>
            <Select
              value={scope.shift}
              disabled={classBlocked}
              onValueChange={(v) => {
                setShift(v as typeof scope.shift)
                notify()
              }}
            >
              <SelectTrigger className={compact ? 'h-9' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">{SESSION_SHIFT_LABELS.MORNING}</SelectItem>
                <SelectItem value="EVENING">{SESSION_SHIFT_LABELS.EVENING}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showClass && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Class *</Label>
            <Select
              value={scope.classId || undefined}
              disabled={classBlocked || isLoadingClasses || classOptions.length === 0}
              onValueChange={(v) => {
                setClassId(v)
                notify()
              }}
            >
              <SelectTrigger className={compact ? 'h-9' : ''}>
                <SelectValue
                  placeholder={
                    classBlocked
                      ? !scope.batchId
                        ? 'Select batch first'
                        : houseRequired && !scope.houseId
                          ? 'Select performance house first'
                          : 'Complete campus & batch first'
                      : isLoadingClasses
                        ? 'Loading classes…'
                        : classOptions.length === 0
                          ? 'No classes for this scope'
                          : 'Select class'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.section ? ` (${c.section})` : ''}
                    {c.batch?.name ? ` · ${c.batch.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {showCampusBatch && requireCampusForClass && scope.campusId && scope.batchId && (
        <p className="text-[10px] text-gray-500">
          Selecting a batch loads performance houses and classes for that campus.{' '}
          {houseRequired
            ? 'Choose a performance house before selecting a class.'
            : 'This batch has no performance houses — proceed to session and class.'}
        </p>
      )}
    </div>
  )
}
