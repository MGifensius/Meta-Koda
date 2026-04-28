import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { OrganizationForm } from './organization-form';
import type { OrganizationUpdate } from '@buranchi/shared';

export default async function OrganizationSettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase.from('organizations')
    .select('name, timezone, logo_url').eq('id', profile.organization_id).single();
  const org = data as { name: string; timezone: string; logo_url: string | null } | null;
  if (!org) return null;
  const defaults: OrganizationUpdate = {
    name: org.name,
    timezone: org.timezone,
    ...(org.logo_url ? { logo_url: org.logo_url } : {}),
  };
  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">Settings</Link> / Organization
          </>
        }
        title="Organization profile"
      />
      <Card className="max-w-2xl">
        <OrganizationForm defaults={defaults} />
      </Card>
    </>
  );
}
