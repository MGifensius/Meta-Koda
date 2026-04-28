import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-tile font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-surface text-fg border border-fg hover:bg-canvas',
        accent: 'bg-accent text-white hover:bg-accent/90',
        outline: 'bg-surface text-fg border border-border hover:bg-canvas',
        ghost: 'bg-transparent text-fg hover:bg-canvas',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 px-3 text-[11px]',
        md: 'h-8 px-3 text-[11px]',
        lg: 'h-8 px-3 text-[11px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonStyles({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
