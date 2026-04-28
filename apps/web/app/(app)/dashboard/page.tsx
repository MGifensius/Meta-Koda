import { LayoutGrid, MessageCircle, Star } from 'lucide-react';
import { Topbar, StatCardTrend, StatCardCategory } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createServerClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalCustomers }, { count: thisWeek }, { count: lastWeek }] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
  ]);

  const totalDelta =
    (lastWeek ?? 0) > 0
      ? Math.round((((thisWeek ?? 0) - (lastWeek ?? 0)) / (lastWeek ?? 1)) * 100)
      : 0;

  return (
    <>
      <Topbar
        breadcrumb="Workspace"
        title={`Welcome back, ${profile.full_name.split(' ')[0]}`}
      />

      <div className="grid grid-cols-3 gap-row-gap mb-row-gap">
        <StatCardTrend
          title="Total Customers"
          qualifier="All time"
          value={(totalCustomers ?? 0).toLocaleString()}
          trend={totalDelta >= 0 ? 'up' : 'down'}
          delta={totalDelta !== 0 ? { direction: totalDelta >= 0 ? 'up' : 'down', value: `${totalDelta >= 0 ? '+' : ''}${totalDelta}%`, context: 'last week' } : null}
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

      <div className="grid grid-cols-3 gap-row-gap">
        <StatCardCategory
          title="Active Tables"
          qualifier="Now"
          value="—"
          delta={null}
          icon={<LayoutGrid className="h-5 w-5" />}
        />
        <StatCardCategory
          title="WhatsApp Inbox"
          qualifier="Unread"
          value="—"
          delta={null}
          icon={<MessageCircle className="h-5 w-5" />}
        />
        <StatCardCategory
          title="Loyalty Members"
          qualifier="Total"
          value="—"
          delta={null}
          icon={<Star className="h-5 w-5" />}
        />
      </div>
    </>
  );
}
