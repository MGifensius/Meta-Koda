-- ==============================================================
-- META-KODA: Combined migration script (001 → 014)
-- Generated: paste this entire file into Supabase SQL Editor and Run.
-- ==============================================================


-- ##############################################################
-- # 001_initial_schema.sql
-- ##############################################################

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


-- ##############################################################
-- # 002_business_flow.sql
-- ##############################################################

-- ============================================
-- 002: Business Flow Updates
-- Member system, table status cycle, roles,
-- table-based POS orders
-- ============================================

-- Add member flag to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false;

-- Update table statuses: available → reserved → occupied → done
ALTER TABLE tables ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
  CHECK (status IN ('available', 'reserved', 'occupied', 'done'));
ALTER TABLE tables ADD COLUMN IF NOT EXISTS current_booking_id uuid REFERENCES bookings(id);

-- Update booking statuses to match flow
-- available → reserved → occupied → done/cancelled
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'occupied', 'done', 'cancelled'));

-- Update existing data
UPDATE bookings SET status = 'reserved' WHERE status = 'pending';
UPDATE bookings SET status = 'reserved' WHERE status = 'confirmed';

-- Add seating preference to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seating text DEFAULT 'indoor'
  CHECK (seating IN ('indoor', 'outdoor'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name text;

-- ============================================
-- ROLES
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE CHECK (name IN ('owner', 'receptionist', 'cashier')),
  description text
);

INSERT INTO roles (name, description) VALUES
  ('owner', 'Full access to all modules'),
  ('receptionist', 'Inbox & Booking only'),
  ('cashier', 'POS only')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TABLE-BASED ORDERS (POS redesign)
-- Orders are now linked to a table, not just a customer
-- ============================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id text REFERENCES tables(id);

-- When order is created for a table, set table to occupied
CREATE OR REPLACE FUNCTION set_table_occupied()
RETURNS trigger AS $$
BEGIN
  IF NEW.table_id IS NOT NULL AND NEW.status = 'open' THEN
    UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_occupy_table ON orders;
CREATE TRIGGER trg_order_occupy_table
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_occupied();

-- When order is paid, set table back to available
CREATE OR REPLACE FUNCTION set_table_available_on_pay()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_free_table ON orders;
CREATE TRIGGER trg_order_free_table
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_available_on_pay();

-- Booking flow triggers
CREATE OR REPLACE FUNCTION booking_status_change()
RETURNS trigger AS $$
BEGIN
  -- Reserved: mark table as reserved
  IF NEW.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'reserved', current_booking_id = NEW.id WHERE id = NEW.table_id;
  END IF;
  -- Occupied: mark table as occupied
  IF NEW.status = 'occupied' AND OLD.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
  END IF;
  -- Done or Cancelled: free the table
  IF NEW.status IN ('done', 'cancelled') AND OLD.status != NEW.status AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_status ON bookings;
CREATE TRIGGER trg_booking_status
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_status_change();

-- Update campaign table for member targeting
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience text DEFAULT 'all'
  CHECK (target_audience IN ('all', 'member', 'non-member'));


-- ##############################################################
-- # 003_cleaning_state_and_multitenant.sql
-- ##############################################################

-- ============================================
-- 003: Cleaning state, 15-min buffer, multi-tenant prep,
--      omnichannel support, platform tracking
-- ============================================

-- ============================================
-- TABLE STATE MACHINE UPDATE
-- Available → Booked/Reserved → Occupied → Cleaning → Available
-- Add "cleaning" state to tables
-- ============================================
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_status_check;
ALTER TABLE tables ADD CONSTRAINT tables_status_check
  CHECK (status IN ('available', 'reserved', 'occupied', 'cleaning'));

-- Update "done" → "available" for any existing rows
UPDATE tables SET status = 'available' WHERE status = 'done';

-- Add cleaning_until timestamp for auto-release
ALTER TABLE tables ADD COLUMN IF NOT EXISTS cleaning_until timestamptz;

-- Booking status: add no_show
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'occupied', 'done', 'cancelled', 'no_show'));

