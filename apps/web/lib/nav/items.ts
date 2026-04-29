import {
  LayoutGrid,
  Map,
  Users,
  Calendar,
  Sparkles,
  MessageCircle,
  Star,
  Megaphone,
  Settings,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '@buranchi/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  comingSoon?: boolean;
  adminOnly?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
      { label: 'Floor', href: '/floor', icon: Map },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Bookings', href: '/bookings', icon: Calendar },
      { label: 'Koda', href: '/koda', icon: Sparkles },
    ],
  },
  {
    label: 'Coming Soon',
    items: [
      { label: 'WhatsApp', href: '#', icon: MessageCircle, comingSoon: true },
      { label: 'Loyalty', href: '#', icon: Star, comingSoon: true },
      { label: 'Marketing', href: '#', icon: Megaphone, comingSoon: true },
    ],
  },
  {
    label: 'Settings',
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];

export function visibleNavGroups(role: UserRole) {
  void role;
  return NAV_GROUPS;
}
