import Link from 'next/link';
import { Topbar, Button } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { UsersTable, type UserRow } from './users-table';
import type { UserRole } from '@buranchi/shared';

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  status: 'active' | 'suspended';
}

export default async function UsersPage() {
  const me = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase.from('profiles')
    .select('id, email, full_name, role, status')
    .eq('organization_id', me.organization_id)
    .order('created_at', { ascending: true });
  const profiles = (data ?? []) as ProfileRow[];
  const rows: UserRow[] = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    status: p.status,
    isSelf: p.id === me.id,
  }));
  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">Settings</Link> / Team
          </>
        }
        title="Team"
        actions={<Button asChild><Link href="/settings/users/invite">+ Invite member</Link></Button>}
      />
      <UsersTable rows={rows} />
    </>
  );
}
