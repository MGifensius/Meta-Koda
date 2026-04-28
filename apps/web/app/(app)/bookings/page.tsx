import Link from 'next/link';
import { Topbar, Button } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { BookingsListClient, type BookingRow } from './bookings-list-client';
import type { BookingSource, BookingStatus } from '@buranchi/shared';

interface Props {
  searchParams: Promise<{ range?: string; status?: string; source?: string }>;
}

function rangeToWindow(range: string): { from?: Date; to?: Date } {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  if (range === 'today') {
    const end = new Date(startOfDay);
    end.setDate(end.getDate() + 1);
    return { from: startOfDay, to: end };
  }
  if (range === 'tomorrow') {
    const start = new Date(startOfDay);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }
  if (range === 'week') {
    const end = new Date(startOfDay);
    end.setDate(end.getDate() + 7);
    return { from: startOfDay, to: end };
  }
  return {};
}

export default async function BookingsPage({ searchParams }: Props) {
  const profile = await requireProfile();
  const params = await searchParams;
  const range = params.range ?? 'today';
  const statusFilter = params.status ?? 'all';
  const sourceFilter = params.source ?? 'all';

  const supabase = await createServerClient();
  let query = supabase
    .from('bookings')
    .select(
      `
      id, starts_at, ends_at, party_size, source, status, special_request,
      customer:customers!inner(id, display_id, full_name),
      table:tables!inner(id, code)
    `,
    )
    .order('starts_at', { ascending: true })
    .limit(200);

  const { from, to } = rangeToWindow(range);
  if (from) query = query.gte('starts_at', from.toISOString());
  if (to) query = query.lt('starts_at', to.toISOString());
  if (statusFilter !== 'all') query = query.eq('status', statusFilter as BookingStatus);
  if (sourceFilter !== 'all') query = query.eq('source', sourceFilter as BookingSource);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as BookingRow[];

  const canCreate = profile.role === 'admin' || profile.role === 'front_desk';

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Bookings"
        title="Bookings"
        {...(canCreate
          ? {
              actions: (
                <Button asChild>
                  <Link href="/bookings/new">+ New booking</Link>
                </Button>
              ),
            }
          : {})}
      />
      <BookingsListClient
        initialRows={rows}
        initialFilters={{ range, status: statusFilter, source: sourceFilter }}
      />
    </>
  );
}
