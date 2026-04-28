import * as React from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import { cn } from '../lib/cn';

export interface AvatarProps {
  src?: string | null;
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-[12px]', lg: 'h-12 w-12 text-[14px]' };

export function UserAvatar({ src, initials, size = 'md', className }: AvatarProps) {
  return (
    <Avatar.Root className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent font-semibold', sizeMap[size], className)}>
      {src ? <Avatar.Image src={src} alt="" className="h-full w-full object-cover" /> : null}
      <Avatar.Fallback>{initials.slice(0, 2).toUpperCase()}</Avatar.Fallback>
    </Avatar.Root>
  );
}
