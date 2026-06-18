const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { db, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure uploads dir exists
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB allowed.' });
    return res.status(400).json({ message: 'Upload error: ' + err.message });
  }
  if (err) return res.status(500).json({ message: err.message });
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// ========== AUTH ==========
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await db.get('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password]);
  if (admin) return res.json({ success: true });
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// ========== PRODUCTS ==========
app.get('/api/products', async (req, res) => {
  const products = await db.all('SELECT * FROM products ORDER BY created_at DESC');
  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  const { name, description, price, category, sizes, colors } = req.body;
  if (!name || !price) return res.status(400).json({ message: 'Name and price are required' });
  const image = req.file ? '/uploads/' + req.file.filename : (req.body.image || '');
  const product = await db.get(
    'INSERT INTO products (name, description, price, category, image, sizes, colors) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [name, description || '', parseFloat(price), category || 'general', image, sizes || '', colors || '']
  );
  res.status(201).json(product);
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  const { name, description, price, category, sizes, colors, keepImage } = req.body;
  const existing = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Product not found' });
  let image = existing.image;
  if (req.file) image = '/uploads/' + req.file.filename;
  else if (keepImage === 'false' || keepImage === false) image = '';
  const updated = await db.get(
    'UPDATE products SET name=?, description=?, price=?, category=?, image=?, sizes=?, colors=? WHERE id=? RETURNING *',
    [name || existing.name, description !== undefined ? description : existing.description,
     price ? parseFloat(price) : existing.price, category || existing.category, image,
     sizes !== undefined ? sizes : existing.sizes, colors !== undefined ? colors : existing.colors, req.params.id]
  );
  res.json(updated);
});

app.delete('/api/products/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Product not found' });
  await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== ORDERS ==========
app.get('/api/orders', async (req, res) => {
  const { status } = req.query;
  const orders = status
    ? await db.all('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', [status])
    : await db.all('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(orders);
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', async (req, res) => {
  const { customer_name, customer_phone, customer_address, items, total, shipping_fee, payment_method, notes } = req.body;
  if (!customer_name || !customer_phone || !items) {
    return res.status(400).json({ message: 'Name, phone, and items are required' });
  }
  const order = await db.get(
    'INSERT INTO orders (customer_name, customer_phone, customer_address, items, total, shipping_fee, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
    [customer_name, customer_phone, customer_address || '', JSON.stringify(items),
     parseFloat(total) || 0, parseFloat(shipping_fee) || 0, payment_method || '', notes || '']
  );
  res.status(201).json(order);
});

app.put('/api/orders/:id', async (req, res) => {
  const { status, notes } = req.body;
  const existing = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Order not found' });
  if (status) await db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  if (notes !== undefined) await db.run('UPDATE orders SET notes = ? WHERE id = ?', [notes, req.params.id]);
  const updated = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  res.json(updated);
});

app.delete('/api/orders/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Order not found' });
  await db.run('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== PAYMENT INFO ==========
app.get('/api/payments', async (req, res) => {
  const payments = await db.all('SELECT * FROM payment_info ORDER BY id ASC');
  res.json(payments);
});

app.post('/api/payments', async (req, res) => {
  const { method, number, holder_name } = req.body;
  if (!method || !number) return res.status(400).json({ message: 'Method and number are required' });
  const payment = await db.get(
    'INSERT INTO payment_info (method, number, holder_name) VALUES (?, ?, ?) RETURNING *',
    [method, number, holder_name || '']
  );
  res.status(201).json(payment);
});

app.put('/api/payments/:id', async (req, res) => {
  const { method, number, holder_name, is_active } = req.body;
  const existing = await db.get('SELECT * FROM payment_info WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Payment method not found' });
  const updated = await db.get(
    'UPDATE payment_info SET method=?, number=?, holder_name=?, is_active=? WHERE id=? RETURNING *',
    [method || existing.method, number || existing.number,
     holder_name !== undefined ? holder_name : existing.holder_name,
     is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active, req.params.id]
  );
  res.json(updated);
});

app.delete('/api/payments/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM payment_info WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Payment method not found' });
  await db.run('DELETE FROM payment_info WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== SETTINGS ==========
app.get('/api/settings', async (req, res) => {
  const settings = await db.all('SELECT * FROM settings');
  const result = {};
  for (const s of settings) result[s.key] = s.value;
  res.json(result);
});

app.put('/api/settings', async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, String(value)]);
  }
  const settings = await db.all('SELECT * FROM settings');
  const result = {};
  for (const s of settings) result[s.key] = s.value;
  res.json(result);
});

// ========== SHIPPING RATES ==========
app.get('/api/shipping-rates', async (req, res) => {
  const rates = await db.all('SELECT * FROM shipping_rates ORDER BY governorate ASC');
  res.json(rates);
});

app.post('/api/shipping-rates', async (req, res) => {
  const { governorate, fee } = req.body;
  if (!governorate || fee === undefined) return res.status(400).json({ message: 'Governorate and fee are required' });
  const existing = await db.get('SELECT id FROM shipping_rates WHERE governorate = ?', [governorate]);
  if (existing) return res.status(400).json({ message: 'Governorate already exists' });
  const rate = await db.get('INSERT INTO shipping_rates (governorate, fee) VALUES (?, ?) RETURNING *', [governorate, parseFloat(fee)]);
  res.status(201).json(rate);
});

app.put('/api/shipping-rates/:id', async (req, res) => {
  const { governorate, fee } = req.body;
  const existing = await db.get('SELECT * FROM shipping_rates WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Shipping rate not found' });
  const updated = await db.get(
    'UPDATE shipping_rates SET governorate=?, fee=? WHERE id=? RETURNING *',
    [governorate || existing.governorate, fee !== undefined ? parseFloat(fee) : existing.fee, req.params.id]
  );
  res.json(updated);
});

app.delete('/api/shipping-rates/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM shipping_rates WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Shipping rate not found' });
  await db.run('DELETE FROM shipping_rates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== STATS ==========
app.get('/api/stats', async (req, res) => {
  const totalOrders = (await db.get('SELECT COUNT(*) as count FROM orders')).count;
  const completedOrders = (await db.get('SELECT COUNT(*) as count FROM orders WHERE status = ?', ['completed'])).count;
  const pendingOrders = (await db.get('SELECT COUNT(*) as count FROM orders WHERE status = ?', ['pending'])).count;
  const totalRevenue = (await db.get('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = ?', ['completed'])).total;
  const totalProducts = (await db.get('SELECT COUNT(*) as count FROM products')).count;
  const totalCustomers = (await db.get('SELECT COUNT(DISTINCT customer_phone) as count FROM orders')).count;
  res.json({ totalOrders: parseInt(totalOrders), completedOrders: parseInt(completedOrders),
    pendingOrders: parseInt(pendingOrders), totalRevenue: parseFloat(totalRevenue) || 0,
    totalProducts: parseInt(totalProducts), totalCustomers: parseInt(totalCustomers) });
});

// ========== START ==========
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`JIO Store running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
