const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDb, run, get, all, clearAllData } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cache Control Middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/admin') || req.url.endsWith('.html') || req.url === '/' || req.url === '/admin') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

// Serve static assets & store root & admin subfolder
app.get('/admin', (req, res) => {
  res.redirect('/admin/');
});
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// WIPE / RESET ALL DATA ENDPOINT
app.post('/api/reset-all-data', async (req, res) => {
  try {
    await clearAllData();
    res.json({ success: true, message: 'Todos los datos fueron eliminados correctamente.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 1. PRODUCTS & VARIANTS
// ==========================================

// Store endpoint: Get active products with variants
app.get('/api/products', async (req, res) => {
  try {
    const products = await all(`SELECT * FROM products WHERE is_deleted = 0 ORDER BY created_at DESC`);
    for (const p of products) {
      p.specs = p.specs ? JSON.parse(p.specs) : [];
      p.variants = await all(`SELECT * FROM product_variants WHERE product_id = ?`, [p.id]);
    }
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin endpoint: Get all products (including soft-deleted)
app.get('/api/products/admin', async (req, res) => {
  try {
    const products = await all(`SELECT p.*, c.name as category_name, s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`);
    for (const p of products) {
      p.specs = p.specs ? JSON.parse(p.specs) : [];
      p.variants = await all(`SELECT * FROM product_variants WHERE product_id = ?`, [p.id]);
    }
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create product
app.post('/api/products', async (req, res) => {
  try {
    const { id, sku, name, category_id, supplier_id, cost, default_price, image, description, specs, variants } = req.body;
    const prodId = id || 'BH-' + String(Date.now()).slice(-4);
    const prodSku = sku || prodId;
    const specsJson = JSON.stringify(specs || []);

    await run(
      `INSERT INTO products (id, sku, name, category_id, supplier_id, cost, default_price, image, description, specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prodId, prodSku, name, category_id || 'mallas', supplier_id || null, cost || 0, default_price || 0, image || '', description || '', specsJson]
    );

    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        await run(
          `INSERT INTO product_variants (product_id, size, color, stock, low_stock_threshold) VALUES (?, ?, ?, ?, ?)`,
          [prodId, v.size, v.color || 'Negro', v.stock || 0, v.low_stock_threshold || 3]
        );
      }
    }

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PRODUCT_CREATED', `Producto creado: ${name} (${prodId})`]);
    res.json({ success: true, id: prodId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, category_id, supplier_id, cost, default_price, image, description, specs } = req.body;
    const specsJson = JSON.stringify(specs || []);

    await run(
      `UPDATE products SET name = ?, category_id = ?, supplier_id = ?, cost = ?, default_price = ?, image = ?, description = ?, specs = ? WHERE id = ?`,
      [name, category_id, supplier_id || null, cost, default_price, image, description, specsJson, req.params.id]
    );

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PRODUCT_UPDATED', `Producto actualizado: ${name} (${req.params.id})`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Soft Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await run(`UPDATE products SET is_deleted = 1 WHERE id = ?`, [req.params.id]);
    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PRODUCT_DELETED', `Producto marcado como eliminado (soft delete): ${req.params.id}`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Permanent Hard Delete product
app.delete('/api/products/:id/hard', async (req, res) => {
  try {
    await run(`DELETE FROM product_variants WHERE product_id = ?`, [req.params.id]);
    await run(`DELETE FROM products WHERE id = ?`, [req.params.id]);
    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PRODUCT_HARD_DELETED', `Producto eliminado definitivamente: ${req.params.id}`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore soft-deleted product
app.post('/api/products/:id/restore', async (req, res) => {
  try {
    await run(`UPDATE products SET is_deleted = 0 WHERE id = ?`, [req.params.id]);
    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PRODUCT_RESTORED', `Producto restaurado: ${req.params.id}`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manage Variants & Stock Adjustment
app.post('/api/variants', async (req, res) => {
  try {
    const { product_id, size, color, stock, low_stock_threshold } = req.body;
    const result = await run(
      `INSERT INTO product_variants (product_id, size, color, stock, low_stock_threshold) VALUES (?, ?, ?, ?, ?)`,
      [product_id, size, color || 'Negro', stock || 0, low_stock_threshold || 3]
    );
    res.json({ success: true, variant_id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/variants/:id/stock', async (req, res) => {
  try {
    const { stock, type, reason, supplier_id, unit_cost } = req.body;
    const variant = await get(`SELECT * FROM product_variants WHERE id = ?`, [req.params.id]);
    if (!variant) return res.status(404).json({ success: false, error: 'Variante no encontrada' });

    const diff = stock - variant.stock;
    await run(`UPDATE product_variants SET stock = ? WHERE id = ?`, [stock, req.params.id]);

    const movType = type || (diff >= 0 ? 'ENTRADA' : 'AJUSTE_PERDIDA');
    await run(
      `INSERT INTO stock_movements (product_id, variant_id, type, quantity, unit_cost, supplier_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [variant.product_id, variant.id, movType, Math.abs(diff), unit_cost || 0, supplier_id || null, reason || 'Modificación manual de stock']
    );

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['STOCK_MUTATED', `Stock de variante #${variant.id} (${variant.product_id} / ${variant.size} / ${variant.color}) actualizado a ${stock} (${diff >= 0 ? '+' : ''}${diff})`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await all(`SELECT * FROM categories`);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { id, name } = req.body;
    const catId = id || name.toLowerCase().replace(/\s+/g, '_');
    await run(`INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`, [catId, name]);
    res.json({ success: true, id: catId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. SUPPLIERS (PROVEEDORES)
// ==========================================
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await all(`SELECT * FROM suppliers ORDER BY name ASC`);
    res.json({ success: true, suppliers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const { name, contact, phone, instagram, email, notes } = req.body;
    const result = await run(
      `INSERT INTO suppliers (name, contact, phone, instagram, email, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, contact || '', phone || '', instagram || '', email || '', notes || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. SALES & QUICK SALE (+ AÑADIR VENTA)
// ==========================================
app.get('/api/sales', async (req, res) => {
  try {
    const sales = await all(`SELECT * FROM sales ORDER BY date DESC`);
    for (const s of sales) {
      s.items = await all(`SELECT * FROM sale_items WHERE sale_id = ?`, [s.id]);
    }
    res.json({ success: true, sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sales', async (req, res) => {
  try {
    const {
      origin,
      date,
      payment_method,
      delivery_type,
      discount,
      expenses_associated,
      customer_name,
      customer_phone,
      customer_ig,
      notes,
      items,
      mp_payment_id,
      external_reference
    } = req.body;

    const order_number = 'BH-SALE-' + Date.now();
    const saleDate = date || new Date().toISOString();
    const saleOrigin = origin || 'MANUAL';
    const disc = parseFloat(discount) || 0;
    const extraExp = parseFloat(expenses_associated) || 0;

    let subtotal = 0;
    let totalCost = 0;

    // Process items & update stock
    const processedItems = [];
    for (const item of items) {
      // Find variant & product
      const product = await get(`SELECT * FROM products WHERE id = ?`, [item.product_id]);
      const variant = await get(`SELECT * FROM product_variants WHERE id = ?`, [item.variant_id]);

      const price = parseFloat(item.price);
      const cost = variant ? (product.cost || 0) : (item.cost || 0);
      const qty = parseInt(item.quantity, 10) || 1;
      const lineTotal = price * qty;

      subtotal += lineTotal;
      totalCost += cost * qty;

      // Discount stock if variant exists
      if (variant) {
        const newStock = Math.max(0, variant.stock - qty);
        await run(`UPDATE product_variants SET stock = ? WHERE id = ?`, [newStock, variant.id]);
        await run(
          `INSERT INTO stock_movements (product_id, variant_id, type, quantity, unit_cost, reason) VALUES (?, ?, ?, ?, ?, ?)`,
          [product.id, variant.id, 'SALIDA_VENTA', qty, cost, `Venta ${order_number}`]
        );
      }

      processedItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product_name: product ? product.name : (item.product_name || 'Producto'),
        size: variant ? variant.size : (item.size || 'Único'),
        color: variant ? variant.color : (item.color || 'Negro'),
        price: price,
        cost: cost,
        quantity: qty,
        line_total: lineTotal
      });
    }

    const total = Math.max(0, subtotal - disc);
    const netProfit = total - totalCost - extraExp;
    const marginPct = total > 0 ? (netProfit / total) * 100 : 0;

    const saleResult = await run(
      `INSERT INTO sales (order_number, origin, date, payment_method, delivery_type, status, subtotal, discount, total, total_cost, total_expenses, net_profit, margin_pct, mp_payment_id, external_reference, customer_name, customer_phone, customer_ig, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_number,
        saleOrigin,
        saleDate,
        payment_method || 'Efectivo',
        delivery_type || 'Envío',
        'PAGADA',
        subtotal,
        disc,
        total,
        totalCost,
        extraExp,
        netProfit,
        marginPct,
        mp_payment_id || null,
        external_reference || null,
        customer_name || '',
        customer_phone || '',
        customer_ig || '',
        notes || ''
      ]
    );

    const saleId = saleResult.lastID;

    // Save line items
    for (const pi of processedItems) {
      await run(
        `INSERT INTO sale_items (sale_id, product_id, variant_id, product_name, size, color, price, cost, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, pi.product_id, pi.variant_id, pi.product_name, pi.size, pi.color, pi.price, pi.cost, pi.quantity, pi.line_total]
      );
    }

    // Register Cash Movement (INGRESO)
    await run(
      `INSERT INTO cash_movements (type, amount, source_type, source_id, description, date) VALUES (?, ?, ?, ?, ?, ?)`,
      ['INGRESO', total, 'VENTA', String(saleId), `Venta ${order_number} (${payment_method})`, saleDate]
    );

    // Audit Log
    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['SALE_REGISTERED', `Venta registrada: ${order_number} por $${total} (Ganancia: $${netProfit.toFixed(0)})`]);

    res.json({ success: true, saleId, order_number, total, netProfit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Sale Status & Handle Cancellation / Reversion
app.put('/api/sales/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const sale = await get(`SELECT * FROM sales WHERE id = ?`, [req.params.id]);
    if (!sale) return res.status(404).json({ success: false, error: 'Venta no encontrada' });

    const prevStatus = sale.status;
    if (prevStatus === status) return res.json({ success: true });

    await run(`UPDATE sales SET status = ? WHERE id = ?`, [status, req.params.id]);

    // Revert stock & cash if CANCELADA or REEMBOLSADA
    if ((status === 'CANCELADA' || status === 'REEMBOLSADA') && prevStatus === 'PAGADA') {
      const items = await all(`SELECT * FROM sale_items WHERE sale_id = ?`, [sale.id]);
      for (const item of items) {
        if (item.variant_id) {
          await run(`UPDATE product_variants SET stock = stock + ? WHERE id = ?`, [item.quantity, item.variant_id]);
          await run(
            `INSERT INTO stock_movements (product_id, variant_id, type, quantity, reason) VALUES (?, ?, ?, ?, ?)`,
            [item.product_id, item.variant_id, 'ENTRADA', item.quantity, `Reversión por venta ${sale.order_number} (${status})`]
          );
        }
      }
      // Register cash EGRESO for refund
      await run(
        `INSERT INTO cash_movements (type, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?)`,
        ['EGRESO', sale.total, 'EGRESO_MANUAL', String(sale.id), `Reversión/Reembolso Venta ${sale.order_number}`]
      );
    }

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['SALE_STATUS_CHANGED', `Estado de Venta ${sale.order_number} cambiado de ${prevStatus} a ${status}`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. EXPENSES (GASTOS)
// ==========================================
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await all(`SELECT * FROM expenses ORDER BY date DESC`);
    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { concept, category, amount, date, payment_method, notes } = req.body;
    const expDate = date || new Date().toISOString();
    const amt = parseFloat(amount);

    const result = await run(
      `INSERT INTO expenses (concept, category, amount, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [concept, category || 'Otros', amt, expDate, payment_method || 'Efectivo', notes || '']
    );

    // Register EGRESO in Cash Movements
    await run(
      `INSERT INTO cash_movements (type, amount, source_type, source_id, description, date) VALUES (?, ?, ?, ?, ?, ?)`,
      ['EGRESO', amt, 'GASTO', String(result.lastID), `Gasto: ${concept} (${category})`, expDate]
    );

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['EXPENSE_REGISTERED', `Gasto registrado: ${concept} por $${amt}`]);
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4.B PARTNER CAPITAL & CONTRIBUTIONS (VALEN & ZAIR)
// ==========================================
app.get('/api/partners/contributions', async (req, res) => {
  try {
    const contributions = await all(`SELECT * FROM partner_contributions ORDER BY date DESC`);
    
    // Calculate per-partner totals
    const partnersSummary = {
      valen: { aportes: 0, retiros: 0, neto: 0 },
      zair: { aportes: 0, retiros: 0, neto: 0 },
      otros: { aportes: 0, retiros: 0, neto: 0 }
    };

    for (const c of contributions) {
      const pKey = c.partner_name.toLowerCase().includes('valen') ? 'valen' : (c.partner_name.toLowerCase().includes('zair') ? 'zair' : 'otros');
      if (c.type === 'APORTE') {
        partnersSummary[pKey].aportes += c.amount;
      } else {
        partnersSummary[pKey].retiros += c.amount;
      }
    }

    partnersSummary.valen.neto = partnersSummary.valen.aportes - partnersSummary.valen.retiros;
    partnersSummary.zair.neto = partnersSummary.zair.aportes - partnersSummary.zair.retiros;
    partnersSummary.otros.neto = partnersSummary.otros.aportes - partnersSummary.otros.retiros;

    res.json({ success: true, contributions, partnersSummary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/partners/contributions', async (req, res) => {
  try {
    const { partner_name, type, amount, date, concept, payment_method, notes } = req.body;
    const cDate = date || new Date().toISOString();
    const amt = parseFloat(amount);
    const movType = type === 'RETIRO' ? 'RETIRO' : 'APORTE';

    const result = await run(
      `INSERT INTO partner_contributions (partner_name, type, amount, date, concept, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [partner_name, movType, amt, cDate, concept || 'Aporte de capital', payment_method || 'Efectivo', notes || '']
    );

    // Register in cash movements (Aporte = INGRESO, Retiro = EGRESO)
    const cashType = movType === 'APORTE' ? 'INGRESO' : 'EGRESO';
    await run(
      `INSERT INTO cash_movements (type, amount, source_type, source_id, description, date) VALUES (?, ?, ?, ?, ?, ?)`,
      [cashType, amt, 'APORTE_SOCIO', String(result.lastID), `${movType} Socio ${partner_name}: ${concept || 'Capital'}`, cDate]
    );

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['PARTNER_CONTRIBUTION', `${movType} de Socio ${partner_name} por $${amt} (${concept})`]);
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. CAJA & CASH MOVEMENTS
// ==========================================
app.get('/api/cash', async (req, res) => {
  try {
    const ingresos = await get(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'INGRESO'`);
    const egresos = await get(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'EGRESO'`);
    
    const totalIngresos = ingresos.total || 0;
    const totalEgresos = egresos.total || 0;
    const saldoDisponible = totalIngresos - totalEgresos;

    const movements = await all(`SELECT * FROM cash_movements ORDER BY date DESC LIMIT 100`);

    res.json({
      success: true,
      saldoDisponible,
      totalIngresos,
      totalEgresos,
      movements
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cash/movement', async (req, res) => {
  try {
    const { type, amount, description } = req.body;
    const amt = parseFloat(amount);
    const movType = type === 'EGRESO' ? 'EGRESO' : 'INGRESO';
    const sourceType = movType === 'INGRESO' ? 'INGRESO_MANUAL' : 'EGRESO_MANUAL';

    await run(
      `INSERT INTO cash_movements (type, amount, source_type, description) VALUES (?, ?, ?, ?)`,
      [movType, amt, sourceType, description || 'Movimiento manual de caja']
    );

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['CASH_MANUAL_MUTATION', `Movimiento manual de caja: ${movType} por $${amt} (${description})`]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. DASHBOARD METRICS & STATS
// ==========================================
app.get('/api/stats', async (req, res) => {
  try {
    const { month, year } = req.query;
    let dateFilter = '';
    const params = [];

    if (month && year) {
      dateFilter = `WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?`;
      params.push(String(month).padStart(2, '0'), String(year));
    }

    // Monthly Sales & Financials
    const salesSummary = await get(
      `SELECT COUNT(*) as sales_count, SUM(total) as total_facturacion, SUM(total_cost) as total_costo, SUM(total_expenses) as total_gastos_asoc, SUM(net_profit) as total_ganancia FROM sales WHERE status = 'PAGADA' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}`,
      params
    );

    // Stock metrics
    const stockSummary = await get(`
      SELECT 
        SUM(pv.stock) as total_units,
        SUM(pv.stock * p.cost) as stock_cost_value,
        SUM(pv.stock * p.default_price) as stock_sales_value,
        COUNT(CASE WHEN pv.stock <= pv.low_stock_threshold THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN pv.stock = 0 THEN 1 END) as out_of_stock_count
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE p.is_deleted = 0
    `);

    // Available cash balance
    const ingresos = await get(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'INGRESO'`);
    const egresos = await get(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'EGRESO'`);
    const cajaDisponible = (ingresos.total || 0) - (egresos.total || 0);

    // Top selling products
    const topProducts = await all(`
      SELECT 
        si.product_name,
        SUM(si.quantity) as units_sold,
        SUM(si.line_total) as revenue,
        SUM(si.line_total - (si.cost * si.quantity)) as profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'PAGADA'
      GROUP BY si.product_id, si.product_name
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    // Sales by Category
    const categoryStats = await all(`
      SELECT 
        c.name as category_name,
        SUM(si.quantity) as units_sold,
        SUM(si.line_total) as revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE s.status = 'PAGADA'
      GROUP BY c.id
    `);

    res.json({
      success: true,
      metrics: {
        sales_count: salesSummary.sales_count || 0,
        facturacion: salesSummary.total_facturacion || 0,
        ganancia: salesSummary.total_ganancia || 0,
        stock_units: stockSummary.total_units || 0,
        inversion_stock: stockSummary.stock_cost_value || 0,
        potencial_venta_stock: stockSummary.stock_sales_value || 0,
        potencial_ganancia_stock: (stockSummary.stock_sales_value || 0) - (stockSummary.stock_cost_value || 0),
        caja: cajaDisponible,
        low_stock_count: stockSummary.low_stock_count || 0,
        out_of_stock_count: stockSummary.out_of_stock_count || 0
      },
      topProducts,
      categoryStats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Logs
app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await all(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100`);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. BACKUP & EXPORT
// ==========================================

// Create Full Backup (JSON)
app.get('/api/backup', async (req, res) => {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      products: await all(`SELECT * FROM products`),
      product_variants: await all(`SELECT * FROM product_variants`),
      categories: await all(`SELECT * FROM categories`),
      suppliers: await all(`SELECT * FROM suppliers`),
      sales: await all(`SELECT * FROM sales`),
      sale_items: await all(`SELECT * FROM sale_items`),
      expenses: await all(`SELECT * FROM expenses`),
      cash_movements: await all(`SELECT * FROM cash_movements`),
      stock_movements: await all(`SELECT * FROM stock_movements`),
      audit_logs: await all(`SELECT * FROM audit_logs`)
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=blackhaze_backup_${Date.now()}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore Backup
app.post('/api/backup/restore', async (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || !backupData.products || !backupData.sales) {
      return res.status(400).json({ success: false, error: 'Estructura de backup inválida' });
    }

    // Wipe tables & restore
    const tables = ['products', 'product_variants', 'categories', 'suppliers', 'sales', 'sale_items', 'expenses', 'cash_movements', 'stock_movements', 'audit_logs'];
    for (const t of tables) {
      await run(`DELETE FROM ${t}`);
    }

    for (const c of backupData.categories || []) {
      await run(`INSERT INTO categories (id, name) VALUES (?, ?)`, [c.id, c.name]);
    }
    for (const s of backupData.suppliers || []) {
      await run(`INSERT INTO suppliers (id, name, contact, phone, instagram, email, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [s.id, s.name, s.contact, s.phone, s.instagram, s.email, s.notes, s.created_at]);
    }
    for (const p of backupData.products || []) {
      await run(`INSERT INTO products (id, sku, name, category_id, supplier_id, cost, default_price, image, description, specs, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [p.id, p.sku, p.name, p.category_id, p.supplier_id, p.cost, p.default_price, p.image, p.description, p.specs, p.is_deleted, p.created_at]);
    }
    for (const v of backupData.product_variants || []) {
      await run(`INSERT INTO product_variants (id, product_id, size, color, stock, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?)`, [v.id, v.product_id, v.size, v.color, v.stock, v.low_stock_threshold]);
    }
    for (const sa of backupData.sales || []) {
      await run(`INSERT INTO sales (id, order_number, origin, date, payment_method, delivery_type, status, subtotal, discount, total, total_cost, total_expenses, net_profit, margin_pct, mp_payment_id, external_reference, customer_name, customer_phone, customer_ig, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [sa.id, sa.order_number, sa.origin, sa.date, sa.payment_method, sa.delivery_type, sa.status, sa.subtotal, sa.discount, sa.total, sa.total_cost, sa.total_expenses, sa.net_profit, sa.margin_pct, sa.mp_payment_id, sa.external_reference, sa.customer_name, sa.customer_phone, sa.customer_ig, sa.notes]);
    }
    for (const si of backupData.sale_items || []) {
      await run(`INSERT INTO sale_items (id, sale_id, product_id, variant_id, product_name, size, color, price, cost, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [si.id, si.sale_id, si.product_id, si.variant_id, si.product_name, si.size, si.color, si.price, si.cost, si.quantity, si.line_total]);
    }
    for (const ex of backupData.expenses || []) {
      await run(`INSERT INTO expenses (id, concept, category, amount, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`, [ex.id, ex.concept, ex.category, ex.amount, ex.date, ex.payment_method, ex.notes]);
    }
    for (const cm of backupData.cash_movements || []) {
      await run(`INSERT INTO cash_movements (id, type, amount, source_type, source_id, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)`, [cm.id, cm.type, cm.amount, cm.source_type, cm.source_id, cm.description, cm.date]);
    }

    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['BACKUP_RESTORED', 'Restauración completa de base de datos desde archivo de backup JSON.']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export CSV
app.get('/api/export/csv/:entity', async (req, res) => {
  try {
    const { entity } = req.params;
    let data = [];
    let fields = [];

    if (entity === 'products') {
      data = await all(`SELECT p.id, p.sku, p.name, c.name as categoria, p.cost as costo, p.default_price as precio FROM products p LEFT JOIN categories c ON p.category_id = c.id`);
      fields = ['id', 'sku', 'name', 'categoria', 'costo', 'precio'];
    } else if (entity === 'sales') {
      data = await all(`SELECT id, order_number, origin, date, payment_method, customer_name, total, net_profit, status FROM sales`);
      fields = ['id', 'order_number', 'origin', 'date', 'payment_method', 'customer_name', 'total', 'net_profit', 'status'];
    } else if (entity === 'expenses') {
      data = await all(`SELECT id, concept, category, amount, date, payment_method FROM expenses`);
      fields = ['id', 'concept', 'category', 'amount', 'date', 'payment_method'];
    } else if (entity === 'cash') {
      data = await all(`SELECT id, type, amount, source_type, description, date FROM cash_movements`);
      fields = ['id', 'type', 'amount', 'source_type', 'description', 'date'];
    } else {
      return res.status(400).json({ success: false, error: 'Entidad no soportada' });
    }

    let csvContent = fields.join(',') + '\n';
    for (const row of data) {
      csvContent += fields.map(f => `"${String(row[f] || '').replace(/"/g, '""')}"`).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=blackhaze_${entity}_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. MERCADO PAGO INTEGRATION & WEBHOOK
// ==========================================
app.post('/api/mp/create-preference', async (req, res) => {
  try {
    const { items, customer } = req.body;
    // Simple response structure simulation for MP checkout or live MP SDK connection if credentials provided
    const preferenceId = 'BH-PREF-' + Date.now();
    res.json({
      success: true,
      preferenceId,
      init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferenceId}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook endpoint with Idempotency check via payment_id / external_reference
app.post('/api/mp/webhook', async (req, res) => {
  try {
    const body = req.body;
    const paymentId = body.data ? body.data.id : (body.id || req.query.id);

    if (!paymentId) {
      return res.status(200).send('OK');
    }

    // Check if payment was already processed (Idempotency)
    const existingSale = await get(`SELECT * FROM sales WHERE mp_payment_id = ?`, [String(paymentId)]);
    if (existingSale) {
      console.log(`[MP WEBHOOK] Payment ${paymentId} already processed as sale ${existingSale.order_number}. Skipping.`);
      return res.status(200).send('IDEMPOTENT_OK');
    }

    // Process confirmed payment
    // In production environment with live MERCADOPAGO_ACCESS_TOKEN, fetch payment status from MP API:
    // const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
    
    // Simulating MP confirmed transaction details
    const order_number = 'BH-ONLINE-' + paymentId;
    const items = body.items || [];
    
    // Register as Online Sale
    const saleResult = await run(
      `INSERT INTO sales (order_number, origin, date, payment_method, delivery_type, status, subtotal, discount, total, total_cost, total_expenses, net_profit, margin_pct, mp_payment_id, external_reference, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_number,
        'TIENDA ONLINE',
        new Date().toISOString(),
        'Mercado Pago',
        'Envío',
        'PAGADA',
        body.total_amount || 62000,
        0,
        body.total_amount || 62000,
        30000,
        0,
        32000,
        51.6,
        String(paymentId),
        body.external_reference || null,
        body.payer ? (body.payer.first_name + ' ' + body.payer.last_name) : 'Cliente Tienda Online'
      ]
    );

    await run(`INSERT INTO cash_movements (type, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?)`, ['INGRESO', body.total_amount || 62000, 'VENTA', String(saleResult.lastID), `Venta Mercado Pago Webhook ${order_number}`]);
    await run(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, ['MP_WEBHOOK_PROCESSED', `Webhook de Mercado Pago procesado exitosamente: Payment ID #${paymentId}`]);

    res.status(200).send('WEBHOOK_PROCESSED');
  } catch (err) {
    console.error('[MP WEBHOOK ERROR]', err);
    res.status(500).send('ERROR');
  }
});

// Start Server & Init Database
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  BLACKHAZE CONTROL CENTER API & STORE RUNNING`);
    console.log(`  Store: http://localhost:${PORT}/`);
    console.log(`  Control Center: http://localhost:${PORT}/admin/`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('Error initializing database:', err);
});
