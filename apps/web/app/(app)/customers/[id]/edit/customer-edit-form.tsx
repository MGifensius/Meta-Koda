'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@buranchi/ui';
import { CustomerInputSchema, type CustomerInput } from '@buranchi/shared';
import { CustomerFields } from '@/components/customer-fields';
import { updateCustomerAction } from './actions';

export function CustomerEditForm({ id, defaults }: { id: string; defaults: CustomerInput }) {
  const [globalError, setGlobalError] = React.useState<string | undefined>();
  const [pending, startTransition] = React.useTransition();

  const form = useForm<CustomerInput>({
    resolver: zodResolver(CustomerInputSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setGlobalError(undefined);
    startTransition(async () => {
      const res = await updateCustomerAction(id, values);
      // Successful path redirects via Next.js — only the error branch returns here.
      if (!res.ok) setGlobalError(res.message);
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
        <CustomerFields />
        {globalError ? <p className="text-[12px] text-danger">{globalError}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        </div>
      </form>
    </FormProvider>
  );
}
