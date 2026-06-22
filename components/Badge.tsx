import { getStatusBadge, formatStatus } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
