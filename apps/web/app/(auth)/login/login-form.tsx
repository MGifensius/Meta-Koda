'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Mail, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button, FormField } from '@buranchi/ui';
import { loginAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign In'}
    </Button>
  );
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction] = useActionState(
    loginAction,
    initialError ? { error: initialError } : undefined,
  );
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="rounded-card bg-surface/80 backdrop-blur-md border border-white/40 shadow-[0_8px_40px_rgba(15,23,42,0.08)] p-7">
      <div className="flex justify-center mb-5">
        <div className="h-11 w-11 rounded-tile bg-canvas border border-border flex items-center justify-center">
          <KeyRound className="h-5 w-5 text-fg" />
        </div>
      </div>

      <div className="text-center mb-6">
        <h1 className="text-title text-fg font-bold">Buranchi CRM</h1>
        <p className="text-body text-muted mt-1">Manage your operation.</p>
      </div>

      <form action={formAction} className="space-y-3.5">
        <FormField id="email" label="Email" required>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-[33px] w-full rounded-input border border-border bg-surface pl-9 pr-3 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
        </FormField>

        <FormField id="password" label="Password" required>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="h-[33px] w-full rounded-input border border-border bg-surface pl-9 pr-9 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
              placeholder="••••••••"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-muted hover:text-fg hover:bg-canvas flex items-center justify-center"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>

        <div className="text-right">
          <a href="/forgot-password" className="text-[12px] text-muted hover:text-fg hover:underline">
            Forgot password?
          </a>
        </div>

        {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}

        <SubmitButton />
      </form>
    </div>
  );
}
