import Link from 'next/link';
import { Button, Topbar, EmptyState } from '@buranchi/ui';
import { Users } from 'lucide-react';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { CustomerListClient, type CustomerRow } from './customer-list-client';

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  const { q, page: pageParam } = await searchParams;
  const supabase = await createServerClient();

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('loyalty_enabled')
    .eq('id', profile.organization_id)
    .single();
  const loyaltyEnabled = (orgRow as { loyalty_enabled: boolean } | null)?.loyalty_enabled ?? false;

  let query = supabase
    .from('customers')
    .select(
      'id, display_id, full_name, phone, tags, created_at, is_member, points_balance, current_tier:loyalty_tiers(name, tier_index)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q && q.trim() !== '') {
    query = query.ilike('full_name', `%${q.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  type CustomerListRow = {
    id: string;
    display_id: string;
    full_name: string;
    phone: string | null;
    tags: string[] | null;
    created_at: string;
    is_member: boolean;
    points_balance: number;
    current_tier: { name: string; tier_index: number } | null;
  };
  const rows: CustomerRow[] = ((data ?? []) as unknown as CustomerListRow[]).map((c) => ({
    id: c.id,
    display_id: c.display_id,
    full_name: c.full_name,
    phone: c.phone,
    tags: c.tags ?? [],
    created_at: c.created_at,
    is_member: c.is_member,
    points_balance: c.points_balance,
    tier_name: c.current_tier?.name ?? null,
    tier_index: c.current_tier?.tier_index ?? null,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      {rows.length === 0 && !q && page === 1 ? (
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
        <CustomerListClient
          initialRows={rows}
          initialQuery={q ?? ''}
          loyaltyEnabled={loyaltyEnabled}
          page={page}
          totalPages={totalPages}
          totalCount={total}
          pageSize={PAGE_SIZE}
        />
      )}
    </>
  );
}
