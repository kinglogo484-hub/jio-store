CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  category TEXT DEFAULT 'general',
  image TEXT DEFAULT '',
  sizes TEXT DEFAULT '',
  colors TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT DEFAULT '',
  items TEXT NOT NULL,
  total REAL NOT NULL,
  shipping_fee REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_info (
  id SERIAL PRIMARY KEY,
  method TEXT NOT NULL,
  number TEXT NOT NULL,
  holder_name TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id SERIAL PRIMARY KEY,
  governorate TEXT UNIQUE NOT NULL,
  fee REAL NOT NULL DEFAULT 0
);

-- Default admin
INSERT INTO admins (username, password) VALUES ('admin', 'jio2026') ON CONFLICT (username) DO NOTHING;

-- Default settings
INSERT INTO settings (key, value) VALUES ('shipping_fee', '50') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('min_order_amount', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('max_order_amount', '99999') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('store_name', 'JIO') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('currency', 'EGP') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('phone', '+201234567890') ON CONFLICT (key) DO NOTHING;

-- Default payment methods
INSERT INTO payment_info (method, number, holder_name) VALUES ('Vodafone Cash', '01000000000', 'JIO Store') ON CONFLICT DO NOTHING;
INSERT INTO payment_info (method, number, holder_name) VALUES ('InstaPay', 'jio@instapay.com', 'JIO Store') ON CONFLICT DO NOTHING;

-- Shipping rates
INSERT INTO shipping_rates (governorate, fee) VALUES ('Cairo', 40) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Giza', 40) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Alexandria', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Dakahlia', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Sharqia', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Qalyubia', 45) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Gharbia', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Monufia', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Beheira', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Kafr El Sheikh', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Damietta', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Port Said', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Ismailia', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Suez', 50) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('North Sinai', 70) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('South Sinai', 70) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Beni Suef', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Fayoum', 55) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Minya', 60) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Asyut', 65) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Sohag', 65) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Qena', 70) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Luxor', 70) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Aswan', 75) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Red Sea', 75) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('New Valley', 80) ON CONFLICT DO NOTHING;
INSERT INTO shipping_rates (governorate, fee) VALUES ('Matrouh', 80) ON CONFLICT DO NOTHING;

-- Sample products
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('Urban Edge Tee', 'Oversized cotton tee with signature JIO print', 350, 'T-Shirts', '', 'S, M, L, XL', 'Black, White, Grey') ON CONFLICT DO NOTHING;
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('Monochrome Hoodie', 'Premium heavyweight fleece hoodie', 850, 'Hoodies', '', 'M, L, XL', 'Black, Cream, Brown') ON CONFLICT DO NOTHING;
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('Nightfall Jacket', 'Water-resistant techwear jacket', 1500, 'Outerwear', '', 'M, L, XL', 'Black, Olive') ON CONFLICT DO NOTHING;
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('JIO Logo Cap', 'Structured 6-panel dad cap', 250, 'Accessories', '', 'One Size', 'Black, Beige') ON CONFLICT DO NOTHING;
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('Cargo Pants', 'Multi-pocket loose fit cargo pants', 700, 'Bottoms', '', 'S, M, L, XL', 'Black, Khaki') ON CONFLICT DO NOTHING;
INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES ('Limited Edition Tee', 'Drop #001 - numbered edition', 450, 'T-Shirts', '', 'S, M, L, XL', 'Black, White') ON CONFLICT DO NOTHING;
