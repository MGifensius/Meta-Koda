'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Sidebar, SidebarLogo, SidebarSection, SidebarItem, SidebarFooter, UserAvatar } from '@buranchi/ui';
import { ROLE_LABELS } from '@buranchi/shared';
import { NAV_GROUPS } from '@/lib/nav/items';
import { signOutAction } from '@/lib/actions/auth';
import type { Profile } from '@/lib/auth/server';

export function AppSidebar({
  profile,
  organizationName,
  avatarSignedUrl,
}: {
  profile: Profile;
  organizationName: string;
  avatarSignedUrl: string | null;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  const [signingOut, startSignOut] = React.useTransition();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  function handleSignOut() {
    startSignOut(() => {
      void signOutAction();
    });
  }

  return (
    <Sidebar>
      <SidebarLogo>Buranchi</SidebarLogo>
      {NAV_GROUPS.map((group) => (
        <SidebarSection key={group.label} label={group.label}>
          {group.items.map((item) => {
            const Icon = item.icon;
            const isComingSoon = item.comingSoon === true;
            const active = mounted && !isComingSoon && pathname.startsWith(item.href);
            const node = (
              <SidebarItem
                icon={<Icon className="h-4 w-4" />}
                active={active}
                disabled={isComingSoon}
              >
                {item.label}
              </SidebarItem>
            );
            return isComingSoon ? (
              <div key={item.label}>{node}</div>
            ) : (
              <Link key={item.label} href={item.href} className="contents">
                {node}
              </Link>
            );
          })}
        </SidebarSection>
      ))}
      <SidebarFooter>
        <UserAvatar src={avatarSignedUrl} initials={profile.full_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-fg truncate">{profile.full_name}</p>
          <p className="text-[10px] text-muted truncate">
            {ROLE_LABELS[profile.role]} · {organizationName}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
          className="shrink-0 h-7 w-7 rounded-tile border border-transparent text-muted hover:text-fg hover:bg-canvas hover:border-row-divider transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
