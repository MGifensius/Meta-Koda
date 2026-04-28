'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@buranchi/ui';
import { CustomerInputSchema, type CustomerInput } from '@buranchi/shared';
import { CustomerFields } from '@/components/customer-fields';
import { createCustomerAction } from './actions';

export function CustomerForm() {
  const [globalError, setGlobalError] = React.useState<string | undefined>();
  const [pending, startTransition] = React.useTransition();

  const form = useForm<CustomerInput>({
    resolver: zodResolver(CustomerInputSchema),
    defaultValues: { full_name: '', tags: [] },
  });

  const onSubmit = form.handleSubmit((values) => {
    setGlobalError(undefined);
    startTransition(async () => {
      try {
        await createCustomerAction(values);
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
        <CustomerFields />
        {globalError ? <p className="text-[12px] text-danger">{globalError}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save customer'}</Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        </div>
      </form>
    </FormProvider>
  );
}