-- Update trigger: when booking → done, table → cleaning for 15 min
CREATE OR REPLACE FUNCTION booking_status_change()
RETURNS trigger AS $$
BEGIN
  -- Reserved: mark table as reserved
  IF NEW.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'reserved', current_booking_id = NEW.id WHERE id = NEW.table_id;
  END IF;

  -- Occupied: mark table as occupied
  IF NEW.status = 'occupied' AND OLD.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
  END IF;

  -- Done: table → cleaning (15-min buffer before available)
  IF NEW.status = 'done' AND OLD.status = 'occupied' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables
    SET status = 'cleaning',
        current_booking_id = NULL,
        cleaning_until = now() + interval '15 minutes'
    WHERE id = NEW.table_id;
  END IF;

  -- Cancelled or No-Show: free the table immediately
  IF NEW.status IN ('cancelled', 'no_show') AND OLD.status != NEW.status AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_booking_id = NULL, cleaning_until = NULL WHERE id = NEW.table_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_status ON bookings;
CREATE TRIGGER trg_booking_status
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_status_change();

-- Also handle booking INSERT (new reservation)
CREATE OR REPLACE FUNCTION booking_insert_reserve()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'reserved' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'reserved', current_booking_id = NEW.id WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_insert ON bookings;
CREATE TRIGGER trg_booking_insert
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_insert_reserve();

-- Update POS trigger: when order paid → cleaning instead of available
CREATE OR REPLACE FUNCTION set_table_available_on_pay()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.table_id IS NOT NULL THEN
    UPDATE tables
    SET status = 'cleaning',
        current_booking_id = NULL,
        cleaning_until = now() + interval '15 minutes'
    WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_free_table ON orders;
CREATE TRIGGER trg_order_free_table
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION set_table_available_on_pay();

-- Function to auto-release cleaning tables (called by scheduler)
CREATE OR REPLACE FUNCTION release_cleaning_tables()
RETURNS integer AS $$
DECLARE
  released integer;
BEGIN
  UPDATE tables
  SET status = 'available', cleaning_until = NULL
  WHERE status = 'cleaning' AND cleaning_until <= now();
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MULTI-TENANT PREP
-- Add restaurant_id to all core tables
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default';

-- Indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant ON bookings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_restaurant ON conversations(restaurant_id);

-- ============================================
-- OMNICHANNEL: Platform tracking
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ig_handle text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tiktok_id text;

-- Track which platform a conversation came from
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'whatsapp'
  CHECK (platform IN ('whatsapp', 'instagram', 'tiktok', 'walk_in'));

-- Track which channel a booking was made from
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'instagram', 'tiktok', 'walk_in', 'dashboard'));

-- ============================================
-- LOYALTY: Tier multiplier for points
-- ============================================
CREATE OR REPLACE FUNCTION calculate_points_earned(amount_idr bigint, tier text)
RETURNS integer AS $$
DECLARE
  base_points integer;
  multiplier numeric;
BEGIN
  base_points := (amount_idr / 10000)::integer;
  multiplier := CASE tier
    WHEN 'Platinum' THEN 2.0
    WHEN 'Gold' THEN 1.5
    WHEN 'Silver' THEN 1.2
    ELSE 1.0
  END;
  RETURN (base_points * multiplier)::integer;
END;
$$ LANGUAGE plpgsql;


-- ##############################################################
-- # 004_seed_demo_data.sql
-- ##############################################################

-- ============================================
-- 004: Clean & Seed Demo Data for Live Demo
-- Buranchi Restaurant CRM
-- ============================================

-- CLEAN ALL EXISTING DATA
TRUNCATE messages CASCADE;
TRUNCATE conversations CASCADE;
TRUNCATE feedback_requests CASCADE;
TRUNCATE redemptions CASCADE;
TRUNCATE orders CASCADE;
TRUNCATE bookings CASCADE;
TRUNCATE campaigns CASCADE;
TRUNCATE customers CASCADE;
DELETE FROM menu_items;

