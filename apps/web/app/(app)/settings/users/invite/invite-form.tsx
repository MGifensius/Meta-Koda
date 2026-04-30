'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Check } from 'lucide-react';
import { Button, Input, FormField, Card } from '@buranchi/ui';
import { InviteUserSchema, type InviteUser, ROLE_LABELS, USER_ROLES } from '@buranchi/shared';
import { inviteUserAction, type InvitePayload } from './actions';

export function InviteForm() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();
  const [result, setResult] = React.useState<InvitePayload | null>(null);
  const [copied, setCopied] = React.useState(false);

  const form = useForm<InviteUser>({
    resolver: zodResolver(InviteUserSchema),
    defaultValues: { email: '', full_name: '', role: 'front_desk' },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      const res = await inviteUserAction(values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(res.data);
    });
  });

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-md">
      <FormProvider {...form}>
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              id="email"
              label="Email"
              required
              {...(form.formState.errors.email?.message ? { error: form.formState.errors.email.message } : {})}
            >
              <Input id="email" type="email" {...form.register('email')} placeholder="member@example.com" />
            </FormField>
            <FormField
              id="full_name"
              label="Full name"
              required
              {...(form.formState.errors.full_name?.message ? { error: form.formState.errors.full_name.message } : {})}
            >
              <Input id="full_name" {...form.register('full_name')} />
            </FormField>
            <FormField
              id="role"
              label="Role"
              required
              {...(form.formState.errors.role?.message ? { error: form.formState.errors.role.message } : {})}
            >
              <select id="role" className="h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg" {...form.register('role')}>
                {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </FormField>
            {error ? <p className="text-[12px] text-danger">{error}</p> : null}
            <Button type="submit" disabled={pending}>{pending ? 'Generating link…' : 'Generate invite link'}</Button>
          </form>
        </Card>
      </FormProvider>

      {result ? (
        <Card className="border border-success-soft">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-success" />
            <p className="text-body-strong text-fg">
              {result.action === 'invite' ? 'Invite link generated' : 'Recovery link generated (user already existed)'}
            </p>
          </div>
          <p className="text-body text-muted mb-3">
            Share this link with <strong className="text-fg">{result.email}</strong>. They will be asked to set a password and will land on the dashboard.
          </p>
          <div className="flex gap-2 items-center">
            <input
              readOnly
              value={result.link}
              className="h-9 flex-1 rounded-input border border-border bg-canvas px-3 text-[12px] font-mono text-fg"
              onClick={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted mt-3">Single-use, expires in 24h.</p>
        </Card>
      ) : null}
    </div>
  );
}
