import { notFound } from 'next/navigation';
import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { CustomerEditForm } from './customer-edit-form';
import type { CustomerInput } from '@buranchi/shared';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['admin', 'front_desk', 'customer_service']);
  const { id } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase.from('customers')
    .select('full_name, phone, email, birth_date, notes, tags').eq('id', id).single();
  type CustomerEditRow = {
    full_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    notes: string | null;
    tags: string[] | null;
  };
  const c = data as CustomerEditRow | null;
  if (!c) notFound();

  const defaults: CustomerInput = {
    full_name: c.full_name,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    birth_date: c.birth_date ?? undefined,
    notes: c.notes ?? undefined,
    tags: c.tags ?? [],
  };

  return (
    <>
      <Topbar breadcrumb="Workspace / Customers" title={`Edit ${c.full_name}`} />
      <CustomerEditForm id={id} defaults={defaults} />
    </>
  );
}
