import Link from 'next/link';
import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  CustomerNotesReviewList,
  type PendingNote,
} from '@/components/customer-notes-review-list';

export default async function NotesReviewPage() {
  const profile = await requireRole(['admin', 'front_desk']);
  const supabase = await createServerClient();

  const { data: rowsRaw } = await supabase
    .from('customer_notes')
    .select(
      `id, customer_id, note, source_conversation_id, created_at,
       customer:customers!inner(full_name)`,
    )
    .eq('organization_id', profile.organization_id)
    .eq('source', 'koda')
    .is('verified_at', null)
    .order('created_at', { ascending: true });

  const notes = ((rowsRaw ?? []) as unknown as Array<
    PendingNote & { customer: { full_name: string } }
  >).map((r) => ({
    id: r.id,
    customer_id: r.customer_id,
    customer_name: r.customer.full_name,
    note: r.note,
    source_conversation_id: r.source_conversation_id,
    created_at: r.created_at,
  }));

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/customers" className="hover:underline">
              Customers
            </Link>{' '}
            / Notes review
          </>
        }
        title="Notes review"
        backHref="/customers"
      />
      <div className="max-w-3xl">
        <p className="text-[12px] text-muted mb-3">
          Notes Koda extracted from customer conversations. Review each one before they show up on
          the customer profile.
        </p>
        <CustomerNotesReviewList notes={notes} />
      </div>
    </>
  );
}
