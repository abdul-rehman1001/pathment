'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

interface ErrorStateProps {
  message?: string;
  /** Show a retry button - pass the refetch callback */
  onRetry?: () => void;
  /** Compact inline variant vs full-page centred variant */
  variant?: 'inline' | 'page';
  className?: string;
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  variant = 'inline',
  className,
}: ErrorStateProps) {
  if (variant === 'page') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-4 py-20 text-center',
          className
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        )}
      </div>
    );
  }

  // inline (default) - banner style, great inside table wrappers
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3',
        className
      )}
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
      <p className="flex-1 text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="flex-shrink-0 h-7 border-destructive/30 text-destructive
                     hover:bg-destructive/10"
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  );
}
