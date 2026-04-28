'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { OrganizationUpdateSchema, type OrganizationUpdate } from '@buranchi/shared';
import { updateOrganizationAction } from './actions';

export function OrganizationForm({ defaults }: { defaults: OrganizationUpdate }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  const form = useForm<OrganizationUpdate>({
    resolver: zodResolver(OrganizationUpdateSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateOrganizationAction(values);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            id="name"
            label="Organization name"
            required
            {...(form.formState.errors.name?.message ? { error: form.formState.errors.name.message } : {})}
          >
            <Input id="name" {...form.register('name')} />
          </FormField>
          <FormField
            id="timezone"
            label="Timezone"
            required
            hint="e.g. Asia/Jakarta"
            {...(form.formState.errors.timezone?.message ? { error: form.formState.errors.timezone.message } : {})}
          >
            <Input id="timezone" {...form.register('timezone')} />
          </FormField>
        </div>
        <FormField
          id="address"
          label="Address"
          hint="Physical location of the venue"
          {...(form.formState.errors.address?.message ? { error: form.formState.errors.address.message } : {})}
        >
          <Textarea id="address" {...form.register('address')} placeholder="Jl. Sudirman No. 1, Jakarta" />
        </FormField>
        <FormField
          id="operating_hours"
          label="Operating hours"
          hint="When the restaurant is open"
          {...(form.formState.errors.operating_hours?.message ? { error: form.formState.errors.operating_hours.message } : {})}
        >
          <Textarea id="operating_hours" {...form.register('operating_hours')} placeholder="Mon–Fri 11:00–22:00\nSat–Sun 10:00–23:00" />
        </FormField>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        {saved ? <p className="text-[12px] text-success">Saved.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </form>
    </FormProvider>
  );
}
