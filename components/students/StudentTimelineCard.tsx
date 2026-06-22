'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { History } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface TimelineEntry {
  id: string
  action: string
  entityType: string
  changes: unknown
  timestamp: string
  user?: { email: string; role: string }
}

function formatChange(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return ''
  const c = changes as Record<string, unknown>
  const keys = Object.keys(c).slice(0, 3)
  return keys.map((k) => `${k}: ${String(c[k])}`).join(' · ')
}

export function StudentTimelineCard({ studentId }: { studentId: string }) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['student-timeline', studentId],
    queryFn: () => fetchApi<TimelineEntry[]>(`/api/students/${studentId}/timeline`),
  })

  const entries = Array.isArray(raw) ? raw : (raw as { data?: TimelineEntry[] })?.data ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-gray-600" />
          Activity timeline
        </CardTitle>
        <CardDescription className="text-xs">Recent admin actions on this student record.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-gray-500">No audit events yet.</p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id} className="text-xs border-l-2 border-blue-200 pl-3 py-1">
                <p className="font-semibold text-gray-800">
                  {e.action} · {e.entityType}
                </p>
                <p className="text-gray-500">
                  {new Date(e.timestamp).toLocaleString('en-PK')}
                  {e.user && ` · ${e.user.role}`}
                </p>
                {formatChange(e.changes) && (
                  <p className="text-gray-400 mt-0.5 truncate">{formatChange(e.changes)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
