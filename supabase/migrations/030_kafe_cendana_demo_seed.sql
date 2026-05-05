-- ============================================
-- 030: Showcase demo seed — "Kafé Cendana".
--
-- Renames MK-001 from the placeholder "Meta Koda Demo" to a real-feeling
-- restaurant ("Kafé Cendana"), then seeds tables, a menu, loyalty rewards,
-- five demo members across all four tiers, and five marketing-message
-- drafts ready for the user to test-send.
--
-- Also enables RLS on `tenants` with a self-read policy so the frontend
-- can resolve its own business name via Supabase JOIN (no extra round-
-- trip needed). The service-role key bypasses RLS so the backend's
-- `current_user` lookup is unaffected.
--
-- Idempotent: each section is guarded by an "if this tenant has none yet"
-- check so re-running won't duplicate menu items, rewards, etc.
-- ============================================

DO $$
DECLARE
  demo_tid uuid;
  demo_slug text;
BEGIN
  SELECT id, slug INTO demo_tid, demo_slug
  FROM tenants
  WHERE business_name IN ('Meta Koda Demo', 'Kafé Cendana')
  LIMIT 1;

  IF demo_tid IS NULL THEN
    RAISE NOTICE 'Showcase tenant not found — skipping seed';
    RETURN;
  END IF;

  -- ----------------------------------------------------------
  -- 1. Rename tenant
  -- ----------------------------------------------------------
  UPDATE tenants
  SET business_name = 'Kafé Cendana',
      tenant_code = 'MK-001-Kafé Cendana',
      phone = COALESCE(phone, '+62 21 555 1212'),
      address = COALESCE(address, 'Jl. Cendana No. 7, Menteng, Jakarta Pusat')
  WHERE id = demo_tid;

  -- ----------------------------------------------------------
  -- 2. restaurant_settings — full profile (upsert)
  -- ----------------------------------------------------------
  INSERT INTO restaurant_settings (
    id, tenant_id, name, tagline, opening_hours, last_order, days_open,
    location, phone, instagram, promo_text, welcome_message
  ) VALUES (
    demo_slug, demo_tid,
    'Kafé Cendana',
    'Modern Indonesian bistro · Jakarta',
    '10:00 - 23:00',
    '22:30',
    'Setiap hari',
    'Jl. Cendana No. 7, Menteng, Jakarta Pusat',
    '+62 21 555 1212',
    '@kafecendana',
    E'Weekend Brunch — Free Kopi Susu Aren tiap pemesanan main course (Sab-Min, 10:00-14:00).\nMember Birthday — Free Es Teler + 2x poin sepanjang bulan ulang tahun.',
    'Halo! Selamat datang di Kafé Cendana 🌿 Mau reservasi atau lihat menu?'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tagline = EXCLUDED.tagline,
    opening_hours = EXCLUDED.opening_hours,
    last_order = EXCLUDED.last_order,
    days_open = EXCLUDED.days_open,
    location = EXCLUDED.location,
    phone = EXCLUDED.phone,
    instagram = EXCLUDED.instagram,
    promo_text = EXCLUDED.promo_text,
    welcome_message = EXCLUDED.welcome_message;

  -- ----------------------------------------------------------
  -- 3. Tables — 10 across 4 zones (id is text PK → upsert-safe)
  -- ----------------------------------------------------------
  INSERT INTO tables (id, capacity, zone, status, tenant_id) VALUES
    ('K1', 2, 'Indoor',  'available', demo_tid),
    ('K2', 2, 'Indoor',  'available', demo_tid),
    ('K3', 4, 'Indoor',  'available', demo_tid),
    ('K4', 4, 'Indoor',  'available', demo_tid),
    ('W1', 2, 'Window',  'available', demo_tid),
    ('W2', 4, 'Window',  'available', demo_tid),
    ('T1', 4, 'Outdoor', 'available', demo_tid),
    ('T2', 6, 'Outdoor', 'available', demo_tid),
    ('P1', 6, 'Private', 'available', demo_tid),
    ('P2', 8, 'Private', 'available', demo_tid)
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------
  -- 4. Menu — only seed if tenant has none yet
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE tenant_id = demo_tid) THEN
    INSERT INTO menu_items (name, price, category, description, is_available, tenant_id) VALUES
      ('Nasi Goreng Cendana',       65000,  'Main',     'Nasi goreng kambing dengan acar nanas dan kerupuk emping',  true, demo_tid),
      ('Bebek Kremes Spesial',      95000,  'Main',     'Bebek goreng presto dengan kremes renyah & sambal mangga',   true, demo_tid),
      ('Soto Betawi Premium',       85000,  'Main',     'Kuah santan kental, daging sapi pilihan, kerupuk emping',    true, demo_tid),
      ('Sate Maranggi',             75000,  'Main',     '10 tusuk daging sapi marinasi kecap, sambal oncom',          true, demo_tid),
      ('Gado-Gado Cendana',         55000,  'Main',     'Sayuran segar, telur, tahu, tempe, bumbu kacang spesial',    true, demo_tid),
      ('Mie Aceh Goreng',           62000,  'Main',     'Mie tebal pedas khas Aceh dengan udang & cumi',              true, demo_tid),
      ('Es Teler Klasik',           38000,  'Beverage', 'Alpukat, kelapa muda, nangka, susu, sirup cocopandan',       true, demo_tid),
      ('Es Cendol Durian',          42000,  'Beverage', 'Cendol pandan, santan, gula aren, topping durian montong',   true, demo_tid),
      ('Kopi Susu Aren',            32000,  'Beverage', 'Espresso, susu segar, gula aren cair',                       true, demo_tid),
      ('Wedang Jahe Sereh',         25000,  'Beverage', 'Jahe merah, sereh, daun pandan — disajikan hangat',          true, demo_tid),
      ('Klepon Latte',              45000,  'Dessert',  'Latte dengan saus klepon, parutan kelapa, gula merah',       true, demo_tid),
      ('Pisang Goreng Madu',        38000,  'Dessert',  'Pisang kepok crispy, drizzle madu hutan, taburan keju',      true, demo_tid);
  END IF;

  -- ----------------------------------------------------------
  -- 5. Rewards — only seed if tenant has none yet
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM rewards WHERE tenant_id = demo_tid) THEN
    INSERT INTO rewards (name, description, points_cost, category, is_active, tenant_id) VALUES
      ('Free Wedang Jahe',         'Gratis 1 Wedang Jahe Sereh untuk member',                  80,   'freebie',     true, demo_tid),
      ('Free Es Teler',            'Gratis 1 Es Teler Klasik',                                 100,  'freebie',     true, demo_tid),
      ('Diskon 10%',               'Potongan 10% untuk total bill (max Rp 50.000)',           200,  'discount',    true, demo_tid),
      ('Free Pisang Goreng',       'Gratis 1 porsi Pisang Goreng Madu',                        250,  'freebie',     true, demo_tid),
      ('Free Bebek Kremes',        'Gratis 1 Bebek Kremes Spesial',                            500,  'freebie',     true, demo_tid),
      ('Diskon 25%',               'Potongan 25% untuk total bill (max Rp 150.000)',          750,  'discount',    true, demo_tid),
      ('Voucher Rp 100k',          'Voucher Rp 100.000 untuk kunjungan berikutnya',           1000, 'discount',    true, demo_tid),
      ('Chef''s Tasting Dinner',   'Set menu eksklusif 5 hidangan untuk 2 orang',             2500, 'experience',  true, demo_tid);
  END IF;

  -- ----------------------------------------------------------
  -- 6. Demo customers — across all four tiers (per-tenant phone unique)
  -- ----------------------------------------------------------
  INSERT INTO customers
    (tenant_id, name, phone, email, points, total_visits, total_spent, tier, is_member, tags)
  VALUES
    (demo_tid, 'Anindya Saraswati', '6281234500001', 'anindya@example.id',  3120, 48, 5840000, 'Diamond', true, ARRAY['vip','reservation']),
    (demo_tid, 'Reza Pradana',      '6281234500002', 'reza@example.id',     1280, 22, 2150000, 'Gold',    true, ARRAY['regular']),
    (demo_tid, 'Maya Hartono',      '6281234500003', 'maya@example.id',      540, 11,  890000, 'Silver',  true, ARRAY['weekend']),
    (demo_tid, 'Ilham Mahendra',    '6281234500004', NULL,                   180,  4,  320000, 'Bronze',  true, ARRAY['new']),
    (demo_tid, 'Putri Wijaya',      '6281234500005', 'putri@example.id',     720, 14, 1240000, 'Silver',  true, ARRAY['family'])
  ON CONFLICT (tenant_id, phone) DO NOTHING;

  -- ----------------------------------------------------------
  -- 7. Marketing campaigns — only seed if tenant has none yet
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE tenant_id = demo_tid) THEN
    INSERT INTO campaigns
      (tenant_id, name, message, audience, audience_count, status)
    VALUES
      (
        demo_tid,
        'Welcome New Member',
        E'Halo {name}! Selamat datang di *Kafé Cendana* 🌿\n\nSebagai member baru, kamu langsung dapat *100 poin gratis*. Yuk kumpulin poin dengan setiap kunjungan dan tukar dengan menu favorit kamu.\n\nLihat menu: bit.ly/cendana-menu\nReservasi: balas pesan ini ya 🙏',
        'new_members', 0, 'draft'
      ),
      (
        demo_tid,
        'Birthday Treat',
        E'Selamat ulang tahun {name}! 🎂\n\nKami siapkan *free Es Teler Klasik* + *2x poin* sepanjang bulan ulang tahun kamu. Tunjukkan pesan ini ke kasir saat datang.\n\nDitunggu kunjungannya — semoga harimu menyenangkan! 🎉',
        'birthday_month', 0, 'draft'
      ),
      (
        demo_tid,
        'Re-engagement · 30 hari',
        E'Hai {name}, kangen sama Soto Betawi-nya? 🍜\n\nSudah 30 hari nggak ketemu. Datang minggu ini dan dapatkan *diskon 15%* dengan kode *KEMBALI15*.\n\nBerlaku sampai Minggu depan ya. Sampai ketemu! 🌿',
        'inactive_30d', 0, 'draft'
      ),
      (
        demo_tid,
        'Weekend Brunch Special',
        E'Weekend incoming! ☀️\n\nKafé Cendana punya promo spesial tiap Sabtu-Minggu jam 10:00-14:00:\n\n✨ *Free Kopi Susu Aren* untuk setiap pemesanan main course\n\nReservasi sekarang biar dapat meja favorit kamu — balas pesan ini dengan jam + jumlah orang ya.',
        'all_members', 0, 'draft'
      ),
      (
        demo_tid,
        'Menu Baru — Mie Aceh',
        E'Kabar gembira buat kamu pencinta pedas! 🌶️\n\nMenu baru di Kafé Cendana: *Mie Aceh Goreng* — mie tebal khas Aceh dengan udang & cumi segar. Pedasnya nampol, harum bumbunya bikin nagih.\n\n💚 Member dapat *diskon 10%* minggu pertama.\n\nReady di menu mulai hari ini!',
        'all_members', 0, 'draft'
      );
  END IF;

  RAISE NOTICE 'Kafé Cendana seed complete (tenant_id=%)', demo_tid;
END $$;


-- ----------------------------------------------------------
-- 8. RLS on tenants — frontend can read its own business name via JOIN.
--    Service-role bypasses RLS so backend `current_user` is unaffected.
-- ----------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_self_read ON tenants;
CREATE POLICY tenants_self_read ON tenants
  FOR SELECT
  USING (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

GRANT SELECT ON tenants TO authenticated;
