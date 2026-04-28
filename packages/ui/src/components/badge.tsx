import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeStyles = cva(
  'inline-flex items-center rounded-pill px-2.5 py-0.5 text-[10px] font-semibold tracking-wide',
  {
    variants: {
      variant: {
        neutral: 'bg-row-divider text-muted',
        accent: 'bg-accent-soft text-accent',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
        solid: 'bg-fg text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeStyles> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeStyles({ variant }), className)} {...props} />;
}