-- Reset tables (re-insert in case CASCADE deleted them)
DELETE FROM tables;
INSERT INTO tables (id, capacity, zone, status, restaurant_id) VALUES
  ('A1', 2, 'Indoor', 'available', 'default'),
  ('A2', 2, 'Indoor', 'available', 'default'),
  ('A3', 4, 'Window', 'available', 'default'),
  ('B1', 2, 'Outdoor', 'available', 'default'),
  ('B2', 4, 'Outdoor', 'available', 'default'),
  ('B3', 4, 'Outdoor', 'available', 'default'),
  ('C1', 6, 'Private', 'available', 'default'),
  ('C2', 8, 'Private', 'available', 'default')
ON CONFLICT (id) DO UPDATE SET status = 'available', current_booking_id = NULL, cleaning_until = NULL;

-- CUSTOMERS: Clean start (no pre-seeded customers)
-- New customers will be auto-created when they message via WhatsApp

-- ============================================
-- BURANCHI MENU (real menu)
-- ============================================
INSERT INTO menu_items (name, price, category, description, is_available, restaurant_id) VALUES
  -- Brunch
  ('Gyu Menchi Katsu Sando', 95000, 'Brunch', 'Premium beef menchi katsu sandwich', true, 'default'),
  ('Beef Bacon Eggs Benedict', 85000, 'Brunch', 'Classic eggs benedict with beef bacon', true, 'default'),
  ('Big Breakfast Platter', 98000, 'Brunch', 'Full breakfast with eggs, sausage, toast', true, 'default'),
  ('French Toast', 95000, 'Brunch', 'Thick-cut brioche french toast', true, 'default'),
  ('Maple Berries Pancake', 79000, 'Brunch', 'Fluffy pancakes with maple syrup and berries', true, 'default'),
  -- Lite Bites
  ('Chicken Karaage', 58000, 'Lite Bites', 'Japanese-style fried chicken', true, 'default'),
  ('Gyoza', 58000, 'Lite Bites', 'Pan-fried dumplings', true, 'default'),
  -- Big Bites (Mains)
  ('Umami Beef Don', 95000, 'Main', 'Savory beef rice bowl with umami sauce', true, 'default'),
  ('Salmon Aburi Don', 99000, 'Main', 'Torched salmon rice bowl', true, 'default'),
  ('Chicken Nanban Rice Bowl', 79000, 'Main', 'Crispy chicken with nanban sauce', true, 'default'),
  ('Wagyu Steak Fried Rice', 129000, 'Main', 'Premium wagyu fried rice', true, 'default'),
  ('Beef Sukiyaki Udon', 95000, 'Main', 'Rich beef sukiyaki with udon noodles', true, 'default'),
  -- Desserts
  ('Buranchi Honey Toast', 95000, 'Dessert', 'Signature honey toast', true, 'default'),
  ('Banoffee Crepes', 69000, 'Dessert', 'Banana toffee crepes', true, 'default'),
  ('Matcha Molten Lava Cake', 95000, 'Dessert', 'Rich matcha cake with molten center', true, 'default'),
  ('Ice Cream Single Scoop', 45000, 'Dessert', 'Stories of Sunday ice cream', true, 'default'),
  ('Ice Cream Double Scoop', 75000, 'Dessert', 'Stories of Sunday ice cream', true, 'default'),
  ('Cake Slice (Speculoos/Chocolate/Yuzu)', 65000, 'Dessert', 'Artisan cake slice', true, 'default'),
  -- Drinks - Coffee
  ('Espresso', 29000, 'Beverage', 'Single shot espresso', true, 'default'),
  ('Americano (Hot)', 35000, 'Beverage', 'Hot americano', true, 'default'),
  ('Americano (Iced)', 37000, 'Beverage', 'Iced americano', true, 'default'),
  ('Latte (Hot)', 37000, 'Beverage', 'Hot cafe latte', true, 'default'),
  ('Latte (Iced)', 39000, 'Beverage', 'Iced cafe latte', true, 'default'),
  ('Matcha Latte (Hot)', 38000, 'Beverage', 'Hot matcha latte', true, 'default'),
  ('Matcha Latte (Iced)', 42000, 'Beverage', 'Iced matcha latte', true, 'default'),
  ('Cocoa (Hot)', 37000, 'Beverage', 'Hot chocolate', true, 'default'),
  ('Cocoa (Iced)', 39000, 'Beverage', 'Iced chocolate', true, 'default'),
  ('Coffee Bear Latte', 45000, 'Beverage', 'Signature bear latte', true, 'default'),
  ('Matcha Bear Latte', 45000, 'Beverage', 'Matcha bear latte', true, 'default'),
  ('Salted Caramel Latte', 46000, 'Beverage', 'Salted caramel latte', true, 'default'),
  ('Brown Sugar Latte', 46000, 'Beverage', 'Brown sugar latte', true, 'default'),
  ('Klepon Latte', 46000, 'Beverage', 'Indonesian klepon flavored latte', true, 'default'),
  -- Drinks - Tea & Others
  ('Iced Tea', 25000, 'Beverage', 'Classic iced tea', true, 'default'),
  ('Iced Lemon Tea', 28000, 'Beverage', 'Fresh lemon iced tea', true, 'default'),
  ('Iced Lychee Tea', 38000, 'Beverage', 'Lychee flavored iced tea', true, 'default'),
  ('Rose Lychee Tea', 42000, 'Beverage', 'Floral rose lychee tea', true, 'default'),
  ('Mocktail', 42000, 'Beverage', 'Non-alcoholic cocktail', true, 'default'),
  ('Mineral Water', 25000, 'Beverage', 'E+ mineral water', true, 'default'),
  ('Sparkling Water', 35000, 'Beverage', 'Sparkling water', true, 'default'),
  ('Infused Water', 22000, 'Beverage', 'Cucumber or lemon infused water', true, 'default'),
  ('Tea By Tema', 45000, 'Beverage', 'Premium tea blend', true, 'default');

