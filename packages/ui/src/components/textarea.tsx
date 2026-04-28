import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[80px] w-full rounded-input border border-border bg-surface px-3 py-2 text-[11px] text-fg placeholder:text-muted',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
