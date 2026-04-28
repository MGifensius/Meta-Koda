import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(['admin']);
  const { id } = await params;
  const supabase = await createServerClient();
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
