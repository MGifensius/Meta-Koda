'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sidebar, SidebarLogo, SidebarSection, SidebarItem, SidebarFooter, UserAvatar } from '@buranchi/ui';
import { ROLE_LABELS } from '@buranchi/shared';
import { NAV_GROUPS } from '@/lib/nav/items';
import type { Profile } from '@/lib/auth/server';

export function AppSidebar({ profile, organizationName }: { profile: Profile; organizationName: string }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarLogo>Buranchi</SidebarLogo>
      {NAV_GROUPS.map((group) => (
        <SidebarSection key={group.label} label={group.label}>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = !item.comingSoon && pathname.startsWith(item.href);
            const node = (
              <SidebarItem icon={<Icon className="h-4 w-4" />} active={active} disabled={item.comingSoon}>
                {item.label}
              </SidebarItem>
            );
            return item.comingSoon ? (
              <div key={item.label}>{node}</div>
            ) : (
              <Link key={item.label} href={item.href} className="contents">{node}</Link>
            );
          })}
        </SidebarSection>
      ))}
      <SidebarFooter>
        <UserAvatar initials={profile.full_name} size="sm" />
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-fg truncate">{profile.full_name}</p>
          <p className="text-[10px] text-muted truncate">{ROLE_LABELS[profile.role]} · {organizationName}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
