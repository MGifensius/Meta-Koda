'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CustomerInputSchema } from '@buranchi/shared';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/auth/errors';

export async function updateCustomerAction(id: string, input: unknown) {
  await requireRole(['admin', 'front_desk', 'customer_service']);
  const parsed = CustomerInputSchema.parse(input);

  const supabase = await createServerClient();
  const { error } = await supabase.from('customers').update(parsed as never).eq('id', id);
  if (error) {
    if (error.code === '23505' && error.message.includes('phone')) {
      throw new ActionError('PHONE_TAKEN', 'A customer with this phone already exists.');
    }
    throw new ActionError(error.code ?? 'DB', error.message);
  }
  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}
