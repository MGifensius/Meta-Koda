import Link from 'next/link';
import { Building2, Users, Grid3x3, Sparkles, ChevronRight } from 'lucide-react';
import { Topbar } from '@buranchi/ui';
import { ROLE_LABELS } from '@buranchi/shared';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { AvatarUpload } from '@/components/avatar-upload';
import type { ProfileSelfUpdate } from '@buranchi/shared';

const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

export default async function SettingsPage() {
  const profile = await requireProfile();
  const defaults: ProfileSelfUpdate = {
    full_name: profile.full_name,
  };

  // profiles.avatar_url stores a storage PATH; convert to a signed URL for rendering.
  let initialSignedUrl: string | null = null;
  if (profile.avatar_url) {
    const supabase = await createServerClient();
    const { data } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_url, AVATAR_SIGNED_URL_TTL_SECONDS);
    initialSignedUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="max-w-3xl">
      <Topbar breadcrumb="Workspace" title="Account settings" />

      <div className="rounded-card bg-surface shadow-card divide-y divide-row-divider overflow-hidden">
        <Section
          eyebrow="My profile"
          title="Personal information"
          description="How you appear inside Buranchi."
        >
          <AvatarUpload
            userId={profile.id}
            initialPath={profile.avatar_url}
            initialSignedUrl={initialSignedUrl}
            initials={profile.full_name}
          />
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            <Field label="Email" value={profile.email ?? <span className="text-border">—</span>} />
            <Field label="Role" value={ROLE_LABELS[profile.role]} />
          </div>
          <div className="mt-6">
            <ProfileForm defaults={defaults} />
          </div>
        </Section>

        {profile.role === 'admin' ? (
          <Section
            eyebrow="Workspace"
            title="Organization & team"
            description="Manage Buranchi-wide settings and team members."
          >
            <div className="rounded-input border border-row-divider divide-y divide-row-divider overflow-hidden">
              <SettingsLinkRow
                href="/settings/organization"
                icon={<Building2 className="h-4 w-4" />}
                title="Organization profile"
                description="Edit name, timezone, and logo"
              />
              <SettingsLinkRow
                href="/settings/tables"
                icon={<Grid3x3 className="h-4 w-4" />}
                title="Tables"
                description="Add, edit, and manage tables shown on the Floor view"
              />
              <SettingsLinkRow
                href="/settings/koda"
                icon={<Sparkles className="h-4 w-4" />}
                title="Koda AI assistant"
                description="Configure FAQ, specials, and limits for your AI booking agent"
              />
              <SettingsLinkRow
                href="/settings/users"
                icon={<Users className="h-4 w-4" />}
                title="Manage team"
                description="Invite members, change roles, suspend access"
              />
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 p-7">
      <div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">{eyebrow}</p>
        <h2 className="text-body-strong text-fg mt-1.5">{title}</h2>
        <p className="text-[12px] text-muted mt-1 leading-snug">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.06em] text-muted font-medium">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

function SettingsLinkRow({
  href,
  icon,
  title,
  description,
}: {
  href: '/settings/organization' | '/settings/users' | '/settings/tables' | '/settings/koda';
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-3.5 hover:bg-fg/5 transition-colors"
    >
      <div className="h-9 w-9 rounded-tile border border-row-divider bg-surface flex items-center justify-center text-fg shrink-0">
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
