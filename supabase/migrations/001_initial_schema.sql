-- Meta-Koda CRM Database Schema
-- Run this in Supabase SQL Editor or via migrations

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- CUSTOMERS
-- ============================================
create table customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text unique not null,
  email text,
  points integer not null default 0,
  total_visits integer not null default 0,
  total_spent bigint not null default 0,
  tier text not null default 'Bronze' check (tier in ('Bronze', 'Silver', 'Gold', 'Platinum')),
  tags text[] default '{}',
  joined_at timestamptz not null default now(),
  last_visit timestamptz,
  created_at timestamptz not null default now()
);

create index idx_customers_phone on customers(phone);
create index idx_customers_tier on customers(tier);

-- Auto-update tier based on points
create or replace function update_customer_tier()
returns trigger as $$
begin
  if NEW.points >= 2500 then
    NEW.tier := 'Platinum';
  elsif NEW.points >= 1000 then
    NEW.tier := 'Gold';
  elsif NEW.points >= 300 then
    NEW.tier := 'Silver';
  else
    NEW.tier := 'Bronze';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_customer_tier
  before update of points on customers
  for each row execute function update_customer_tier();

-- ============================================
-- TABLES (restaurant tables)
-- ============================================
create table tables (
  id text primary key,
  capacity integer not null,
  zone text not null,
  is_active boolean default true
);

insert into tables (id, capacity, zone) values
  ('A1', 2, 'Indoor'),
  ('A2', 2, 'Indoor'),
  ('A3', 4, 'Window'),
  ('B1', 2, 'Outdoor'),
  ('B2', 4, 'Outdoor'),
  ('B3', 4, 'Outdoor'),
  ('C1', 6, 'Private'),
  ('C2', 8, 'Private');

-- ============================================
-- BOOKINGS
-- ============================================
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  date date not null,
  time time not null,
  party_size integer not null,
  table_id text references tables(id),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no-show')),
  notes text default '',
  created_at timestamptz not null default now()
);

create index idx_bookings_date on bookings(date);
create index idx_bookings_customer on bookings(customer_id);
create index idx_bookings_status on bookings(status);

-- Award bonus points when booking is completed
create or replace function award_booking_points()
returns trigger as $$
begin
  if NEW.status = 'completed' and OLD.status != 'completed' then
    update customers set points = points + 10 where id = NEW.customer_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_booking_points
  after update of status on bookings
  for each row execute function award_booking_points();

-- ============================================
-- MENU ITEMS
-- ============================================
create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price integer not null,
  category text not null,
  description text default '',
  is_available boolean default true,
  created_at timestamptz not null default now()
);

insert into menu_items (name, price, category) values
  ('Nasi Goreng Truffle', 89000, 'Main'),
  ('Wagyu Rendang Sushi', 145000, 'Main'),
  ('Soto Betawi Premium', 75000, 'Main'),
  ('Ayam Bakar Madu Spesial', 68000, 'Main'),
  ('Es Teh Tarik', 28000, 'Beverage'),
  ('Kopi Susu Aren', 35000, 'Beverage'),
  ('Lychee Fizz', 38000, 'Beverage'),
  ('Matcha Latte', 42000, 'Beverage'),
  ('Panna Cotta Pandan', 55000, 'Dessert'),
  ('Klepon Cake', 48000, 'Dessert');

-- ============================================
-- ORDERS (POS)
-- ============================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id),
  items jsonb not null default '[]',
  subtotal integer not null default 0,
  discount integer not null default 0,
  points_used integer not null default 0,
  total integer not null default 0,
  points_earned integer not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  payment_method text,
  created_at timestamptz not null default now()
);

create index idx_orders_customer on orders(customer_id);
create index idx_orders_status on orders(status);

-- ============================================
-- LOYALTY REWARDS
-- ============================================
create table rewards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  points_cost integer not null,
  category text not null check (category in ('discount', 'freebie', 'experience')),
  is_active boolean default true,
  created_at timestamptz not null default now()
);

insert into rewards (name, description, points_cost, category) values
  ('Diskon 10%', 'Potongan 10% untuk total bill', 200, 'discount'),
  ('Free Dessert', 'Gratis 1 dessert pilihan', 150, 'freebie'),
  ('Diskon 25%', 'Potongan 25% untuk total bill', 500, 'discount'),
  ('Free Main Course', 'Gratis 1 main course pilihan', 400, 'freebie'),
  ('Chef''s Table Experience', 'Makan malam eksklusif di Chef''s Table untuk 2 orang', 1500, 'experience'),
  ('Free Beverage', 'Gratis 1 minuman pilihan', 100, 'freebie');

-- ============================================
-- REDEMPTIONS LOG
-- ============================================
create table redemptions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id),
  reward_id uuid not null references rewards(id),
  points_used integer not null,
  redeemed_at timestamptz not null default now()
);

-- ============================================
-- CAMPAIGNS (Marketing)
-- ============================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  message text not null,
  audience text not null,
  audience_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivered integer not null default 0,
  read integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- CONVERSATIONS & MESSAGES (Inbox / WhatsApp)
-- ============================================
create table conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  last_message text,
  last_message_time timestamptz default now(),
  unread_count integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'bot')),
  created_at timestamptz not null default now()
);

create index idx_conversations_customer on conversations(customer_id);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  content text not null,
  sender text not null check (sender in ('customer', 'bot', 'agent')),
  read boolean not null default false,
  timestamp timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id);

-- ============================================
-- FEEDBACK REQUESTS (for scheduler)
-- ============================================
create table feedback_requests (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id),
  customer_id uuid not null references customers(id),
  rating integer,
  feedback text,
  sent_at timestamptz not null default now(),
  responded_at timestamptz
);

-- ============================================
-- RPC FUNCTIONS (used by POS)
-- ============================================
create or replace function increment_points(cid uuid, amount integer)
returns void as $$
begin
  update customers set points = points + amount where id = cid;
end;
$$ language plpgsql;

create or replace function increment_visit(cid uuid, spent bigint)
returns void as $$
begin
  update customers
  set total_visits = total_visits + 1,
      total_spent = total_spent + spent,
      last_visit = now()
  where id = cid;
end;
$$ language plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (basic — expand per role)
-- ============================================
alter table customers enable row level security;
alter table bookings enable row level security;
alter table orders enable row level security;
alter table messages enable row level security;

-- Service role bypass (for backend)
create policy "Service role full access" on customers for all using (true);
create policy "Service role full access" on bookings for all using (true);
create policy "Service role full access" on orders for all using (true);
create policy "Service role full access" on messages for all using (true);