-- BOOKINGS: Clean start (no pre-seeded bookings)
-- All tables remain available

-- ORDERS: Clean start (no pre-seeded orders)
-- Revenue will come from live POS transactions

-- CONVERSATIONS & MESSAGES: Clean start (no pre-seeded chats)
-- New conversations will be created live via WhatsApp

-- CAMPAIGNS: Clean start

-- ============================================
-- REWARDS
-- ============================================
DELETE FROM rewards;
INSERT INTO rewards (name, description, points_cost, category, is_active, restaurant_id) VALUES
  ('Free Iced Tea', 'Gratis 1 Iced Tea pilihan', 80, 'freebie', true, 'default'),
  ('Free Dessert', 'Gratis 1 dessert pilihan (max 69K)', 150, 'freebie', true, 'default'),
  ('Diskon 10%', 'Potongan 10% untuk total bill', 200, 'discount', true, 'default'),
  ('Free Main Course', 'Gratis 1 main course pilihan (max 95K)', 400, 'freebie', true, 'default'),
  ('Diskon 25%', 'Potongan 25% untuk total bill (max 100K)', 500, 'discount', true, 'default'),
  ('Buranchi Honey Toast Experience', 'Exclusive honey toast + 2 drinks untuk 2 orang', 800, 'experience', true, 'default'),
  ('Private Dining for 2', 'Dinner eksklusif di private room dengan 5-course menu', 1500, 'experience', true, 'default');


-- ##############################################################
-- # 005_tier_membership_fix.sql
-- ##############################################################

-- ============================================
-- 005: Tier is NULL for non-members
-- Only members get tiers (Bronze → Silver → Gold → Platinum)
-- Non-members can still visit and spend but don't earn points or have tiers
-- ============================================

-- Allow NULL tier
ALTER TABLE customers ALTER COLUMN tier DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN tier SET DEFAULT NULL;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tier_check;
ALTER TABLE customers ADD CONSTRAINT customers_tier_check
  CHECK (tier IS NULL OR tier IN ('Bronze', 'Silver', 'Gold', 'Platinum'));

