import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Button, Card, Badge } from '@buranchi/ui';
import { formatPhoneDisplay } from '@buranchi/shared';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { DeleteCustomerButton } from './delete-action';
import { LoyaltyStatusBadge } from '@/components/loyalty-status-badge';
import { LoyaltyMemberToggle } from '@/components/loyalty-member-toggle';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createServerClient();

  const [customerResult, orgResult, tiersResult] = await Promise.all([
    supabase
      .from('customers')
      .select(
        'id, display_id, full_name, phone, email, birth_date, notes, tags, created_at, is_member, member_since, points_balance, points_lifetime, current_tier_id',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('organizations')
      .select('loyalty_enabled, loyalty_program_name')
      .eq('id', profile.organization_id)
      .single(),
    supabase
      .from('loyalty_tiers')
      .select('id, tier_index, name, min_points_lifetime')
      .eq('organization_id', profile.organization_id)
      .order('tier_index', { ascending: true }),
  ]);

  type CustomerDetail = {
    id: string;
    display_id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    notes: string | null;
    tags: string[] | null;
    created_at: string;
    is_member: boolean;
    member_since: string | null;
    points_balance: number;
    points_lifetime: number;
    current_tier_id: string | null;
  };
  const c = customerResult.data as CustomerDetail | null;
  if (!c) notFound();
  const org = orgResult.data as { loyalty_enabled: boolean; loyalty_program_name: string } | null;

  let tierName = 'None';
  let tierIndex = 0;
  let nextTierName: string | null = null;
  let nextTierThreshold: number | null = null;
  if (c.is_member && c.current_tier_id) {
    const all = (tiersResult.data ?? []) as Array<{
      id: string;
      tier_index: number;
      name: string;
      min_points_lifetime: number;
    }>;
    const cur = all.find((t) => t.id === c.current_tier_id);
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
            <Link href="/customers" className="hover:underline">
              Customers
            </Link>{' '}
            / {c.display_id}
          </>
        }
        title={c.full_name}
        backHref="/customers"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/customers/${c.id}/edit`}>Edit</Link>
            </Button>
            {profile.role === 'admin' ? <DeleteCustomerButton id={c.id} /> : null}
          </>
        }
      />
      <div className="max-w-xl space-y-4">
        {org?.loyalty_enabled && c.is_member ? (
          <Card>
            <LoyaltyStatusBadge
              tierName={tierName}
              tierIndex={tierIndex}
              pointsBalance={c.points_balance}
              pointsLifetime={c.points_lifetime}
              nextTierName={nextTierName}
              nextTierThreshold={nextTierThreshold}
            />
            <div className="mt-3 flex justify-end">
              <LoyaltyMemberToggle
                customerId={c.id}
                customerName={c.full_name}
                isMember={true}
                programName={org.loyalty_program_name}
              />
            </div>
          </Card>
        ) : org?.loyalty_enabled && !c.is_member ? (
          <LoyaltyMemberToggle
            customerId={c.id}
            customerName={c.full_name}
            isMember={false}
            programName={org.loyalty_program_name}
          />
        ) : null}

        <Card className="space-y-3">
          <Row label="Display ID" value={<span className="font-mono">{c.display_id}</span>} />
          <Row
            label="Phone"
            value={c.phone ? formatPhoneDisplay(c.phone) : <span className="text-border">—</span>}
          />
          <Row label="Email" value={c.email ?? <span className="text-border">—</span>} />
          <Row label="Birth date" value={c.birth_date ?? <span className="text-border">—</span>} />
          <Row
            label="Tags"
            value={
              c.tags && c.tags.length ? (
                <div className="flex gap-1">
                  {c.tags.map((t: string) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-border">—</span>
              )
            }
          />
          <Row
            label="Notes"
            value={
              c.notes ? (
                <span className="whitespace-pre-wrap text-fg">{c.notes}</span>
              ) : (
                <span className="text-border">—</span>
              )
            }
          />
          <Row label="Created" value={new Date(c.created_at).toLocaleString()} />
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-3 text-body">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
