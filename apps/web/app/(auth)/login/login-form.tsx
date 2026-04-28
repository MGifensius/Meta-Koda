'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Mail, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import { Button, FormField } from '@buranchi/ui';
import { loginAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full h-11">
      {pending ? 'Signing in…' : 'Get Started'}
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
          <LogIn className="h-5 w-5 text-fg" />
        </div>
      </div>

      <div className="text-center mb-6">
        <h1 className="text-title text-fg font-bold">Sign in with email</h1>
        <p className="text-body text-muted mt-1">
          Welcome back. Sign in to manage Buranchi customer operations.
        </p>
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
              className="h-10 w-full rounded-input border border-border bg-surface pl-9 pr-3 text-body text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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
              className="h-10 w-full rounded-input border border-border bg-surface pl-9 pr-9 text-body text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border"></div>
        <span className="text-[11px] text-muted uppercase tracking-wider">Or sign in with</span>
        <div className="h-px flex-1 bg-border"></div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <SocialButton provider="google" />
        <SocialButton provider="facebook" />
        <SocialButton provider="apple" />
      </div>
    </div>
  );
}

function SocialButton({ provider }: { provider: 'google' | 'facebook' | 'apple' }) {
  const labels = { google: 'Google', facebook: 'Facebook', apple: 'Apple' };
  const icons = {
    google: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.31h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.09-1.93 3.22-4.77 3.22-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84A11 11 0 0 0 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.34-2.12V7.04H2.16a11 11 0 0 0 0 9.92l3.68-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.96 1 12 1A11 11 0 0 0 2.16 7.04l3.68 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
      </svg>
    ),
    facebook: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38h-3.05V12h3.05V9.36c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12z"/>
      </svg>
    ),
    apple: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.86-3.08.43-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.43C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
    ),
  };

  function handleClick() {
    alert(`${labels[provider]} sign-in is not yet configured. Use email/password for now.`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="h-10 rounded-input border border-border bg-surface hover:bg-canvas flex items-center justify-center transition-colors"
      aria-label={`Sign in with ${labels[provider]}`}
    >
      {icons[provider]}
    </button>
  );
}
