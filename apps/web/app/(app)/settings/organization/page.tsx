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

const LOGO_SIGNED_URL_TTL_SECONDS = 3600;

export default async function OrganizationSettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase.from('organizations')
    .select('id, name, timezone, address, operating_hours, logo_url')
    .eq('id', profile.organization_id)
    .single();
  const org = data as OrgRow | null;
  if (!org) return null;

  // organizations.logo_url stores a storage PATH; convert to a signed URL.
  let initialSignedUrl: string | null = null;
  if (org.logo_url) {
    const { data: signed } = await supabase.storage
      .from('org-logos')
      .createSignedUrl(org.logo_url, LOGO_SIGNED_URL_TTL_SECONDS);
    initialSignedUrl = signed?.signedUrl ?? null;
  }

  // logo_url is owned by OrgLogoUpload + updateOrgLogoAction — keep it out of
  // the form's defaultValues so RHF doesn't roundtrip a storage path through
  // OrganizationUpdateSchema's URL validator on every save.
  const defaults: OrganizationUpdate = {
    name: org.name,
    timezone: org.timezone,
    ...(org.address ? { address: org.address } : {}),
    ...(org.operating_hours ? { operating_hours: org.operating_hours } : {}),
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
        backHref="/settings"
      />
      <div className="space-y-6 max-w-2xl">
        <Card>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Logo</h2>
          <OrgLogoUpload organizationId={org.id} initialPath={org.logo_url} initialSignedUrl={initialSignedUrl} />
        </Card>
        <Card>
          <OrganizationForm defaults={defaults} />
        </Card>
      </div>
    </>
  );
}
