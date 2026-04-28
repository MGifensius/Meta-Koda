import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { UserRole } from '@buranchi/shared';
import { createServerClient } from '@/lib/supabase/server';
import { ForbiddenError } from './errors';

export type Profile = {
  id: string;
  organization_id: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  status: 'active' | 'suspended';
  avatar_url: string | null;
};

/**
 * React.cache() memoizes within a single request, so layout + page + nested
 * server components all share one auth + profile lookup instead of double-fetching.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, organization_id, email, full_name, role, status, avatar_url')
    .eq('id', user.id)
    .single();

  return (profile as Profile | null) ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.status !== 'active') {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect('/login?error=suspended');
  }
  return profile;
}

export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) {
    throw new ForbiddenError(`requires one of ${roles.join(', ')}`);
  }
  return profile;
}
