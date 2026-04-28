import Link from 'next/link';
import { Button, Topbar, EmptyState } from '@buranchi/ui';
import { Users } from 'lucide-react';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { CustomerListClient, type CustomerRow } from './customer-list-client';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireProfile();
  const { q } = await searchParams;
  const supabase = await createServerClient();

  let query = supabase
    .from('customers')
    .select('id, display_id, full_name, phone, tags, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (q && q.trim() !== '') {
    query = query.ilike('full_name', `%${q.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  type CustomerListRow = {
    id: string;
    display_id: string;
    full_name: string;
    phone: string | null;
    tags: string[] | null;
    created_at: string;
  };
  const rows: CustomerRow[] = ((data ?? []) as CustomerListRow[]).map((c) => ({
    id: c.id,
    display_id: c.display_id,
    full_name: c.full_name,
    phone: c.phone,
    tags: c.tags ?? [],
    created_at: c.created_at,
  }));

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Customers"
        title="Customers"
        actions={
          <Button asChild>
            <Link href="/customers/new">+ New customer</Link>
          </Button>
        }
      />
      {rows.length === 0 && !q ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No customers yet"
          description="When you add walk-ins or import contacts, they'll appear here."
          action={
            <Button asChild>
              <Link href="/customers/new">+ Add the first customer</Link>
            </Button>
          }
        />
      ) : (
        <CustomerListClient initialRows={rows} initialQuery={q ?? ''} />
      )}
    </>
  );
}
