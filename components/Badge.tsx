import { cn } from '@/lib/utils';


function formatStatus(status: string) {
  return status
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\w/g, (char) => char.toUpperCase())
}

function getStatusBadge(status: string) {
  const normalized = status.toUpperCase()
  if (['ACTIVE', 'APPROVED', 'PAID', 'PRESENT', 'COMPLETED', 'SUCCESS'].includes(normalized)) {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (['PENDING', 'DRAFT', 'IN_PROGRESS', 'UNDER_REVIEW'].includes(normalized)) {
    return 'bg-amber-100 text-amber-800'
  }
  if (['REJECTED', 'DECLINED', 'OVERDUE', 'FAILED', 'ABSENT', 'CANCELLED'].includes(normalized)) {
    return 'bg-red-100 text-red-800'
  }
  return 'bg-slate-100 text-slate-700'
}

interface BadgeProps {
  status: string;
  className?: string;
}

export default function Badge({ status, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', getStatusBadge(status), className)}>
      {formatStatus(status)}
    </span>
  );
}
