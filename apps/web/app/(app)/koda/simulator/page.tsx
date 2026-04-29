import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { KodaSimulatorChat } from '@/components/koda-simulator-chat';

export default async function KodaSimulatorPage() {
  const profile = await requireRole(['admin', 'front_desk']);
  return (
    <>
      <Topbar breadcrumb="Workspace / Koda" title="Koda simulator" backHref="/koda" />
      <KodaSimulatorChat organizationId={profile.organization_id} />
    </>
  );
}
