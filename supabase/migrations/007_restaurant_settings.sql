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
