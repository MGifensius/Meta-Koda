import Link from 'next/link';
import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { InviteForm } from './invite-form';

export default async function InviteUserPage() {
  await requireRole(['admin']);
  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">Settings</Link> /{' '}
            <Link href="/settings/users" className="hover:underline">Team</Link> / Invite
          </>
        }
        title="Invite member"
        backHref="/settings/users"
      />
      <InviteForm />
    </>
  );
}
