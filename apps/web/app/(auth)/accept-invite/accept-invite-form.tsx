'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Input, FormField, Card } from '@buranchi/ui';
import { acceptInviteAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Setting password…' : 'Set password & continue'}
    </Button>
  );
}

export function AcceptInviteForm() {
  const [state, formAction] = useActionState(acceptInviteAction, undefined);
  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <p className="text-body text-muted">Welcome to Buranchi. Set a password to activate your account.</p>
        <FormField id="password" label="New password" required hint="Minimum 8 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </FormField>
        <FormField id="password_confirm" label="Confirm password" required>
          <Input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required minLength={8} />
        </FormField>
        {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
        <SubmitButton />
      </form>
    </Card>
  );
}
