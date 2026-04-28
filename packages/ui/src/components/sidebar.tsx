'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';

export function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside className={cn('w-[220px] shrink-0 border-r border-row-divider bg-surface flex flex-col', className)}>
      {children}
    </aside>
  );
}

export function SidebarLogo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('font-bold text-[15px] px-3.5 pt-4 pb-3', className)}>{children}</div>;
}

export function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 mt-2">
      <p className="text-label text-muted uppercase px-3 pb-1">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  href?: string;
}

export function SidebarItem({ icon, active, disabled, children, className, ...rest }: SidebarItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-input text-[13px] transition-colors',
        active && 'bg-fg text-white font-medium',
        !active && !disabled && 'text-fg hover:bg-canvas cursor-pointer',
        disabled && 'text-border cursor-not-allowed',
        className,
      )}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      <span className={cn('inline-flex h-4 w-4 items-center justify-center', active ? 'text-white' : disabled ? 'text-border' : 'text-muted')}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export function SidebarFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-auto border-t border-row-divider px-3 py-3 flex items-center gap-2.5', className)}>{children}</div>;
}
