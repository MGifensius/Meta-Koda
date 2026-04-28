import * as React from 'react';
import { cn } from '../lib/cn.js';

export function Topbar({ breadcrumb, title, actions }: { breadcrumb?: React.ReactNode; title: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between mb-section-gap')}>
      <div>
        {breadcrumb ? <div className="text-[12px] text-muted mb-1">{breadcrumb}</div> : null}
        <h1 className="text-title text-fg">{title}</h1>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
