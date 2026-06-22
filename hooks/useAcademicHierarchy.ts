'use client'

import { useMemo, useCallback, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import {
  filterClassesByScope,
  sortClasses,
  ACADEMIC_NONE,
  isAdminAcademicScopeReady,
  performanceHouseRequired,
} from '@/lib/academic/hierarchy'
import type {
  AcademicBatch,
  AcademicCampus,
  AcademicClassRecord,
  AcademicHouse,
  AcademicScopeState,
} from '@/lib/academic/types'
import type { SessionShift } from '@/lib/validation/shift'

export type AcademicHierarchyMode = 'admin' | 'teacher'

export interface UseAcademicHierarchyOptions {
  /** admin = all classes via /api/classes; teacher = assigned classes only */
  mode?: AcademicHierarchyMode
  /** Initial scope values */
  initial?: Partial<AcademicScopeState>
  /** Whether to load campuses/batches (false for teacher-only narrow views) */
  loadCampuses?: boolean
  enabled?: boolean
}

export interface UseAcademicHierarchyReturn {
  campuses: AcademicCampus[]
  batches: AcademicBatch[]
  houses: AcademicHouse[]
  allClasses: AcademicClassRecord[]
  filteredClasses: AcademicClassRecord[]
  scope: AcademicScopeState
  setCampusId: (id: string) => void
  setBatchId: (id: string) => void
  setShift: (shift: SessionShift) => void
  setClassId: (id: string) => void
  setHouseId: (id: string) => void
  resetScope: (partial?: Partial<AcademicScopeState>) => void
  isLoadingCampuses: boolean
  isLoadingBatches: boolean
  isLoadingHouses: boolean
  isLoadingClasses: boolean
  hasHouses: boolean
  houseRequired: boolean
  scopeReady: boolean
  selectedClass: AcademicClassRecord | undefined
}

export function useAcademicHierarchy(
  scope: AcademicScopeState,
  setScope: Dispatch<SetStateAction<AcademicScopeState>>,
  options: UseAcademicHierarchyOptions = {}
): UseAcademicHierarchyReturn {
  const {
    mode = 'admin',
    loadCampuses = true,
    enabled = true,
  } = options

  const { campusId, batchId, shift, classId, houseId } = scope

  const { data: campusesRaw, isLoading: isLoadingCampuses } = useQuery({
    queryKey: ['academic-hierarchy', 'campuses'],
    queryFn: async () => {
      const res = await fetchPaginatedApi<AcademicCampus>('/api/campuses?limit=50')
      return res.data
    },
    enabled: enabled && loadCampuses && mode === 'admin',
    staleTime: 10 * 60 * 1000,
  })
  const campuses = Array.isArray(campusesRaw) ? campusesRaw : []

  const { data: batchesRaw, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['academic-hierarchy', 'batches', campusId],
    queryFn: async () => {
      const res = await fetchPaginatedApi<AcademicBatch>(
        `/api/batches?campusId=${campusId}&limit=50`
      )
      return res.data
    },
    enabled: enabled && !!campusId && mode === 'admin',
    staleTime: 5 * 60 * 1000,
  })
  const batches = Array.isArray(batchesRaw) ? batchesRaw : []

  const { data: housesRaw, isLoading: isLoadingHouses } = useQuery({
    queryKey: ['academic-hierarchy', 'houses', batchId],
    queryFn: () => fetchApi<AcademicHouse[]>(`/api/houses?batchId=${batchId}`),
    enabled: enabled && !!batchId,
    staleTime: 5 * 60 * 1000,
  })
  const houses = Array.isArray(housesRaw) ? housesRaw : []
  const hasHouses = houses.length > 0
  const houseRequired = performanceHouseRequired(hasHouses)
  const scopeReady =
    mode === 'teacher'
      ? true
      : isAdminAcademicScopeReady({ campusId, batchId, houseId }, hasHouses)

  const classesQueryKey =
    mode === 'teacher'
      ? ['teacher-portal-classes', shift]
      : ['classes', campusId, batchId, shift]

  const { data: classesRaw, isLoading: isLoadingClasses } = useQuery({
    queryKey: mode === 'teacher'
      ? ['academic-hierarchy', 'teacher-classes', shift]
      : ['academic-hierarchy', 'classes', campusId, batchId, shift],
    queryFn: async () => {
      if (mode === 'teacher') {
        const url = shift
          ? `/api/teacher-portal/classes?shift=${shift}`
          : '/api/teacher-portal/classes'
        return fetchApi<AcademicClassRecord[]>(url)
      }
      let url = '/api/classes?limit=200'
      if (campusId) url += `&campusId=${campusId}`
      if (batchId) url += `&batchId=${batchId}`
      if (shift) url += `&shift=${shift}`
      const res = await fetchPaginatedApi<AcademicClassRecord>(url)
      return res.data
    },
  // Admin: classes load only after campus + batch (houses load in parallel for the batch)
    enabled: enabled && (mode === 'teacher' || (!!campusId && !!batchId)),
    staleTime: 3 * 60 * 1000,
  })

  const allClasses = useMemo(() => {
    const list = Array.isArray(classesRaw) ? classesRaw : []
    if (mode === 'teacher') {
      return sortClasses(
        filterClassesByScope(list, {
          campusId: campusId || undefined,
          batchId: batchId || undefined,
          shift,
        })
      )
    }
    return sortClasses(list)
  }, [classesRaw, mode, campusId, batchId, shift])

  const filteredClasses = allClasses

  const selectedClass = filteredClasses.find((c) => c.id === classId)

  const setCampusId = useCallback(
    (id: string) => {
      setScope((s) => ({
        ...s,
        campusId: id,
        batchId: '',
        classId: '',
        houseId: '',
      }))
    },
    [setScope]
  )

  const setBatchId = useCallback(
    (id: string) => {
      setScope((s) => ({
        ...s,
        batchId: id,
        classId: '',
        houseId: '',
      }))
    },
    [setScope]
  )

  const setShift = useCallback(
    (newShift: SessionShift) => {
      setScope((s) => ({ ...s, shift: newShift, classId: '' }))
    },
    [setScope]
  )

  const setClassId = useCallback(
    (id: string) => {
      setScope((s) => ({ ...s, classId: id }))
    },
    [setScope]
  )

  const setHouseId = useCallback(
    (id: string) => {
      setScope((s) => ({
        ...s,
        houseId: id === ACADEMIC_NONE ? '' : id,
      }))
    },
    [setScope]
  )

  const resetScope = useCallback(
    (partial?: Partial<AcademicScopeState>) => {
      setScope((s) => ({ ...s, ...partial }))
    },
    [setScope]
  )

  return {
    campuses,
    batches,
    houses,
    allClasses,
    filteredClasses,
    scope,
    setCampusId,
    setBatchId,
    setShift,
    setClassId,
    setHouseId,
    resetScope,
    isLoadingCampuses,
    isLoadingBatches,
    isLoadingHouses,
    isLoadingClasses,
    hasHouses,
    houseRequired,
    scopeReady,
    selectedClass,
  }
}
