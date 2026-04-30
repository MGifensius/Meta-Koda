import Link from 'next/link';
import { Topbar, Card } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { KodaFaqEditor, type FaqEntry } from '@/components/koda-faq-editor';
import { KodaSpecialsEditor, type SpecialEntry } from '@/components/koda-specials-editor';

export default async function KodaSettingsPage() {
  const profile = await requireRole(['admin']);
  const supabase = await createServerClient();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    { data: faqRaw },
    { data: specialsRaw },
    { count: todayCount },
    { count: total7d },
    { count: escalated7d },
  ] = await Promise.all([
    supabase
      .from('koda_faq')
      .select('id, question, answer, is_active, sort_order')
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('koda_specials')
      .select('id, title, description, starts_on, ends_on, is_active')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('koda_messages')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('koda_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase
      .from('koda_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'escalated')
      .gte('created_at', sevenDaysAgo.toISOString()),
  ]);

  const faq = (faqRaw ?? []) as FaqEntry[];
  const specials = (specialsRaw ?? []) as SpecialEntry[];
  const escalationRate =
    total7d && total7d > 0 ? Math.round(((escalated7d ?? 0) / total7d) * 100) : 0;

  return (
    <>
      <Topbar
        breadcrumb={
          <>
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>{' '}
            / Koda
          </>
        }
        title="Koda AI assistant"
        backHref="/settings"
      />
      <div className="space-y-6 max-w-3xl">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Identity
          </h2>
          <Card>
            <p className="text-[12px] text-fg">
              Your AI booking assistant is named <span className="font-semibold">Koda</span>. Powered
              by Meta-Koda (Metaseti Digital Indonesia).
            </p>
            <p className="text-[11px] text-muted mt-2">
              Persona is fixed in v1. Per-tenant rename will arrive in a later release.
            </p>
          </Card>
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            FAQ
          </h2>
          <p className="text-[11px] text-muted mb-3">
            Koda answers customer questions verbatim from these entries. Keep them short and factual.
          </p>
          <KodaFaqEditor entries={faq} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Specials
          </h2>
          <p className="text-[11px] text-muted mb-3">
            Koda mentions one of these at most once per conversation, when contextually relevant.
          </p>
          <KodaSpecialsEditor entries={specials} />
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
            Activity
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Today's messages
              </p>
              <p className="text-title text-fg font-bold mt-1">{todayCount ?? 0}</p>
              <p className="text-[11px] text-muted mt-1">Cap: 500</p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Escalation rate (7d)
              </p>
              <p className="text-title text-fg font-bold mt-1">{escalationRate}%</p>
              <p className="text-[11px] text-muted mt-1">
                {escalated7d ?? 0} / {total7d ?? 0} conversations
              </p>
            </Card>
            <Card>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">
                Status
              </p>
              <p className="text-title text-fg font-bold mt-1">Active</p>
              <p className="text-[11px] text-muted mt-1">GPT-4o-mini</p>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
