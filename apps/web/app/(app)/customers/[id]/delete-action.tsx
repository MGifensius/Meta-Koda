'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@buranchi/ui';

async function deleteCustomer(id: string) {
  const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to delete');
  }
}

export function DeleteCustomerButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!confirm('Delete this customer? This cannot be undone.')) return;
        startTransition(async () => {
          try {
            await deleteCustomer(id);
            router.replace('/customers');
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete');
          }
        });
      }}
    >
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  );
}
