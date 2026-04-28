'use client';

import * as React from 'react';
import { Badge, Button } from '@buranchi/ui';
import { ROLE_LABELS, type UserRole } from '@buranchi/shared';
import { updateUserRoleAction, setUserStatusAction } from './user-actions';

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  status: 'active' | 'suspended';
  isSelf: boolean;
}

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  async function changeRole(id: string, role: UserRole) {
    setError(undefined);
    setPendingId(id);
    try {
      await updateUserRoleAction({ id, role });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPendingId(null);
    }
  }

  async function toggleStatus(id: string, current: 'active' | 'suspended') {
    setError(undefined);
    setPendingId(id);
    try {
      await setUserStatusAction({ id, status: current === 'active' ? 'suspended' : 'active' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="rounded-card bg-surface shadow-card">
        <div className="px-4 grid grid-cols-[1fr_1fr_180px_120px_220px] border-b border-border py-3 text-label uppercase text-muted">
          <div>Name</div><div>Email</div><div>Role</div><div>Status</div><div>Actions</div>
        </div>
        {rows.map((u) => (
          <div key={u.id} className="px-4 grid grid-cols-[1fr_1fr_180px_120px_220px] py-3 border-b border-row-divider last:border-b-0 text-body items-center">
            <div className="font-medium text-fg">{u.full_name}{u.isSelf ? <span className="text-muted"> (you)</span> : null}</div>
            <div className="text-muted">{u.email}</div>
            <div>
              <select
                className="rounded-input border border-border bg-surface px-2 py-1 text-[11px] text-fg"
                value={u.role}
                disabled={pendingId === u.id || u.isSelf}
                onChange={(e) => void changeRole(u.id, e.target.value as UserRole)}
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <Badge variant={u.status === 'active' ? 'success' : 'danger'}>{u.status}</Badge>
            </div>
            <div>
              <Button
                size="sm"
                variant={u.status === 'active' ? 'outline' : 'primary'}
                disabled={pendingId === u.id || u.isSelf}
                onClick={() => void toggleStatus(u.id, u.status)}
              >
                {u.status === 'active' ? 'Suspend' : 'Reactivate'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
