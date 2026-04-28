import { Topbar } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { TableCard, type FloorTable, type FloorBooking } from '@/components/table-card';
import { FloorAutoRefresh } from '@/components/floor-auto-refresh';
import { deriveTableStatus } from '@buranchi/shared';
import type { TableStatus, BookingStatus } from '@buranchi/shared';

interface RawTable {
  id: string;
  code: string;
  capacity: number;
  floor_area: string | null;
  status: TableStatus;
}

interface RawBooking {
  id: string;
  table_id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  customer: { full_name: string };
}

export default async function FloorPage() {
  const profile = await requireProfile();
  const supabase = await createServerClient();

  const { data: rawTables } = await supabase
    .from('tables')
    .select('id, code, capacity, floor_area, status')
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .order('code', { ascending: true });
  const tables = (rawTables ?? []) as RawTable[];

  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select(
      `
      id, table_id, starts_at, ends_at, party_size, status,
      customer:customers!inner(full_name)
    `,
    )
    .eq('organization_id', profile.organization_id)
    .in('status', ['seated', 'confirmed'])
    .lt('starts_at', sixHoursFromNow.toISOString())
    .gt('ends_at', now.toISOString());
  const bookings = (rawBookings ?? []) as unknown as RawBooking[];

  const canMutate = profile.role === 'admin' || profile.role === 'front_desk';

  const cards: FloorTable[] = tables.map((t) => {
    const tableBookings = bookings
      .filter((b) => b.table_id === t.id)
      .map((b) => ({
        table_id: b.table_id,
        status: b.status,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
      }));
    const liveStatus = deriveTableStatus({ id: t.id, status: t.status }, tableBookings, now);

    let primary: FloorBooking | null = null;
    if (liveStatus === 'occupied') {
      const seated = bookings.find((b) => b.table_id === t.id && b.status === 'seated');
      if (seated) {
        primary = {
          id: seated.id,
          starts_at: seated.starts_at,
          ends_at: seated.ends_at,
          party_size: seated.party_size,
          status: seated.status,
          customer_full_name: seated.customer.full_name,
        };
      }
    } else if (liveStatus === 'reserved') {
      const reserved = bookings
        .filter((b) => b.table_id === t.id && b.status === 'confirmed')
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      if (reserved) {
        primary = {
          id: reserved.id,
          starts_at: reserved.starts_at,
          ends_at: reserved.ends_at,
          party_size: reserved.party_size,
          status: reserved.status,
          customer_full_name: reserved.customer.full_name,
        };
      }
    } else if (liveStatus === 'available') {
      const next = bookings
        .filter((b) => b.table_id === t.id && b.status === 'confirmed')
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      if (next) {
        primary = {
          id: next.id,
          starts_at: next.starts_at,
          ends_at: next.ends_at,
          party_size: next.party_size,
          status: next.status,
          customer_full_name: next.customer.full_name,
        };
      }
    }

    return {
      id: t.id,
      code: t.code,
      capacity: t.capacity,
      floor_area: t.floor_area,
      liveStatus,
      primaryBooking: primary,
    };
  });

  return (
    <>
      <Topbar breadcrumb="Workspace" title="Floor" />
      <FloorAutoRefresh />
      {cards.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card py-12 text-center">
          <p className="text-body-strong text-fg">No tables yet</p>
          <p className="text-[12px] text-muted mt-1">
            Admins can add tables under Settings → Tables.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-row-gap">
          {cards.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              organizationId={profile.organization_id}
              canMutate={canMutate}
            />
          ))}
        </div>
      )}
    </>
  );
}