-- Update tier trigger: only apply to members
CREATE OR REPLACE FUNCTION update_customer_tier()
RETURNS trigger AS $$
BEGIN
  -- Only update tier for members
  IF NEW.is_member = true THEN
    IF NEW.points >= 2500 THEN
      NEW.tier := 'Platinum';
    ELSIF NEW.points >= 1000 THEN
      NEW.tier := 'Gold';
    ELSIF NEW.points >= 300 THEN
      NEW.tier := 'Silver';
    ELSE
      NEW.tier := 'Bronze';
    END IF;
  ELSE
    -- Non-members have no tier and no points
    NEW.tier := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also trigger on is_member change (when someone becomes a member)
DROP TRIGGER IF EXISTS trg_customer_tier ON customers;
CREATE TRIGGER trg_customer_tier
  BEFORE UPDATE OF points, is_member ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customer_tier();


-- ##############################################################
-- # 006_add_missing_columns.sql
-- ##############################################################

-- Add customer_phone to bookings if missing
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_phone text;


-- ##############################################################
-- # 007_restaurant_settings.sql
-- ##############################################################

-- ============================================
-- 007: Restaurant settings table
-- All restaurant info in one place for bot responses
-- ============================================

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id text PRIMARY KEY DEFAULT 'default',
  name text NOT NULL DEFAULT 'Buranchi',
  tagline text DEFAULT 'Japanese-inspired cafe & dining',
  opening_hours text NOT NULL DEFAULT '11:00 - 22:00',
  last_order text DEFAULT '21:30',
  days_open text DEFAULT 'Setiap hari',
  location text DEFAULT '',
  phone text DEFAULT '',
  instagram text DEFAULT '',
  promo_text text DEFAULT '',
  welcome_message text DEFAULT '',
  restaurant_id text NOT NULL DEFAULT 'default'
);

INSERT INTO restaurant_settings (id, name, tagline, opening_hours, last_order, days_open, location, phone, instagram, promo_text, welcome_message, restaurant_id)
VALUES (
  'default',
  'Buranchi',
  'Japanese-inspired cafe & dining',
  '11:00 - 22:00',
  '21:30',
  'Setiap hari',
  'Jakarta',
  '+6221000000',
  '@buranchi.jkt',
  'Weekend Special — Diskon 20% all menu brunch!\nBirthday Month — Free dessert + 2x points member!',
  'Halo! Selamat datang di Buranchi 👋',
  'default'
) ON CONFLICT (id) DO NOTHING;


-- ##############################################################
-- # 008_expand_seating.sql
-- ##############################################################

-- Allow more seating types to match table zones
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_seating_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_seating_check
  CHECK (seating IN ('indoor', 'outdoor', 'window', 'private'));


-- ##############################################################
-- # 009_marketing_templates.sql
-- ##############################################################

-- Marketing templates support (WhatsApp Cloud API)
-- Cold outbound requires Meta-approved templates, not free-form text.

alter table campaigns
  add column if not exists template_name text,
  add column if not exists template_language text default 'en_US',
  add column if not exists template_params jsonb default '[]'::jsonb;

comment on column campaigns.template_name is 'Meta-approved template name (e.g. buranchi_promo_weekend). Required for cold outbound.';
comment on column campaigns.template_language is 'Template language code (en_US, id, etc.). Must match language registered in Meta.';
comment on column campaigns.template_params is 'JSONB array of placeholder values for template body {{1}}, {{2}}, etc. Use {{customer_name}} token to inject per-recipient name at send time.';


-- ##############################################################
-- # 010_rename_platinum_and_add_roles.sql
-- ##############################################################

-- ============================================
-- 010: Rename tier Platinum → Diamond, add 'admin' + 'kitchen' roles
-- ============================================

-- 1. Tier rename: Platinum → Diamond
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tier_check;
UPDATE customers SET tier = 'Diamond' WHERE tier = 'Platinum';
ALTER TABLE customers ADD CONSTRAINT customers_tier_check
  CHECK (tier IS NULL OR tier IN ('Bronze', 'Silver', 'Gold', 'Diamond'));

