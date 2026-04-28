'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, FormField } from '@buranchi/ui';
import { TableCreateSchema, type TableCreate } from '@buranchi/shared';
import { createTableAction, updateTableAction } from '@/lib/actions/tables';

interface TableFormProps {
  id?: string;
  defaults?: Partial<TableCreate>;
  onSuccess?: () => void;
}

export function TableForm({ id, defaults, onSuccess }: TableFormProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  const form = useForm<TableCreate>({
    resolver: zodResolver(TableCreateSchema),
    defaultValues: {
      code: defaults?.code ?? '',
      capacity: defaults?.capacity ?? 2,
      ...(defaults?.floor_area ? { floor_area: defaults.floor_area } : {}),
      is_active: defaults?.is_active ?? true,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      try {
        if (id) {
          await updateTableAction(id, values);
        } else {
          await createTableAction(values);
        }
        setSaved(true);
        if (!id) form.reset({ code: '', capacity: 2, is_active: true });
        onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            id="code"
            label="Code"
            required
            hint="e.g. T01, P-04"
            {...(form.formState.errors.code?.message
              ? { error: form.formState.errors.code.message }
              : {})}
          >
            <Input id="code" {...form.register('code')} />
          </FormField>
          <FormField
            id="capacity"
            label="Capacity"
            required
            {...(form.formState.errors.capacity?.message
              ? { error: form.formState.errors.capacity.message }
              : {})}
          >
            <Input
              id="capacity"
              type="number"
              min={1}
              max={50}
              {...form.register('capacity', { valueAsNumber: true })}
            />
          </FormField>
        </div>
        <FormField
          id="floor_area"
          label="Floor area"
          hint="e.g. Indoor, Patio, Bar"
          {...(form.formState.errors.floor_area?.message
            ? { error: form.formState.errors.floor_area.message }
            : {})}
        >
          <Input id="floor_area" {...form.register('floor_area')} placeholder="optional" />
        </FormField>
        <label className="inline-flex items-center gap-2 text-[12px] text-fg">
          <input type="checkbox" {...form.register('is_active')} />
          <span>Active (shown on Floor view)</span>
        </label>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : id ? 'Save changes' : 'Add table'}
          </Button>
          <span
            className={`text-[12px] text-success transition-opacity duration-300 ${
              saved ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            Saved
          </span>
        </div>
      </form>
    </FormProvider>
  );
}
