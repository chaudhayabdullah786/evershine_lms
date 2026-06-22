'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { History, Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityEntry {
  id: string
  action: string
  entityType: string
  changes: unknown
  timestamp: string
  user?: { email: string; role: string }
}

interface ActivityLogCardProps {
  apiUrl: string
  title: string
  description: string
  emptyText?: string
}

function formatChange(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return ''
  const changeRecords = Object.entries(changes as Record<string, unknown>)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
  return changeRecords.join(' · ')
}

export function ActivityLogCard({ apiUrl, title, description, emptyText = 'No activity recorded yet.' }: ActivityLogCardProps) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['activity-log', apiUrl],
    queryFn: () => fetchApi<ActivityEntry[]>(apiUrl),
  })

  const entries = Array.isArray(raw) ? raw : (raw as { data?: ActivityEntry[] })?.data ?? []

  return (
    <Card className="border border-slate-200/90 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-slate-600" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs text-slate-500">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-3">
            <Sparkles className="w-8 h-8 text-slate-300" />
            <p>{emptyText}</p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto p-4">
            {entries.map((entry) => (
              <li key={entry.id} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-slate-300 transition-colors">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{entry.action}</span>
                    <span>• {entry.entityType}</span>
                    <span>• {new Date(entry.timestamp).toLocaleString('en-PK')}</span>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2">{formatChange(entry.changes) || 'Recorded action without details.'}</p>
                  {entry.user && (
                    <p className="text-[11px] text-slate-500">
                      By {entry.user.email} · {entry.user.role}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
