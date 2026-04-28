import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../lib/cn';

export interface TopbarProps {
  breadcrumb?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  /** If provided, renders a left-arrow icon-button as a Link to this path. */
  backHref?: string;
  /** Optional callback when back button is clicked (overrides backHref behavior). */
  onBack?: () => void;
}

export function Topbar({ breadcrumb, title, actions, backHref, onBack }: TopbarProps) {
  return (
    <div className={cn('flex items-start justify-between mb-section-gap')}>
      <div className="flex items-start gap-3">
        {(backHref || onBack) ? (
          <BackButton href={backHref} onClick={onBack} />
        ) : null}
        <div>
          {breadcrumb ? <div className="text-[12px] text-muted mb-1">{breadcrumb}</div> : null}
          <h1 className="text-title text-fg">{title}</h1>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function BackButton({ href, onClick }: { href?: string | undefined; onClick?: (() => void) | undefined }) {
  const className =
    'h-8 w-8 inline-flex items-center justify-center rounded-tile border border-border bg-surface text-fg hover:bg-canvas transition-colors mt-1 shrink-0';
  if (onClick) {
    return (
      <button type="button" aria-label="Back" onClick={onClick} className={className}>
        <ArrowLeft className="h-4 w-4" />
      </button>
    );
  }
  return (
    <a href={href} aria-label="Back" className={className}>
      <ArrowLeft className="h-4 w-4" />
    </a>
  );
}
