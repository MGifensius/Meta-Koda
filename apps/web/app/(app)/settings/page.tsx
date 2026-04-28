import { Topbar, Card } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';

export default async function SettingsPage() {
  const profile = await requireProfile();
  return (
    <>
      <Topbar breadcrumb="Workspace" title="Settings" />
      <Card className="max-w-xl">
        <h2 className="text-title text-fg mb-2">Hello, {profile.full_name}</h2>
        <p className="text-body text-muted">
          Profile editing, organization settings, and team management ship in the next iteration.
          For now your email is <strong>{profile.email}</strong> and your role is <strong>{profile.role}</strong>.
        </p>
      </Card>
    </>
  );
}
