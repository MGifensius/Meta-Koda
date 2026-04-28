import Link from 'next/link';
import { Building2, Users, ChevronRight } from 'lucide-react';
import { Topbar, Card } from '@buranchi/ui';
import { ROLE_LABELS } from '@buranchi/shared';
import { requireProfile } from '@/lib/auth/server';
import { ProfileForm } from './profile-form';
import type { ProfileSelfUpdate } from '@buranchi/shared';

interface SettingsLinkRowProps {
  href: '/settings/organization' | '/settings/users';
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SettingsLinkRow({ href, icon, title, description }: SettingsLinkRowProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-card-pad py-3.5 hover:bg-fg/5 transition-colors"
    >
      <div className="h-9 w-9 rounded-tile border border-border bg-surface flex items-center justify-center text-fg shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body-strong text-fg">{title}</p>
        <p className="text-[12px] text-muted truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted shrink-0" />
    </Link>
  );
}

export default async function SettingsPage() {
  const profile = await requireProfile();
  const defaults: ProfileSelfUpdate = {
    full_name: profile.full_name,
    ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
  };
  return (
    <>
      <Topbar breadcrumb="Workspace" title="Settings" />
      <div className="space-y-section-gap max-w-3xl">
        <section>
          <h2 className="text-title text-fg mb-3">Your profile</h2>
          <Card>
            <p className="text-body text-muted mb-4">
              Email: <span className="text-fg">{profile.email}</span> · Role: <span className="text-fg">{ROLE_LABELS[profile.role]}</span>
            </p>
            <ProfileForm defaults={defaults} />
          </Card>
        </section>
        {profile.role === 'admin' ? (
          <section>
            <h2 className="text-title text-fg mb-3">Organization &amp; users</h2>
            <div className="rounded-card bg-surface shadow-card divide-y divide-row-divider overflow-hidden">
              <SettingsLinkRow
                href="/settings/organization"
                icon={<Building2 className="h-4 w-4" />}
                title="Organization profile"
                description="Edit name, timezone, and logo"
              />
              <SettingsLinkRow
                href="/settings/users"
                icon={<Users className="h-4 w-4" />}
                title="Manage team"
                description="Invite members, change roles, suspend access"
              />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
