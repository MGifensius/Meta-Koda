import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { TableForm } from '@/components/table-form';
import { TablesList, type TableRow } from './tables-list';

export default async function TablesAdminPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('tables')
    .select('id, code, capacity, floor_area, status, is_active')
    .eq('organization_id', profile.organization_id)
    .order('code', { ascending: true });
  const rows = (data ?? []) as TableRow[];

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>{' '}
            / Tables
          </>
        }
        title="Tables"
        backHref="/settings"
      />
      <div className="space-y-6 max-w-3xl">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Add new table
          </h2>
          <Card>
            <TableForm />
          </Card>
        </section>
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Existing tables
          </h2>
          <TablesList rows={rows} />
        </section>
      </div>
    </>
  );
}
