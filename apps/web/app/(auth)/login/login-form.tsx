'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Input, FormField, Card } from '@buranchi/ui';
import { loginAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction] = useActionState(
    loginAction,
    initialError ? { error: initialError } : undefined,
  );
  return (
    <Card className="space-y-4">
      <form action={formAction} className="space-y-4">
        <FormField id="email" label="Email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </FormField>
        <FormField id="password" label="Password" required>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </FormField>
        {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
        <SubmitButton />
        <div className="text-center text-[12px] text-muted">
          <a href="/forgot-password" className="hover:underline">Forgot password?</a>
        </div>
      </form>
    </Card>
  );
}
