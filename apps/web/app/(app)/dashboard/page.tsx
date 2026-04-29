import Link from 'next/link';
import { MessageCircle, Megaphone, UserPlus, Search, Settings, ArrowRight } from 'lucide-react';
import { Topbar, StatCardTrend, Card, Button } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

interface RecentCustomer {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createServerClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalCustomers },
    { count: thisWeek },
    { count: lastWeek },
    { data: recent },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
    supabase
      .from('customers')
      .select('id, display_id, full_name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const totalDelta =
    (lastWeek ?? 0) > 0
      ? Math.round((((thisWeek ?? 0) - (lastWeek ?? 0)) / (lastWeek ?? 1)) * 100)
      : 0;

  const recentRows = (recent ?? []) as RecentCustomer[];
  const firstName = profile.full_name.split(' ')[0] || profile.full_name;

  return (
    <>
      <Topbar
        breadcrumb="Workspace"
        title={
          <span className="flex items-center gap-2">
            Welcome back, {firstName} <span aria-hidden>👋</span>
          </span>
        }
      />

      {/* Trend cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-row-gap mb-row-gap">
        <StatCardTrend
          title="Total Customers"
          qualifier="All time"
          value={(totalCustomers ?? 0).toLocaleString()}
          trend={totalDelta >= 0 ? 'up' : 'down'}
          delta={
            totalDelta !== 0
              ? {
                  direction: totalDelta >= 0 ? 'up' : 'down',
                  value: `${totalDelta >= 0 ? '+' : ''}${totalDelta}%`,
                  context: 'last week',
                }
              : null
          }
        />
        <StatCardTrend
          title="New This Week"
          qualifier="7 days"
          value={(thisWeek ?? 0).toLocaleString()}
          trend={(thisWeek ?? 0) >= (lastWeek ?? 0) ? 'up' : 'down'}
          delta={null}
        />
        <StatCardTrend
          title="Pending Bookings"
          qualifier="Today"
          value="—"
          trend="up"
          delta={null}
        />
      </div>

      {/* Recent customers + quick actions row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-row-gap mb-row-gap">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-title text-fg">Recent customers</h2>
            <Button asChild size="sm" variant="outline">
              <Link href="/customers" className="inline-flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          {recentRows.length === 0 ? (
            <p className="text-body text-muted py-6 text-center">
              No customers yet — add your first one to see them here.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[110px_1fr_140px_100px] gap-3 text-label uppercase text-muted py-2 border-b border-row-divider">
                <span>ID</span>
                <span>Name</span>
                <span>Phone</span>
                <span className="text-right">Created</span>
              </div>
              {recentRows.map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="grid grid-cols-[110px_1fr_140px_100px] gap-3 py-2.5 border-b border-row-divider last:border-b-0 text-body items-center hover:bg-canvas rounded-input -mx-2 px-2"
                >
                  <span className="font-mono text-muted text-[12px]">{c.display_id}</span>
                  <span className="font-medium text-fg truncate">{c.full_name}</span>
                  <span className="text-muted text-[12px]">
                    {c.phone ?? <span className="text-border">—</span>}
                  </span>
                  <span className="text-muted text-[12px] text-right">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-title text-fg mb-3">Quick actions</h2>
          <div className="space-y-2">
            <Button asChild className="w-full justify-start">
              <Link href="/customers/new" className="inline-flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                <span>New customer</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/customers" className="inline-flex items-center gap-2">
                <Search className="h-4 w-4" />
                <span>Search customers</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/settings" className="inline-flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Coming soon preview */}
      <div className="mb-3">
        <h2 className="text-title text-fg">Coming soon</h2>
        <p className="text-[12px] text-muted mt-0.5">
          Two phases left before Meta-Koda is feature-complete.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-row-gap">
        <ComingSoonCard
          icon={<MessageCircle className="h-5 w-5" />}
          title="WhatsApp Inbox"
          description="Centralized customer chat with AI assist."
          phase="Phase 3"
        />
        <ComingSoonCard
          icon={<Megaphone className="h-5 w-5" />}
          title="Marketing Blast"
          description="Approved templates, segments, campaign reports."
          phase="Phase 6"
        />
      </div>
    </>
  );
}

function ComingSoonCard({
  icon,
  title,
  description,
  phase,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="rounded-card bg-surface p-card-pad shadow-card flex flex-col gap-2 opacity-90">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-tile border border-border flex items-center justify-center text-muted">
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{phase}</span>
      </div>
      <h3 className="text-body-strong text-fg mt-1">{title}</h3>
      <p className="text-[12px] text-muted leading-snug">{description}</p>
    </div>
  );
}
