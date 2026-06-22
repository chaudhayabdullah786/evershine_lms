'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { performanceHouseRequired } from '@/lib/academic/hierarchy'
import type { AcademicBatch, AcademicCampus, AcademicHouse } from '@/lib/academic/types'

export interface CampusBatchHouseFieldsProps {
  campusId: string
  batchId: string
  houseId: string
  campuses: AcademicCampus[]
  batches: AcademicBatch[]
  houses: AcademicHouse[]
  onCampusChange: (campusId: string) => void
  onBatchChange: (batchId: string) => void
  onHouseChange: (houseId: string) => void
  isLoadingBatches?: boolean
  isLoadingHouses?: boolean
  campusError?: string
  batchError?: string
  houseError?: string
  /** Hide campus when already fixed (e.g. single-campus admin) */
  showCampus?: boolean
  className?: string
}

/**
 * Standalone Campus → Batch → Performance House trio for forms (teachers, admissions).
 * Matches AcademicScopeFilters rules: batch required; house required when batch has houses.
 */
export function CampusBatchHouseFields({
  campusId,
  batchId,
  houseId,
  campuses,
  batches,
  houses,
  onCampusChange,
  onBatchChange,
  onHouseChange,
  isLoadingBatches = false,
  isLoadingHouses = false,
  campusError,
  batchError,
  houseError,
  showCampus = true,
  className = '',
}: CampusBatchHouseFieldsProps) {
  const hasHouses = houses.length > 0
  const houseRequired = performanceHouseRequired(hasHouses)

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {showCampus && (
        <div className="space-y-1.5">
          <Label>Campus *</Label>
          <Select value={campusId || undefined} onValueChange={onCampusChange}>
            <SelectTrigger className={campusError ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select campus" />
            </SelectTrigger>
            <SelectContent>
              {campuses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {campusError && <p className="text-xs text-destructive">{campusError}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Batch *</Label>
        <Select
          value={batchId || undefined}
          disabled={!campusId || isLoadingBatches}
          onValueChange={onBatchChange}
        >
          <SelectTrigger className={batchError ? 'border-destructive' : ''}>
            <SelectValue
              placeholder={
                !campusId
                  ? 'Select campus first'
                  : isLoadingBatches
                    ? 'Loading batches…'
                    : 'Select batch'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {batches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {batchError && <p className="text-xs text-destructive">{batchError}</p>}
      </div>

      {batchId && (
        <div className="space-y-1.5 md:col-span-2">
          <Label>
            Performance House {houseRequired ? '*' : ''}
          </Label>
          {isLoadingHouses ? (
            <p className="text-xs text-gray-400">Loading performance houses…</p>
          ) : hasHouses ? (
            <Select
              value={houseId || undefined}
              onValueChange={onHouseChange}
            >
              <SelectTrigger className={houseError ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select performance house" />
              </SelectTrigger>
              <SelectContent>
                {houses.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.color ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full border"
                          style={{ backgroundColor: h.color }}
                        />
                        {h.name}
                      </span>
                    ) : (
                      h.name
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
              No performance houses are configured for this batch. You can continue without a house selection.
            </p>
          )}
          {houseError && <p className="text-xs text-destructive">{houseError}</p>}
        </div>
      )}
    </div>
  )
}
