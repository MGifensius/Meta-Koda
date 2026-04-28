'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CustomerInputSchema, type CustomerInput } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function createCustomerAction(input: unknown) {
  const profile = await requireRole(['admin', 'front_desk', 'customer_service']);
  const parsed = CustomerInputSchema.parse(input) as CustomerInput;

  const supabase = await createServerClient();
  const insertPayload = {
    ...parsed,
    organization_id: profile.organization_id,
    created_by: profile.id,
  };
  const { data, error } = await supabase
    .from('customers')
    .insert(insertPayload as never)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('phone')) {
      throw new ActionError('PHONE_TAKEN', 'A customer with this phone already exists.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }

  const inserted = data as { id: string } | null;
  revalidatePath('/customers');
  redirect(`/customers/${inserted?.id ?? ''}`);
}
