import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { LoyaltyProgramSection } from './program-section';
import { LoyaltyTiersEditor, type TierRow } from '@/components/loyalty-tiers-editor';
import {
  LoyaltyRewardsEditor,
  type RewardRow,
  type TierOption,
} from '@/components/loyalty-rewards-editor';

export default async function LoyaltySettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();

  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    { data: orgRow },
    { data: tierRows },
    { data: rewardRows },
    { count: members },
    { data: earn7 },
    { data: redeem7 },
  ] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, loyalty_enabled, loyalty_program_name, loyalty_earn_rate_idr_per_point')
      .eq('id', profile.organization_id)
      .single(),
    supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime, perks_text')
      .eq('organization_id', profile.organization_id)
      .order('tier_index', { ascending: true }),
    supabase
      .from('loyalty_rewards')
      .select(
        'id, name, description, type, type_value, points_cost, min_tier_index, is_active, sort_order',
      )
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('is_member', true),
    supabase
      .from('loyalty_transactions')
      .select('points_earned')
      .eq('organization_id', profile.organization_id)
      .gte('created_at', sevenAgo.toISOString()),
    supabase
      .from('loyalty_redemptions')
      .select('points_spent')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'applied')
      .gte('created_at', sevenAgo.toISOString()),
  ]);

  const org = orgRow as
    | {
        name: string;
        loyalty_enabled: boolean;
        loyalty_program_name: string;
        loyalty_earn_rate_idr_per_point: number;
      }
    | null;
  const tiers = (tierRows ?? []) as TierRow[];
  const tierOptions: TierOption[] = tiers.map((t) => ({
    tier_index: t.tier_index,
    name: t.name,
  }));
  const rewards = (rewardRows ?? []) as RewardRow[];
  const earned7 = ((earn7 ?? []) as Array<{ points_earned: number }>).reduce(
    (s, x) => s + x.points_earned,
    0,
  );
  const redeemed7 = ((redeem7 ?? []) as Array<{ points_spent: number }>).reduce(
    (s, x) => s + x.points_spent,
    0,
  );

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>{' '}
            / Loyalty
          </>
        }
        title="Loyalty program"
        backHref="/settings"
      />
      <div className="space-y-6 max-w-3xl">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Identity
          </h2>
          <Card>
            <p className="text-[12px] text-fg">
              Loyalty for{' '}
              <span className="font-semibold">{org?.name ?? 'this restaurant'}</span> · Powered by
              Meta-Koda
            </p>
            <p className="text-[11px] text-muted mt-2">
              4-tier structure is fixed; tier names, thresholds, and rewards are tenant-configurable.
            </p>
          </Card>
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Program
          </h2>
          <LoyaltyProgramSection
            enabled={org?.loyalty_enabled ?? false}
            programName={org?.loyalty_program_name ?? 'Loyalty'}
            earnRate={org?.loyalty_earn_rate_idr_per_point ?? 10000}
          />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Tiers
          </h2>
          <p className="text-[11px] text-muted mb-3">
            4 tiers ordered by tier_index. Threshold of tier 0 is fixed at 0; the rest must be
            strictly increasing.
          </p>
          <LoyaltyTiersEditor rows={tiers} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Rewards
          </h2>
          <p className="text-[11px] text-muted mb-3">
            Three reward types: free item, percent discount, fixed Rupiah discount. Optional
            minimum tier per reward.
          </p>
          <LoyaltyRewardsEditor rows={rewards} tiers={tierOptions} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Activity
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Members (all time)
              </p>
              <p className="text-title text-fg font-bold mt-1">{members ?? 0}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Points earned (7d)
              </p>
              <p className="text-title text-fg font-bold mt-1">{earned7.toLocaleString()}</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Points redeemed (7d)
              </p>
              <p className="text-title text-fg font-bold mt-1">{redeemed7.toLocaleString()}</p>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
