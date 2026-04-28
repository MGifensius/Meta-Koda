'use client';

import * as React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input, Textarea, FormField } from '@buranchi/ui';
import type { CustomerInput } from '@buranchi/shared';

export function CustomerFields() {
  const { register, formState: { errors } } = useFormContext<CustomerInput>();
  return (
    <>
      <FormField id="full_name" label="Full name" required error={errors.full_name?.message}>
        <Input id="full_name" {...register('full_name')} placeholder="e.g. Andini Putri" />
      </FormField>
      <FormField id="phone" label="Phone" hint="Indonesian or international format" error={errors.phone?.message}>
        <Input id="phone" {...register('phone')} placeholder="+62 812 …" />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" {...register('email')} placeholder="optional" />
      </FormField>
      <FormField id="birth_date" label="Birth date" hint="Used for birthday campaigns" error={errors.birth_date?.message}>
        <Input id="birth_date" type="date" {...register('birth_date')} />
      </FormField>
      <FormField id="notes" label="Notes" error={errors.notes?.message}>
        <Textarea id="notes" {...register('notes')} placeholder="Internal staff notes (allergies, preferences, etc.)" />
      </FormField>
    </>
  );
}
