import * as React from 'react';
import * as Label from '@radix-ui/react-label';
import { cn } from '../lib/cn';

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ id, label, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label.Root htmlFor={id} className="text-[12px] font-medium text-fg">
        {label}{required ? <span className="text-danger ml-0.5">*</span> : null}
      </Label.Root>
      {children}
      {error ? (
        <p className="text-[11px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
