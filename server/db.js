const DATABASE_URL = process.env.DATABASE_URL;
const dns = require('dns');
const net = require('net');

function pgify(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let db;

async function createPgPool() {
  const { Pool } = require('pg');
  const url = new URL(DATABASE_URL);
  const originalHost = url.hostname;

  try {
    // Try to resolve IPv6 first (Supabase often uses IPv6-only)
    const v6 = await dns.promises.resolve6(originalHost).catch(() => null);
    if (v6 && v6.length) {
      url.hostname = net.isIPv6(v6[0]) ? `[${v6[0]}]` : v6[0];
    } else {
      // Fallback to IPv4
      const v4 = await dns.promises.resolve4(originalHost).catch(() => null);
      if (v4 && v4.length) url.hostname = v4[0];
    }
  } catch (e) { /* use original hostname */ }

  let connStr = url.toString();
  // Fix URL-encoded colon in password
  if (connStr.includes('%3A')) connStr = connStr.replace('%3A', ':');

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  return pool;
}

if (DATABASE_URL) {
  // PostgreSQL — pool will be initialized in initDb()
  let _pool;
  const getPool = async () => {
    if (!_pool) _pool = await createPgPool();
    return _pool;
  };
  db = {
    async query(text, params) { const p = await getPool(); return p.query(pgify(text), params); },
    async get(text, params) { const p = await getPool(); const r = await p.query(pgify(text), params); return r.rows[0] || null; },
    async all(text, params) { const p = await getPool(); const r = await p.query(pgify(text), params); return r.rows; },
    async run(text, params) {
      const p = await getPool();
      const r = await p.query(pgify(text), params);
      return { lastInsertRowid: r.rows[0]?.id || null, changes: r.rowCount };
    },
    async transaction(fn) {
      const p = await getPool();
      await p.query('BEGIN');
      try { await fn(); await p.query('COMMIT'); }
      catch (e) { await p.query('ROLLBACK'); throw e; }
    }
  };
} else {
  // SQLite (local development)
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'jio_store.db');
  const fsMk = require('fs');
  const dbDir = path.dirname(dbPath);
  if (!fsMk.existsSync(dbDir)) fsMk.mkdirSync(dbDir, { recursive: true });
  // Clean up stale WAL files before opening (Railway volume may not support WAL)
  try { if (fsMk.existsSync(dbPath + '-wal')) fsMk.unlinkSync(dbPath + '-wal'); } catch(e){}
  try { if (fsMk.existsSync(dbPath + '-shm')) fsMk.unlinkSync(dbPath + '-shm'); } catch(e){}
  const sqlite = new Database(dbPath);
  try { sqlite.pragma('journal_mode = WAL'); } catch (e) { sqlite.pragma('journal_mode = DELETE'); }
  sqlite.pragma('foreign_keys = ON');
  db = {
    async query(text, params) { return { rows: sqlite.prepare(text).all(...(params || [])) }; },
    async get(text, params) { return sqlite.prepare(text).get(...(params || [])) || null; },
    async all(text, params) { return sqlite.prepare(text).all(...(params || [])); },
    async run(text, params) {
      const result = sqlite.prepare(text).run(...(params || []));
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    },
    async transaction(fn) { sqlite.transaction(fn)(); }
  };
}

