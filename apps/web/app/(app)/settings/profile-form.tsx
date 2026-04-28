'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, FormField } from '@buranchi/ui';
import { ProfileSelfUpdateSchema, type ProfileSelfUpdate } from '@buranchi/shared';
import { updateOwnProfileAction } from './profile-actions';

export function ProfileForm({ defaults }: { defaults: ProfileSelfUpdate }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  const form = useForm<ProfileSelfUpdate>({
    resolver: zodResolver(ProfileSelfUpdateSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateOwnProfileAction(values);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      }
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            id="full_name"
            label="Full name"
            required
            {...(form.formState.errors.full_name?.message ? { error: form.formState.errors.full_name.message } : {})}
          >
            <Input id="full_name" {...form.register('full_name')} />
          </FormField>
          <FormField
            id="avatar_url"
            label="Avatar URL"
            hint="Public image URL"
            {...(form.formState.errors.avatar_url?.message ? { error: form.formState.errors.avatar_url.message } : {})}
          >
            <Input id="avatar_url" {...form.register('avatar_url')} placeholder="https://…" />
          </FormField>
        </div>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        {saved ? <p className="text-[12px] text-success">Saved.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
      </form>
    </FormProvider>
  );
}
