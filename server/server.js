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

// S3 client (Railway Storage Bucket)
let s3Client, s3Bucket;
if (process.env.BUCKET_ENDPOINT && process.env.BUCKET_ACCESS_KEY_ID) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: process.env.BUCKET_REGION || 'auto',
    endpoint: process.env.BUCKET_ENDPOINT,
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY,
    },
  });
  s3Bucket = process.env.BUCKET_NAME;
}

// Multer config (temporary local storage, then upload to S3)
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Serve static files
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// ========== HELPER: save uploaded file to S3 ==========
async function saveImage(file) {
  if (!file) return '';
  if (s3Client && s3Bucket) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const key = 'products/' + file.filename;
      await s3Client.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
      }));
      try { fs.unlinkSync(file.path); } catch(e) {}
      return 's3:' + key;
    } catch (e) {
      return '/uploads/' + file.filename;
    }
  }
  return '/uploads/' + file.filename;
}

// ========== HELPER: resolve image path to URL ==========
function imageUrl(image) {
  if (!image) return '';
  if (image.startsWith('s3:')) return '/api/image/' + image;
  if (image.startsWith('/uploads/')) return '/api/image/' + image.replace('/uploads/', '');
  return image;
}

// ========== IMAGE PROXY (serve from S3 or local) ==========
app.get('/api/image/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (key.startsWith('s3:')) {
      if (!s3Client || !s3Bucket) return res.status(404).end();
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const obj = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key.slice(3) }));
      res.set('Content-Type', obj.ContentType);
      res.set('Cache-Control', 'public, max-age=86400');
      obj.Body.pipe(res);
    } else {
      const filePath = path.join(uploadsDir, key);
      if (!fs.existsSync(filePath)) return res.status(404).end();
      if (filePath.endsWith('.png')) res.set('Content-Type', 'image/png');
      else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.set('Content-Type', 'image/jpeg');
      else if (filePath.endsWith('.webp')) res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) { res.status(404).end(); }
});

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
  const image = await saveImage(req.file);
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
  if (req.file) image = await saveImage(req.file);
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

// ========== ERROR HANDLER (must be after all routes) ==========
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 20MB allowed.' });
    return res.status(400).json({ message: 'Upload error: ' + err.message });
  }
  if (err) return res.status(500).json({ message: err.message });
  next();
});

// ========== DB RECOVERY ==========
app.post('/api/cleanup-volume', async (req, res) => {
  const { key } = req.body || {};
  if (key !== 'jio-reset-2026') return res.status(403).json({ message: 'Invalid key' });
  const dataDir = '/data';
  let deleted = [];
  try {
    if (fs.existsSync(dataDir)) {
      for (const entry of fs.readdirSync(dataDir)) {
        const fullPath = path.join(dataDir, entry);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          deleted.push(entry);
        } catch(e) { deleted.push(entry + ' (failed: ' + e.message + ')'); }
      }
    }
    res.json({ message: 'Volume cleaned', deleted, restarting: true });
    process.exit(0);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/reset-db', async (req, res) => {
  const { key } = req.body;
  if (key !== 'jio-reset-2026') return res.status(403).json({ message: 'Invalid key' });
  try {
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'jio_store.db');
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, dbPath + '.bak.' + Date.now());
      try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch(e){}
      try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch(e){}
    }
    res.json({ message: 'Database reset. Restarting...' });
    process.exit(0);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ========== START ==========
initDb().then(async () => {
  try {
    await db.get('PRAGMA integrity_check');
  } catch (e) {
    console.error('Database corrupted, recreating...');
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'jio_store.db');
    try { fs.renameSync(dbPath, dbPath + '.bak.' + Date.now()); } catch(e2){}
    try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch(e2){}
    try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch(e2){}
    const { initDb: initAgain } = require('./db');
    await initAgain();
  }
  app.listen(PORT, () => {
    console.log(`JIO Store running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
