-- 0011_phase4_koda_tables.sql

-- ============================================================================
-- koda_conversations
-- ============================================================================

create table public.koda_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('simulator', 'whatsapp', 'web')),
  status text not null check (status in ('active', 'escalated', 'resolved', 'closed')) default 'active',
  escalated_reason text,
  taken_over_by uuid references public.profiles(id) on delete set null,
  taken_over_at timestamptz,
  last_message_at timestamptz not null default now(),
  total_input_tokens int not null default 0,
  total_output_tokens int not null default 0,
  total_tool_calls int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index koda_conversations_org_idx on public.koda_conversations (organization_id);
create index koda_conversations_status_idx on public.koda_conversations (organization_id, status, last_message_at desc);
create index koda_conversations_customer_idx on public.koda_conversations (customer_id);

create trigger set_koda_conversations_updated_at
  before update on public.koda_conversations
  for each row execute function extensions.moddatetime(updated_at);

alter table public.koda_conversations enable row level security;

create policy "select koda_conversations in own org"
  on public.koda_conversations for select
  using (organization_id = public.get_my_org_id());

create policy "insert koda_conversations (admin or front_desk)"
  on public.koda_conversations for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "update koda_conversations (admin or front_desk)"
  on public.koda_conversations for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "delete koda_conversations (admin only)"
  on public.koda_conversations for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- ============================================================================
-- koda_messages
-- ============================================================================

create table public.koda_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.koda_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system', 'staff')),
  content text not null,
  tool_calls jsonb,
  tool_name text,
  staff_id uuid references public.profiles(id) on delete set null,
  input_tokens int,
  output_tokens int,
  model text,
  created_at timestamptz not null default now()
);

create index koda_messages_conversation_idx on public.koda_messages (conversation_id, created_at);

alter table public.koda_messages enable row level security;

create policy "select koda_messages in own org"
  on public.koda_messages for select
  using (
    exists (
      select 1 from public.koda_conversations c
      where c.id = koda_messages.conversation_id
        and c.organization_id = public.get_my_org_id()
    )
  );

create policy "insert koda_messages (admin or front_desk)"
  on public.koda_messages for insert
  with check (
    exists (
      select 1 from public.koda_conversations c
      where c.id = koda_messages.conversation_id
        and c.organization_id = public.get_my_org_id()
        and public.get_my_role() in ('admin', 'front_desk')
    )
  );

-- No update or delete policy on koda_messages — they're append-only audit history.

-- ============================================================================
-- koda_faq
-- ============================================================================

create table public.koda_faq (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index koda_faq_org_idx on public.koda_faq (organization_id, is_active, sort_order);

create trigger set_koda_faq_updated_at
  before update on public.koda_faq
  for each row execute function extensions.moddatetime(updated_at);

alter table public.koda_faq enable row level security;

create policy "select koda_faq in own org"
  on public.koda_faq for select
  using (organization_id = public.get_my_org_id());

create policy "insert koda_faq (admin only)"
  on public.koda_faq for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "update koda_faq (admin only)"
  on public.koda_faq for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "delete koda_faq (admin only)"
  on public.koda_faq for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- ============================================================================
-- koda_specials
-- ============================================================================

create table public.koda_specials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint koda_specials_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index koda_specials_org_active_idx on public.koda_specials (organization_id, is_active);

create trigger set_koda_specials_updated_at
  before update on public.koda_specials
  for each row execute function extensions.moddatetime(updated_at);

alter table public.koda_specials enable row level security;

create policy "select koda_specials in own org"
  on public.koda_specials for select
  using (organization_id = public.get_my_org_id());

create policy "insert koda_specials (admin only)"
  on public.koda_specials for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "update koda_specials (admin only)"
  on public.koda_specials for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

create policy "delete koda_specials (admin only)"
  on public.koda_specials for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- ============================================================================
-- customer_notes
-- ============================================================================

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  note text not null,
  source text not null check (source in ('koda', 'staff')),
  source_conversation_id uuid references public.koda_conversations(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);
create index customer_notes_unverified_idx on public.customer_notes (organization_id, verified_at)
  where source = 'koda' and verified_at is null;

alter table public.customer_notes enable row level security;

create policy "select customer_notes in own org"
  on public.customer_notes for select
  using (organization_id = public.get_my_org_id());

create policy "insert customer_notes (admin or front_desk)"
  on public.customer_notes for insert
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "update customer_notes (admin or front_desk)"
  on public.customer_notes for update
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'front_desk')
  );

create policy "delete customer_notes (admin only)"
  on public.customer_notes for delete
  using (
    organization_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- ============================================================================
-- increment_koda_tokens RPC (for cheap token-tally updates from server actions)
-- ============================================================================

create or replace function public.increment_koda_tokens(
  convo_id uuid,
  in_tokens int,
  out_tokens int,
  tool_count int
) returns void language sql security definer as $$
  update public.koda_conversations
  set total_input_tokens = total_input_tokens + in_tokens,
      total_output_tokens = total_output_tokens + out_tokens,
      total_tool_calls = total_tool_calls + tool_count
  where id = convo_id;
$$;

grant execute on function public.increment_koda_tokens(uuid, int, int, int) to authenticated;