-- Update tier-assignment trigger to use Diamond
CREATE OR REPLACE FUNCTION update_customer_tier()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_member = true THEN
    IF NEW.points >= 2500 THEN
      NEW.tier := 'Diamond';
    ELSIF NEW.points >= 1000 THEN
      NEW.tier := 'Gold';
    ELSIF NEW.points >= 300 THEN
      NEW.tier := 'Silver';
    ELSE
      NEW.tier := 'Bronze';
    END IF;
  ELSE
    NEW.tier := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_tier ON customers;
CREATE TRIGGER trg_customer_tier
  BEFORE UPDATE OF points, is_member ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customer_tier();

-- Update points-earned multiplier function to use Diamond
CREATE OR REPLACE FUNCTION calculate_points_earned(amount_idr bigint, tier text)
RETURNS integer AS $$
BEGIN
  RETURN FLOOR((amount_idr / 1000.0) * CASE tier
    WHEN 'Diamond' THEN 2.0
    WHEN 'Gold' THEN 1.5
    WHEN 'Silver' THEN 1.25
    ELSE 1.0
  END);
END;
$$ LANGUAGE plpgsql;

-- 2. Roles: expand allowed set to include 'admin' and 'kitchen'
-- (Old set: owner, receptionist, cashier)
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('owner', 'admin', 'receptionist', 'cashier', 'kitchen'));

-- Migrate any existing 'receptionist' rows to 'admin'
UPDATE roles SET name = 'admin', description = 'Admin — Inbox, Booking, Marketing, Loyalty'
  WHERE name = 'receptionist';

-- Seed any missing roles (idempotent)
INSERT INTO roles (name, description) VALUES
  ('admin', 'Admin — Inbox, Booking, Marketing, Loyalty'),
  ('kitchen', 'Kitchen — Order tracker with timers')
ON CONFLICT (name) DO NOTHING;


-- ##############################################################
-- # 011_kitchen_status.sql
-- ##############################################################

-- ============================================
-- 011: Kitchen order pipeline
-- Adds kitchen_status + timing columns to orders so the kitchen
-- screen can track Received → Preparing → Done → Served and
-- measure prep performance.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS prep_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_done_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kitchen_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_kitchen_status_check
  CHECK (kitchen_status IN ('received', 'preparing', 'done', 'served'));

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders(kitchen_status);

-- Back-fill: any existing non-cancelled, non-paid orders are treated as received
UPDATE orders SET kitchen_status = 'received'
  WHERE kitchen_status IS NULL;


-- ##############################################################
-- # 012_payment_requests.sql
-- ##############################################################

-- ============================================
-- 012: Xendit QRIS payment requests
-- A payment request represents one "pay this table" attempt — it covers
-- every open order on that table at the moment the cashier hits Pay.
-- We keep it separate from the orders table so we can retry (new QR) or
-- fall back to cash without polluting the order history.
-- ============================================

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id text REFERENCES tables(id),
  external_id text NOT NULL UNIQUE,       -- the id we give Xendit
  xendit_qr_id text,                      -- Xendit's QR resource id
  qr_string text,                         -- qr string to render as a QR code
  amount integer NOT NULL,                -- rupiah total at request time
  method text NOT NULL DEFAULT 'qris'
    CHECK (method IN ('cash', 'debit', 'qris', 'transfer')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired', 'cancelled')),
  order_ids uuid[] NOT NULL DEFAULT '{}', -- orders this request will pay
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  restaurant_id text NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_table
  ON payment_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status
  ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_external_id
  ON payment_requests(external_id);


-- ##############################################################
-- # 013_order_sessions.sql
-- ##############################################################

-- ============================================
-- 013: Order sessions (parent-child tickets) + kitchen KPIs
-- A "session" = every order placed on a table between an Available→Occupied
-- transition and the corresponding Pay. The first order in a session is the
-- parent (sequence=1, displayed as "-A"); every tambah order is a child
-- (sequence=2..N, displayed as "-B", "-C", ...).
--
-- Why: the kitchen needs to know "this is an add-on — the guest is already
-- eating, get it out fast." The biller needs to total them together.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);

-- Back-fill: any existing open orders without a session are treated as
-- their own session (sequence stays at 1, session_id = own id).
UPDATE orders SET session_id = id WHERE session_id IS NULL;


-- ##############################################################
-- # 014_tenants_foundation.sql
-- ##############################################################

-- ============================================
-- 014: Multi-tenant foundation
-- Adds the `tenants` table and a `tenant_id` column on every tenant-owned
-- table, then backfills existing rows (which all currently belong to
-- "Buranchi" via the legacy `restaurant_id = 'default'` marker) to a single
-- newly-created tenant row. The legacy `restaurant_id` columns stay in
-- place during the strangler-fig refactor and will be dropped later
-- (PR 12) once every code path reads from `tenant_id`.
-- ============================================

-- ----------------------------------------------------------
-- 1. Tenants table
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'restaurant',
  slug text NOT NULL UNIQUE,
  email text,
  phone text,
  address text,
  logo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  -- subscription_status mirrors the live subscription state. PR 4 will
  -- introduce a richer `tenant_subscriptions` table and keep this column
  -- in sync via trigger; for now it's the source of truth.
  subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status);

