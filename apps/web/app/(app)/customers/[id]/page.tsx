import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Button, Card, Badge } from '@buranchi/ui';
import { requireProfile } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { DeleteCustomerButton } from './delete-action';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createServerClient();

  const { data } = await supabase.from('customers')
    .select('id, display_id, full_name, phone, email, birth_date, notes, tags, created_at')
    .eq('id', id)
    .single();
  type CustomerDetail = {
    id: string;
    display_id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    notes: string | null;
    tags: string[] | null;
    created_at: string;
  };
  const c = data as CustomerDetail | null;
  if (!c) notFound();

  return (
    <>
      <Topbar
        breadcrumb={<><Link href="/customers" className="hover:underline">Customers</Link> / {c.display_id}</>}
        title={c.full_name}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/customers/${c.id}/edit`}>Edit</Link></Button>
            {profile.role === 'admin' ? <DeleteCustomerButton id={c.id} /> : null}
          </>
        }
      />
      <Card className="max-w-xl space-y-3">
        <Row label="Display ID" value={<span className="font-mono">{c.display_id}</span>} />
        <Row label="Phone" value={c.phone ?? <span className="text-border">—</span>} />
        <Row label="Email" value={c.email ?? <span className="text-border">—</span>} />
        <Row label="Birth date" value={c.birth_date ?? <span className="text-border">—</span>} />
        <Row
          label="Tags"
          value={c.tags && c.tags.length ? (
            <div className="flex gap-1">{c.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}</div>
          ) : <span className="text-border">—</span>}
        />
        <Row label="Notes" value={c.notes ? <span className="whitespace-pre-wrap text-fg">{c.notes}</span> : <span className="text-border">—</span>} />
        <Row label="Created" value={new Date(c.created_at).toLocaleString()} />
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-3 text-body">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
