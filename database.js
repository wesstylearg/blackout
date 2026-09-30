const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'blackhaze.db');

// Ensure data folder exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  db.serialize();

  // Categories
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  // Suppliers
  await run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      instagram TEXT,
      email TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      supplier_id INTEGER,
      cost REAL DEFAULT 0,
      default_price REAL DEFAULT 0,
      image TEXT,
      description TEXT,
      specs TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  // Product Variants
  await run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 3,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Sales
  await run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      origin TEXT DEFAULT 'MANUAL', -- 'MANUAL' or 'TIENDA ONLINE'
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT NOT NULL, -- 'Efectivo', 'Transferencia', 'Mercado Pago'
      delivery_type TEXT DEFAULT 'Envío', -- 'Envío', 'Retiro'
      status TEXT DEFAULT 'PAGADA', -- 'PENDIENTE', 'PAGADA', 'CANCELADA', 'REEMBOLSADA'
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      margin_pct REAL DEFAULT 0,
      mp_payment_id TEXT,
      external_reference TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_ig TEXT,
      notes TEXT
    )
  `);

  // Sale Items
  await run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      variant_id INTEGER,
      product_name TEXT NOT NULL,
      size TEXT,
      color TEXT,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      line_total REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    )
  `);

  // Expenses (Gastos)
  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL, -- Mercadería, Packaging, Envíos, Publicidad, Herramientas, Comisiones, Pérdidas, Otros
      amount REAL NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT DEFAULT 'Efectivo',
      notes TEXT
    )
  `);

  // Partner Capital / Contributions (Aportes de Socios: Valen, Zair)
  await run(`
    CREATE TABLE IF NOT EXISTS partner_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_name TEXT NOT NULL, -- 'Valen', 'Zair'
      type TEXT NOT NULL, -- 'APORTE', 'RETIRO'
      amount REAL NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      concept TEXT,
      payment_method TEXT DEFAULT 'Efectivo',
      notes TEXT
    )
  `);

  // Cash Movements (Caja)
  await run(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'INGRESO' or 'EGRESO'
      amount REAL NOT NULL,
      source_type TEXT NOT NULL, -- 'VENTA', 'GASTO', 'INGRESO_MANUAL', 'EGRESO_MANUAL'
      source_id TEXT,
      description TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stock Movements (Ajustes & Historial)
  await run(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      variant_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'ENTRADA', 'SALIDA_VENTA', 'AJUSTE_PERDIDA', 'AJUSTE_ROTURA', 'AJUSTE_REGALO', 'AJUSTE_CORRECCION'
      quantity INTEGER NOT NULL,
      unit_cost REAL DEFAULT 0,
      supplier_id INTEGER,
      reason TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Audit Logs
  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      details TEXT
    )
  `);

  // Seed default categories
  const defaultCats = [
    { id: 'mallas', name: 'Mallas y Shorts' },
    { id: 'bermudas', name: 'Bermudas' },
    { id: 'remeras', name: 'Remeras' }
  ];
  for (const cat of defaultCats) {
    await run(`INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`, [cat.id, cat.name]);
  }
}

async function clearAllData() {
  const tables = ['products', 'product_variants', 'sales', 'sale_items', 'expenses', 'cash_movements', 'stock_movements', 'suppliers', 'partner_contributions', 'audit_logs'];
  for (const t of tables) {
    await run(`DELETE FROM ${t}`);
  }
  await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['DATABASE_WIPED', 'Base de datos vaciada por el usuario.']);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
  clearAllData
};
