import * as React from 'react';
import { cn } from '../lib/cn.js';

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}>
      {icon ? <div className="h-12 w-12 rounded-tile bg-canvas flex items-center justify-center text-muted">{icon}</div> : null}
      <p className="text-body-strong text-fg">{title}</p>
      {description ? <p className="text-body text-muted max-w-md">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
