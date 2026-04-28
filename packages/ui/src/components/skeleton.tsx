import * as React from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-row-divider', className)} />;
}
