import * as React from 'react';
import { cn } from '../lib/cn.js';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-row-divider', className)} />;
}