-- ----------------------------------------------------------
-- 2. Seed Buranchi as the first tenant.
-- A deterministic UUID lets backend code reference it without a lookup
-- during the rest of the strangler refactor.
-- ----------------------------------------------------------
INSERT INTO tenants (
  id, business_name, business_type, slug,
  status, subscription_status, trial_ends_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Buranchi',
  'restaurant',
  'buranchi',
  'active',
  'active',                            -- existing customer, skip trial
  now() + interval '365 days'           -- effectively always-on for now
) ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------
-- 3. Add nullable tenant_id to every tenant-owned table.
-- Nullable for now so the backfill below can populate it cleanly.
-- ----------------------------------------------------------
ALTER TABLE customers           ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tables              ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE bookings            ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE orders              ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE menu_items          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE rewards             ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE redemptions         ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE campaigns           ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE conversations       ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE messages            ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feedback_requests   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE payment_requests    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- ----------------------------------------------------------
-- 4. Backfill: every existing row belongs to Buranchi.
-- Using "tenant_id IS NULL" instead of "restaurant_id = 'default'" so this
-- migration is idempotent — re-running it is safe.
-- ----------------------------------------------------------
DO $$
DECLARE
  buranchi_id constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE customers           SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE tables              SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE bookings            SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE orders              SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE menu_items          SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE rewards             SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE redemptions         SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE campaigns           SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE conversations       SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE messages            SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE feedback_requests   SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE restaurant_settings SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
  UPDATE payment_requests    SET tenant_id = buranchi_id WHERE tenant_id IS NULL;
END $$;

-- ----------------------------------------------------------
-- 5. Default tenant_id to Buranchi.
-- Until PR 3 teaches the backend to pass tenant_id explicitly, INSERTs
-- coming from the legacy code path will land on Buranchi via this default.
-- The default will be removed in PR 12 when the strangler refactor finishes.
-- ----------------------------------------------------------
ALTER TABLE customers           ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE tables              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE bookings            ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE orders              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE menu_items          ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE rewards             ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE redemptions         ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE campaigns           ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE conversations       ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE messages            ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE feedback_requests   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE restaurant_settings ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payment_requests    ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Lock tenant_id to NOT NULL now that backfill + default are in place.
ALTER TABLE customers           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tables              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE bookings            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE orders              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE menu_items          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rewards             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE redemptions         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE campaigns           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE conversations       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE feedback_requests   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE restaurant_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_requests    ALTER COLUMN tenant_id SET NOT NULL;

-- ----------------------------------------------------------
-- 6. Indexes — every tenant-scoped query starts with a tenant_id filter,
-- so every tenant-owned table benefits from a btree on tenant_id.
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_tenant           ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tables_tenant              ON tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant            ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant              ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant          ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rewards_tenant             ON rewards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_tenant         ON redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant           ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant       ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant            ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_tenant   ON feedback_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant    ON payment_requests(tenant_id);

-- ----------------------------------------------------------
-- 7. updated_at autotouch on tenants — useful once super-admin starts
-- editing them.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_tenants_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_tenants ON tenants;
CREATE TRIGGER trg_touch_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_tenants_updated_at();

