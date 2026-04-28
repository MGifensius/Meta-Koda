import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { OrganizationForm } from './organization-form';
import { OrgLogoUpload } from '@/components/org-logo-upload';
import type { OrganizationUpdate } from '@buranchi/shared';

interface OrgRow {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  operating_hours: string | null;
  logo_url: string | null;
}

export default async function OrganizationSettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase.from('organizations')
    .select('id, name, timezone, address, operating_hours, logo_url')
    .eq('id', profile.organization_id)
    .single();
  const org = data as OrgRow | null;
  if (!org) return null;

  const defaults: OrganizationUpdate = {
    name: org.name,
    timezone: org.timezone,
    ...(org.address ? { address: org.address } : {}),
    ...(org.operating_hours ? { operating_hours: org.operating_hours } : {}),
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
      <div className="space-y-6 max-w-2xl">
        <Card>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Logo</h2>
          <OrgLogoUpload organizationId={org.id} initialUrl={org.logo_url} />
        </Card>
        <Card>
          <OrganizationForm defaults={defaults} />
        </Card>
      </div>
    </>
  );
}
