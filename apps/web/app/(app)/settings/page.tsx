import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { ROLE_LABELS } from '@buranchi/shared';
import { requireProfile } from '@/lib/auth/server';
import { ProfileForm } from './profile-form';
import type { ProfileSelfUpdate } from '@buranchi/shared';

export default async function SettingsPage() {
  const profile = await requireProfile();
  const defaults: ProfileSelfUpdate = {
    full_name: profile.full_name,
    ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
  };
  return (
    <>
      <Topbar breadcrumb="Workspace" title="Settings" />
      <div className="space-y-6 max-w-2xl">
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
            <Card className="space-y-2">
              <Link href="/settings/organization" className="block text-body text-accent hover:underline">Organization profile →</Link>
              <Link href="/settings/users" className="block text-body text-accent hover:underline">Manage team →</Link>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}
