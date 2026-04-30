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

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  const form = useForm<ProfileSelfUpdate>({
    resolver: zodResolver(ProfileSelfUpdateSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const res = await updateOwnProfileAction(values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSaved(true);
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <FormField
          id="full_name"
          label="Full name"
          required
          {...(form.formState.errors.full_name?.message ? { error: form.formState.errors.full_name.message } : {})}
        >
          <Input id="full_name" {...form.register('full_name')} />
        </FormField>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          <span
            className={`text-[12px] text-success transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}
            aria-live="polite"
          >
            Saved
          </span>
        </div>
      </form>
    </FormProvider>
  );
}
