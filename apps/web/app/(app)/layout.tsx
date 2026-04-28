import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from('organizations').select('name').eq('id', profile.organization_id).single();
  if (!org) redirect('/login');

  return (
    <div className="min-h-screen flex bg-canvas">
      <AppSidebar profile={profile} organizationName={org.name} />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
