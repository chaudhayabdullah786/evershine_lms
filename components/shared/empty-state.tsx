'use client';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-8 px-4' : 'py-16 px-8',
      className
    )}>
      {Icon && (
        <div className={cn(
          'rounded-2xl bg-gray-100 flex items-center justify-center mb-4',
          compact ? 'w-12 h-12' : 'w-16 h-16'
        )}>
          <Icon className={cn('text-gray-400', compact ? 'w-6 h-6' : 'w-8 h-8')} />
        </div>
      )}
      <h3 className={cn('font-semibold text-gray-900 mb-1', compact ? 'text-base' : 'text-lg')}>
        {title}
      </h3>
      {description && (
        <p className={cn('text-gray-500 max-w-sm', compact ? 'text-sm' : 'text-base mb-4')}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
