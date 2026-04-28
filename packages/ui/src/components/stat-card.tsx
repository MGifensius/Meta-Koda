import * as React from 'react';
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../lib/cn.js';

interface StatCardBaseProps {
  title: string;
  qualifier?: string;
  value: React.ReactNode;
  delta?: { direction: 'up' | 'down'; value: string; context?: string } | null;
  className?: string;
}

export function StatCardTrend(props: StatCardBaseProps & { trend: 'up' | 'down' }) {
  const Icon = props.trend === 'up' ? TrendingUp : TrendingDown;
  return (
    <Card {...props}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-tile border border-border', props.trend === 'up' ? 'text-success' : 'text-danger')}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
    </Card>
  );
}

export function StatCardCategory(props: StatCardBaseProps & { icon: React.ReactNode }) {
  return (
    <Card {...props}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile border border-border text-fg">
        {props.icon}
      </div>
    </Card>
  );
}

function Card({ title, qualifier, value, delta, className, children }: StatCardBaseProps & { children: React.ReactNode }) {
  return (
    <div className={cn('rounded-card bg-surface p-card-pad shadow-card', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-fg m-0">
            {title}{qualifier ? <span className="text-muted font-normal"> / {qualifier}</span> : null}
          </p>
          <p className="text-display text-fg mt-3.5 mb-2">{value}</p>
          {delta ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <span className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded', delta.direction === 'up' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                {delta.direction === 'up' ? <ArrowUp className="h-2.5 w-2.5" strokeWidth={3} /> : <ArrowDown className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className={cn('font-medium', delta.direction === 'up' ? 'text-success' : 'text-danger')}>{delta.value}</span>
              {delta.context ? <span>{delta.context}</span> : null}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
