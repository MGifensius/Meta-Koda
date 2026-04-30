import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';

const SIDEBAR_AVATAR_TTL_SECONDS = 3600;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('organizations').select('name').eq('id', profile.organization_id).single();
  const org = data as { name: string } | null;
  if (!org) redirect('/login');

  // Convert avatar_url path to signed URL for the sidebar render.
  let avatarSignedUrl: string | null = null;
  if (profile.avatar_url) {
    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_url, SIDEBAR_AVATAR_TTL_SECONDS);
    avatarSignedUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="h-screen flex bg-canvas overflow-hidden">
      <AppSidebar
        profile={profile}
        organizationName={org.name}
        avatarSignedUrl={avatarSignedUrl}
      />
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
