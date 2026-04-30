import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Card } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { BookingStatusPill } from '@/components/status-pill';
import { BookingForm } from '@/components/booking-form';
import { BookingActions } from './booking-actions';
import {
  LoyaltyCompletionSection,
  type AvailableReward,
  type PreApplied,
} from '@/components/loyalty-completion-section';
import type { BookingStatus, BookingSource, LoyaltyRewardType } from '@buranchi/shared';

interface BookingDetail {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  source: BookingSource;
  status: BookingStatus;
  special_request: string | null;
  internal_notes: string | null;
  cancelled_reason: string | null;
  customer: {
    id: string;
    display_id: string;
    full_name: string;
    is_member: boolean;
    points_balance: number;
    points_lifetime: number;
    current_tier_id: string | null;
  };
  table: { id: string; code: string };
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createServerClient();

  const [bookingResult, orgResult] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        `
        id, starts_at, ends_at, party_size, source, status,
        special_request, internal_notes, cancelled_reason,
        customer:customers!inner(id, display_id, full_name, is_member, points_balance, points_lifetime, current_tier_id),
        table:tables!inner(id, code)
      `,
      )
      .eq('id', id)
      .single(),
    supabase
      .from('organizations')
      .select('loyalty_enabled, loyalty_earn_rate_idr_per_point')
      .eq('id', profile.organization_id)
      .single(),
  ]);
  const b = bookingResult.data as unknown as BookingDetail | null;
  if (!b) notFound();
  const orgInfo = orgResult.data as
    | { loyalty_enabled: boolean; loyalty_earn_rate_idr_per_point: number }
    | null;

  const canMutate = profile.role === 'admin' || profile.role === 'front_desk';
  const canEdit = canMutate && (b.status === 'confirmed' || b.status === 'seated');

  let showLoyaltyCompletion = false;
  let preApplied: PreApplied[] = [];
  let availableRewards: AvailableReward[] = [];
  let earnRate = 10000;
  let tierName = 'Bronze';
  let tierIndex = 0;
  let nextTierName: string | null = null;
  let nextTierThreshold: number | null = null;

  if (
    (b.status === 'confirmed' || b.status === 'seated') &&
    b.customer.is_member &&
    canMutate &&
    orgInfo?.loyalty_enabled
  ) {
    showLoyaltyCompletion = true;
    earnRate = orgInfo.loyalty_earn_rate_idr_per_point;

    const [{ data: applied }, { data: rewards }, { data: tiers }] = await Promise.all([
      supabase
        .from('loyalty_redemptions')
        .select('id, reward_name, points_spent, created_at')
        .eq('booking_id', b.id)
        .eq('status', 'applied'),
      supabase
        .from('loyalty_rewards')
        .select('id, name, type, type_value, points_cost, min_tier_index, is_active')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('loyalty_tiers')
        .select('id, tier_index, name, min_points_lifetime')
        .eq('organization_id', profile.organization_id)
        .order('tier_index', { ascending: true }),
    ]);

    preApplied = (applied ?? []) as PreApplied[];
    availableRewards = (
      (rewards ?? []) as Array<{
        id: string;
        name: string;
        type: LoyaltyRewardType;
        type_value: number;
        points_cost: number;
        min_tier_index: number;
      }>
    ).filter((r) => !preApplied.some((p) => p.reward_name === r.name));

    const all = (tiers ?? []) as Array<{
      id: string;
      tier_index: number;
      name: string;
      min_points_lifetime: number;
    }>;
    const cur = all.find((t) => t.id === b.customer.current_tier_id);
    if (cur) {
      tierName = cur.name;
      tierIndex = cur.tier_index;
      const next = all.find((t) => t.tier_index === cur.tier_index + 1);
      if (next) {
        nextTierName = next.name;
        nextTierThreshold = next.min_points_lifetime;
      }
    }
  }

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/bookings" className="hover:underline">
              Bookings
            </Link>{' '}
            / {b.customer.display_id}
          </>
        }
        title={b.customer.full_name}
        backHref="/bookings"
      />
      <div className="space-y-4 max-w-2xl">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <BookingStatusPill status={b.status} />
            <span className="text-[12px] text-muted">
              {new Date(b.starts_at).toLocaleString()} — {new Date(b.ends_at).toLocaleString()}
            </span>
          </div>
          <Row
            label="Customer"
            value={
              <Link href={`/customers/${b.customer.id}`} className="text-accent hover:underline">
                {b.customer.display_id} · {b.customer.full_name}
              </Link>
            }
          />
          <Row label="Table" value={<span className="font-mono">{b.table.code}</span>} />
          <Row label="Party size" value={b.party_size} />
          <Row label="Source" value={b.source === 'walk_in' ? 'Walk-in' : 'Manual'} />
          <Row
            label="Special request"
            value={b.special_request ?? <span className="text-border">—</span>}
          />
          <Row
            label="Internal notes"
            value={b.internal_notes ?? <span className="text-border">—</span>}
          />
          {b.cancelled_reason ? (
            <Row label="Cancelled reason" value={b.cancelled_reason} />
          ) : null}
        </Card>

        {showLoyaltyCompletion ? (
          <LoyaltyCompletionSection
            bookingId={b.id}
            customerName={b.customer.full_name}
            tierName={tierName}
            customerTierIndex={tierIndex}
            pointsBalance={b.customer.points_balance}
            pointsLifetime={b.customer.points_lifetime}
            nextTierName={nextTierName}
            nextTierThreshold={nextTierThreshold}
            earnRateIdrPerPoint={earnRate}
            preApplied={preApplied}
            available={availableRewards}
          />
        ) : null}

        {canMutate && (b.status === 'confirmed' || b.status === 'seated') ? (
          <Card>
            <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
              Actions
            </h2>
            <BookingActions id={b.id} status={b.status} hideComplete={showLoyaltyCompletion} />
          </Card>
        ) : null}

        {canEdit ? (
          <Card>
            <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
              Edit details
            </h2>
            <BookingForm
              id={b.id}
              organizationId={profile.organization_id}
              defaults={{
                customer_id: b.customer.id,
                customer_label: b.customer.full_name,
                table_id: b.table.id,
                starts_at_local: isoToDatetimeLocal(b.starts_at),
                party_size: b.party_size,
                special_request: b.special_request ?? '',
                internal_notes: b.internal_notes ?? '',
              }}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