async function initDb() {
  if (DATABASE_URL) {
    // PostgreSQL schema
    await db.run('CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT \'\', price REAL NOT NULL, category TEXT DEFAULT \'general\', image TEXT DEFAULT \'\', sizes TEXT DEFAULT \'\', colors TEXT DEFAULT \'\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await db.run('CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT DEFAULT \'\', items TEXT NOT NULL, total REAL NOT NULL, shipping_fee REAL DEFAULT 0, status TEXT DEFAULT \'pending\', payment_method TEXT DEFAULT \'\', notes TEXT DEFAULT \'\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await db.run('CREATE TABLE IF NOT EXISTS payment_info (id SERIAL PRIMARY KEY, method TEXT NOT NULL, number TEXT NOT NULL, holder_name TEXT DEFAULT \'\', is_active INTEGER DEFAULT 1)');
    await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await db.run('CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)');
    await db.run('CREATE TABLE IF NOT EXISTS shipping_rates (id SERIAL PRIMARY KEY, governorate TEXT UNIQUE NOT NULL, fee REAL NOT NULL DEFAULT 0)');

    const admin = await db.get('SELECT COUNT(*) as count FROM admins');
    if (parseInt(admin.count) === 0) await db.run("INSERT INTO admins (username, password) VALUES ($1, $2)", ['admin', 'jio2026']);

    const defSettings = [['shipping_fee','50'],['min_order_amount','0'],['max_order_amount','99999'],['store_name','JIO'],['currency','EGP'],['phone','+201234567890']];
    for (const [k, v] of defSettings) await db.run("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [k, v]);

    const payCount = await db.get('SELECT COUNT(*) as count FROM payment_info');
    await db.run("INSERT INTO payment_info (method, number, holder_name) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM payment_info WHERE method = 'Cash on Delivery')", ['Cash on Delivery', '—', 'Pay when received']);
    if (parseInt(payCount.count) === 0) {
      await db.run("INSERT INTO payment_info (method, number, holder_name) VALUES ($1, $2, $3)", ['Vodafone Cash', '01000000000', 'JIO Store']);
      await db.run("INSERT INTO payment_info (method, number, holder_name) VALUES ($1, $2, $3)", ['InstaPay', 'jio@instapay.com', 'JIO Store']);
    }

    const shipCount = await db.get('SELECT COUNT(*) as count FROM shipping_rates');
    if (parseInt(shipCount.count) === 0) {
      const govs = [['Cairo',40],['Giza',40],['Alexandria',50],['Dakahlia',50],['Sharqia',50],['Qalyubia',45],['Gharbia',50],['Monufia',50],['Beheira',55],['Kafr El Sheikh',55],['Damietta',55],['Port Said',55],['Ismailia',50],['Suez',50],['North Sinai',70],['South Sinai',70],['Beni Suef',55],['Fayoum',55],['Minya',60],['Asyut',65],['Sohag',65],['Qena',70],['Luxor',70],['Aswan',75],['Red Sea',75],['New Valley',80],['Matrouh',80]];
      for (const [g, f] of govs) await db.run("INSERT INTO shipping_rates (governorate, fee) VALUES ($1, $2) ON CONFLICT DO NOTHING", [g, f]);
    }

    const prods = [['Urban Edge Tee','Oversized cotton tee with signature JIO print',350,'T-Shirts','','S, M, L, XL','Black, White, Grey'],['Monochrome Hoodie','Premium heavyweight fleece hoodie',850,'Hoodies','','M, L, XL','Black, Cream, Brown'],['Nightfall Jacket','Water-resistant techwear jacket',1500,'Outerwear','','M, L, XL','Black, Olive'],['JIO Logo Cap','Structured 6-panel dad cap',250,'Accessories','','One Size','Black, Beige'],['Cargo Pants','Multi-pocket loose fit cargo pants',700,'Bottoms','','S, M, L, XL','Black, Khaki'],['Limited Edition Tee','Drop #001 - numbered edition',450,'T-Shirts','','S, M, L, XL','Black, White']];
    for (const [n,d,p,c,i,s,col] of prods) await db.run("INSERT INTO products (name, description, price, category, image, sizes, colors) SELECT $1, $2, $3, $4, $5, $6, $7 WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = $8)", [n,d,p,c,i,s,col,n]);
  } else {
    // SQLite path
    const path = require('path');
    const fs = require('fs');
    const Database = require('better-sqlite3');
    const dbPath2 = process.env.SQLITE_PATH || path.join(__dirname, 'jio_store.db');
    const fsMk2 = require('fs');
    const dbDir2 = path.dirname(dbPath2);
    if (!fsMk2.existsSync(dbDir2)) fsMk2.mkdirSync(dbDir2, { recursive: true });
    // Clean up stale WAL files before opening
    try { if (fs.existsSync(dbPath2 + '-wal')) fs.unlinkSync(dbPath2 + '-wal'); } catch(e){}
    try { if (fs.existsSync(dbPath2 + '-shm')) fs.unlinkSync(dbPath2 + '-shm'); } catch(e){}
    const sqlite = new Database(dbPath2);
    try { sqlite.pragma('journal_mode = WAL'); } catch (e) { sqlite.pragma('journal_mode = DELETE'); }
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL NOT NULL, category TEXT DEFAULT 'general', image TEXT DEFAULT '', sizes TEXT DEFAULT '', colors TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT DEFAULT '', items TEXT NOT NULL, total REAL NOT NULL, shipping_fee REAL DEFAULT 0, status TEXT DEFAULT 'pending', payment_method TEXT DEFAULT '', notes TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS payment_info (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, number TEXT NOT NULL, holder_name TEXT DEFAULT '', is_active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shipping_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, governorate TEXT UNIQUE NOT NULL, fee REAL NOT NULL DEFAULT 0);
    `);
    try { sqlite.exec('ALTER TABLE products ADD COLUMN sizes TEXT DEFAULT ""'); } catch (e) {}
    try { sqlite.exec('ALTER TABLE products ADD COLUMN colors TEXT DEFAULT ""'); } catch (e) {}

    if (!fs.existsSync(path.join(__dirname, '..', 'uploads'))) fs.mkdirSync(path.join(__dirname, '..', 'uploads'), { recursive: true });

    if (sqlite.prepare('SELECT COUNT(*) as count FROM admins').get().count === 0) sqlite.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run('admin', 'jio2026');

    const defS = [['shipping_fee','50'],['min_order_amount','0'],['max_order_amount','99999'],['store_name','JIO'],['currency','EGP'],['phone','+201234567890']];
    const insS = sqlite.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [k,v] of defS) insS.run(k,v);

    const insPcash = sqlite.prepare("INSERT INTO payment_info (method, number, holder_name) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM payment_info WHERE method = 'Cash on Delivery')");
    insPcash.run('Cash on Delivery', '—', 'Pay when received');
    if (sqlite.prepare('SELECT COUNT(*) as count FROM payment_info').get().count === 0) {
      const insP = sqlite.prepare('INSERT INTO payment_info (method, number, holder_name) VALUES (?, ?, ?)');
      insP.run('Vodafone Cash', '01000000000', 'JIO Store');
      insP.run('InstaPay', 'jio@instapay.com', 'JIO Store');
    }

    if (sqlite.prepare('SELECT COUNT(*) as count FROM shipping_rates').get().count === 0) {
      const govs = [['Cairo',40],['Giza',40],['Alexandria',50],['Dakahlia',50],['Sharqia',50],['Qalyubia',45],['Gharbia',50],['Monufia',50],['Beheira',55],['Kafr El Sheikh',55],['Damietta',55],['Port Said',55],['Ismailia',50],['Suez',50],['North Sinai',70],['South Sinai',70],['Beni Suef',55],['Fayoum',55],['Minya',60],['Asyut',65],['Sohag',65],['Qena',70],['Luxor',70],['Aswan',75],['Red Sea',75],['New Valley',80],['Matrouh',80]];
      const ins = sqlite.prepare('INSERT OR IGNORE INTO shipping_rates (governorate, fee) VALUES (?, ?)');
      for (const [g,f] of govs) ins.run(g,f);
    }

    const sampleProds = [['Urban Edge Tee','Oversized cotton tee with signature JIO print',350,'T-Shirts','','S, M, L, XL','Black, White, Grey'],['Monochrome Hoodie','Premium heavyweight fleece hoodie',850,'Hoodies','','M, L, XL','Black, Cream, Brown'],['Nightfall Jacket','Water-resistant techwear jacket',1500,'Outerwear','','M, L, XL','Black, Olive'],['JIO Logo Cap','Structured 6-panel dad cap',250,'Accessories','','One Size','Black, Beige'],['Cargo Pants','Multi-pocket loose fit cargo pants',700,'Bottoms','','S, M, L, XL','Black, Khaki'],['Limited Edition Tee','Drop #001 - numbered edition',450,'T-Shirts','','S, M, L, XL','Black, White']];
    const insP = sqlite.prepare('INSERT INTO products (name, description, price, category, image, sizes, colors) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)');
    for (const [n,d,p,c,i,s,col] of sampleProds) insP.run(n,d,p,c,i,s,col,n);
  }
}

module.exports = { db, initDb };
