'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, FormField } from '@buranchi/ui';
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
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
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
        <FormField
          id="logo_url"
          label="Logo URL"
          {...(form.formState.errors.logo_url?.message ? { error: form.formState.errors.logo_url.message } : {})}
        >
          <Input id="logo_url" {...form.register('logo_url')} placeholder="https://…" />
        </FormField>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        {saved ? <p className="text-[12px] text-success">Saved.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </form>
    </FormProvider>
  );
}
