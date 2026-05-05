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
