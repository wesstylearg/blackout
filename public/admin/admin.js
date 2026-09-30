/**
 * ==========================================================================
 * BLACKHAZE ADMIN — MOTOR INTEGRAL DE GESTIÓN, FINANZAS Y CLOUD REALTIME
 * - Arquitectura Híbrida: Offline-First con LocalStorage + Cloud Realtime Firestore
 * - SPA Reactiva sin recargas de página
 * - Lógica financiera precisa, control de inventario, stock y rentabilidad
 * ==========================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // PURGA PROACTIVA DE CACHÉ Y SERVICE WORKERS (CERO CACHÉ EN NAVEGADOR)
  // ==========================================================================
  try {
    localStorage.removeItem('bh_store_data_v3');
    localStorage.removeItem('bh_store_data_v2');
    localStorage.removeItem('bh_store_data_v1');
    localStorage.removeItem('bh_data');
    localStorage.removeItem('bh_firebase_config_v2');
  } catch (e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const r of regs) r.unregister();
    }).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then(keys => {
      for (const k of keys) caches.delete(k);
    }).catch(() => {});
  }

  // ==========================================================================
  // CONFIGURACIÓN OFICIAL CENTRAL DE FIREBASE (CONEXIÓN AUTOMÁTICA UNIVERSAL)
  // Todos los dispositivos conectan a la misma base de datos sin configurar nada
  // ==========================================================================
  const OFFICIAL_FIREBASE_CONFIG = {
    projectId: "blackhaze-app",
    appId: "1:395380855761:web:ebaef82f5ac0f36ca1c6f0",
    storageBucket: "blackhaze-app.firebasestorage.app",
    apiKey: "AIzaSyAWXmcStLgbkGR59qljC7-TjSRYHrNdYJw",
    authDomain: "blackhaze-app.firebaseapp.com",
    messagingSenderId: "395380855761"
  };

  // FORMATO DE MONEDA ARS (es-AR)
  const currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  });

  function formatARS(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) return '$ 0';
    return currencyFormatter.format(amount);
  }

  function formatPct(pct) {
    if (isNaN(pct)) return '0%';
    return pct.toFixed(1) + '%';
  }

  function resolveMediaUrl(url) {
    if (!url) return '';
    const clean = String(url).trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:') || clean.startsWith('blob:')) {
      return clean;
    }
    if (clean.startsWith('/')) {
      return clean;
    }
    return '../' + clean;
  }

  // ==========================================================================
  // DATOS BASE LIMPIOS (SIN DATOS FICTICIOS - INICIALIZACIÓN DE FALLBACK)
  // ==========================================================================
  const DEFAULT_DATA = {
    products: [],
    sales: [],
    expenses: [],
    cashMovements: [],
    partnerContributions: [],
    suppliers: [],
    calendarTasks: [],
    cloudinaryConfig: {
      cloudName: 'exwxofcr',
      uploadPreset: 'blackhaze_preset',
      folder: 'blackhaze/productos'
    },
    revision: 0,
    lastUpdated: 0
  };

  // ==========================================================================
  // ESTADO GLOBAL EN MEMORIA (AUTORIDAD ÚNICA: FIRESTORE EN LA NUBE)
  // ==========================================================================
  const CLIENT_ID = 'bh_cli_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
  let isFirestoreLoaded = false;
  let isCloudConnected = false;
  let state = JSON.parse(JSON.stringify(DEFAULT_DATA));
  let firestoreDb = null;
  let unsubscribeFirestore = null;
  let currentActiveTab = 'dashboard';

  // GUARDAR ESTADO DIRECTO EN FIRESTORE (SIN LOCALSTORAGE)
  async function saveState(propagateToCloud = true) {
    state.revision = (state.revision || 0) + 1;
    state.lastUpdated = Date.now();
    state.savedBy = CLIENT_ID;

    if (propagateToCloud && firestoreDb) {
      try {
        updateSyncStatusUI('syncing');
        await firestoreDb.collection('blackhaze_store').doc('main_data').set({
          products: state.products || [],
          sales: state.sales || [],
          expenses: state.expenses || [],
          cashMovements: state.cashMovements || [],
          partnerContributions: state.partnerContributions || [],
          suppliers: state.suppliers || [],
          calendarTasks: state.calendarTasks || [],
          cloudinaryConfig: state.cloudinaryConfig || { cloudName: '', uploadPreset: '', folder: 'blackhaze/productos' },
          revision: state.revision,
          lastUpdated: state.lastUpdated,
          savedBy: CLIENT_ID
        });
        updateSyncStatusUI('online');
      } catch (err) {
        console.error('[BH Cloud] Error guardando en Firestore:', err);
        updateSyncStatusUI('offline');
        showToast('Error al guardar en la nube de Firestore: ' + (err.message || 'Verifique conexión'), 'error');
      }
    }
  }

  // ==========================================================================
  // INICIALIZACIÓN DE FIREBASE SDK EN TIEMPO REAL (SIN REGISTRO MANUAL)
  // ==========================================================================
  function initFirebase() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[BH Cloud] Firebase SDK no está cargado');
        updateSyncStatusUI('offline');
        return;
      }

      // 1. Inicializar con la configuración oficial del proyecto si no está ya inicializado
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(OFFICIAL_FIREBASE_CONFIG);
      }

      firestoreDb = firebase.firestore();

      // Habilitar persistencia interna de Firestore para resiliencia ante micro-cortes
      try {
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      } catch (e) {}

      updateSyncStatusUI('connecting');

      // Escuchar cambios en vivo con onSnapshot (autoridad central)
      if (unsubscribeFirestore) unsubscribeFirestore();

      unsubscribeFirestore = firestoreDb.collection('blackhaze_store').doc('main_data')
        .onSnapshot(
          doc => {
            if (doc.exists) {
              // Si proviene de cambios pendientes locales de este mismo cliente en vuelo, no redibujar
              if (doc.metadata && doc.metadata.hasPendingWrites) {
                return;
              }

              const cloudData = doc.data();
              if (!cloudData) return;

              // Actualizar estado en memoria desde Firestore
              state.products = Array.isArray(cloudData.products) ? cloudData.products : DEFAULT_DATA.products;
              state.sales = Array.isArray(cloudData.sales) ? cloudData.sales : [];
              state.expenses = Array.isArray(cloudData.expenses) ? cloudData.expenses : [];
              state.cashMovements = Array.isArray(cloudData.cashMovements) ? cloudData.cashMovements : [];
              state.partnerContributions = Array.isArray(cloudData.partnerContributions) ? cloudData.partnerContributions : [];
              state.suppliers = Array.isArray(cloudData.suppliers) ? cloudData.suppliers : [];
              state.calendarTasks = Array.isArray(cloudData.calendarTasks) ? cloudData.calendarTasks : [];
              state.cloudinaryConfig = cloudData.cloudinaryConfig || state.cloudinaryConfig || { cloudName: '', uploadPreset: '', folder: 'blackhaze/productos' };
              state.revision = cloudData.revision || (state.revision || 0) + 1;
              state.lastUpdated = cloudData.lastUpdated || Date.now();
              state.savedBy = cloudData.savedBy || '';

              const wasFirst = !isFirestoreLoaded;
              isFirestoreLoaded = true;

              renderAll(false);
              updateSyncStatusUI('online');

              if (!wasFirst && cloudData.savedBy !== CLIENT_ID) {
                showToast('Datos actualizados en tiempo real desde otro dispositivo', 'info');
              }
            } else {
              // Primer uso absoluto en Firestore: sube el estado base limpio
              isFirestoreLoaded = true;
              saveState(true);
              updateSyncStatusUI('online');
            }
          },
          err => {
            console.error('[BH Cloud] Error en conexión en vivo con Firestore:', err);
            updateSyncStatusUI('offline');
          }
        );
    } catch (err) {
      console.error('[BH Cloud] No se pudo inicializar Firebase:', err);
      updateSyncStatusUI('offline');
    }
  }

  function updateSyncStatusUI(status) {
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    const btn = document.getElementById('btnSyncRefresh');
    if (!dot || !text) return;

    if (status === 'online') {
      isCloudConnected = true;
      dot.className = 'status-dot online';
      text.textContent = 'En línea (Nube)';
      if (btn) btn.classList.remove('spinning');
    } else if (status === 'syncing') {
      dot.className = 'status-dot';
      text.textContent = 'Sincronizando...';
      if (btn) btn.classList.add('spinning');
    } else if (status === 'connecting') {
      dot.className = 'status-dot';
      text.textContent = 'Conectando nube...';
      if (btn) btn.classList.add('spinning');
    } else {
      isCloudConnected = false;
      dot.className = 'status-dot offline';
      text.textContent = 'Modo Local';
      if (btn) btn.classList.remove('spinning');
    }
  }

  // ==========================================================================
  // HELPERS MATEMÁTICOS Y DE NEGOCIO
  // ==========================================================================
  function getStockSummary() {
    let totalUnits = 0;
    let totalCostVal = 0;
    let criticalItems = [];

    (state.products || []).forEach(p => {
      if (p.is_deleted) return;
      let prodUnits = 0;
      (p.variants || []).forEach(v => {
        const stock = parseInt(v.stock, 10) || 0;
        prodUnits += stock;
        totalUnits += stock;
        totalCostVal += stock * (p.cost || 0);

        if (stock <= 1) {
          criticalItems.push({
            name: p.name,
            size: v.size,
            stock: stock
          });
        }
      });
    });

    return { totalUnits, totalCostVal, criticalItems };
  }

  function getCajaSummary() {
    let saldoNeto = 0;
    let efectivo = 0;
    let digital = 0;
    let totalIngresos = 0;
    let totalEgresos = 0;

    (state.cashMovements || []).forEach(m => {
      const amt = parseFloat(m.amount) || 0;
      const isIngreso = m.type === 'INGRESO';
      const factor = isIngreso ? 1 : -1;

      saldoNeto += amt * factor;
      if (isIngreso) {
        totalIngresos += amt;
      } else {
        totalEgresos += amt;
      }

      if (m.payment_method === 'Efectivo') {
        efectivo += amt * factor;
      } else {
        digital += amt * factor;
      }
    });

    return { saldoNeto, efectivo, digital, totalIngresos, totalEgresos };
  }

  function getSalesMetrics() {
    const paidSales = (state.sales || []).filter(s => s.status === 'PAGADA');
    const totalFacturacion = paidSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const totalCostos = paidSales.reduce((acc, s) => acc + (s.total_cost || 0), 0);
    const totalGanancia = paidSales.reduce((acc, s) => acc + (s.net_profit || 0), 0);
    const margenNeto = totalFacturacion > 0 ? (totalGanancia / totalFacturacion) * 100 : 0;

    return {
      count: paidSales.length,
      facturacion: totalFacturacion,
      costos: totalCostos,
      ganancia: totalGanancia,
      margen: margenNeto
    };
  }

  function getPartnersSummary() {
    const summary = {
      valen: { aportes: 0, retiros: 0, neto: 0 },
      zair: { aportes: 0, retiros: 0, neto: 0 },
      totalNeto: 0
    };

    (state.partnerContributions || []).forEach(c => {
      const amt = parseFloat(c.amount) || 0;
      const pName = (c.partner_name || '').toLowerCase();

      if (pName.includes('valen')) {
        if (c.type === 'APORTE') summary.valen.aportes += amt;
        else summary.valen.retiros += amt;
      } else if (pName.includes('zair')) {
        if (c.type === 'APORTE') summary.zair.aportes += amt;
        else summary.zair.retiros += amt;
      }
    });

    summary.valen.neto = summary.valen.aportes - summary.valen.retiros;
    summary.zair.neto = summary.zair.aportes - summary.zair.retiros;
    summary.totalNeto = summary.valen.neto + summary.zair.neto;

    return summary;
  }

  // ==========================================================================
  // RENDERIZADO DE INTERFAZ (UI RENDERING)
  // ==========================================================================

  // 1. RENDER DASHBOARD
  function renderDashboard() {
    const salesM = getSalesMetrics();
    const stockM = getStockSummary();
    const cajaM = getCajaSummary();

    // KPIs
    const elVentasCount = document.getElementById('kpiVentasCount');
    const elFacturacion = document.getElementById('kpiFacturacion');
    const elGanancia = document.getElementById('kpiGanancia');
    const elMargenSub = document.getElementById('kpiMargenSub');
    const elStockUnits = document.getElementById('kpiStockUnits');
    const elCajaSaldo = document.getElementById('kpiCajaSaldo');
    const elInversionStock = document.getElementById('kpiInversionStock');

    if (elVentasCount) elVentasCount.textContent = salesM.count;
    if (elFacturacion) elFacturacion.textContent = formatARS(salesM.facturacion);
    if (elGanancia) elGanancia.textContent = formatARS(salesM.ganancia);
    if (elMargenSub) elMargenSub.textContent = `Margen neto real: ${formatPct(salesM.margen)}`;
    if (elStockUnits) elStockUnits.textContent = stockM.totalUnits;
    if (elCajaSaldo) elCajaSaldo.textContent = formatARS(cajaM.saldoNeto);
    if (elInversionStock) elInversionStock.textContent = formatARS(stockM.totalCostVal);

    // Sidebar Badges
    const badgeCaja = document.getElementById('badgeCajaSaldo');
    if (badgeCaja) badgeCaja.textContent = formatARS(cajaM.saldoNeto);

    const badgeProds = document.getElementById('badgeTotalProds');
    if (badgeProds) badgeProds.textContent = (state.products || []).filter(p => !p.is_deleted).length;

    const badgeVentas = document.getElementById('badgeTotalVentas');
    if (badgeVentas) badgeVentas.textContent = (state.sales || []).length;

    // Alerta Stock Crítico
    const alertBanner = document.getElementById('dashStockAlertBanner');
    const alertText = document.getElementById('dashStockAlertText');
    if (alertBanner && alertText) {
      if (stockM.criticalItems.length > 0) {
        alertBanner.style.display = 'flex';
        const itemsStr = stockM.criticalItems.slice(0, 3).map(i => `${i.name} (${i.size}: ${i.stock}u)`).join(', ');
        alertText.textContent = `Atención: ${stockM.criticalItems.length} variante(s) con stock crítico o agotadas: ${itemsStr}`;
      } else {
        alertBanner.style.display = 'none';
      }
    }

    // Últimas Ventas en Dashboard
    const tbody = document.getElementById('dashUltimasVentasTbody');
    if (tbody) {
      const ultimas = (state.sales || []).slice(0, 5);
      if (ultimas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">No hay ventas registradas aún.</td></tr>';
      } else {
        tbody.innerHTML = ultimas.map(s => {
          const itemsDesc = (s.items || []).map(i => `${i.quantity}x ${i.product_name} (${i.size})`).join(', ');
          const isCancel = s.status === 'CANCELADA';
          const badgeClass = isCancel ? 'badge-red' : 'badge-green';
          return `
            <tr>
              <td data-label="Fecha">${new Date(s.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
              <td data-label="Nº Orden"><strong>${s.order_number}</strong></td>
              <td data-label="Cliente">${s.customer_name || 'Consumidor Final'}</td>
              <td data-label="Prendas" style="max-width: 220px;" title="${itemsDesc}">${itemsDesc}</td>
              <td data-label="Medio Pago"><span class="badge badge-purple">${s.payment_method}</span></td>
              <td data-label="Total"><strong class="font-mono">${formatARS(s.total)}</strong></td>
              <td data-label="Ganancia"><span class="font-mono" style="color: var(--green); font-weight:700;">${formatARS(s.net_profit)}</span></td>
              <td data-label="Estado"><span class="badge ${badgeClass}">${s.status}</span></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // 2. RENDER CAJA Y MOVIMIENTOS
  function renderCaja() {
    const cajaM = getCajaSummary();
    const elSaldoNeto = document.getElementById('cajaSaldoNetoTotal');
    const elEfectivo = document.getElementById('cajaSaldoEfectivo');
    const elDigital = document.getElementById('cajaSaldoDigital');
    const elEgresos = document.getElementById('cajaTotalEgresos');

    if (elSaldoNeto) elSaldoNeto.textContent = formatARS(cajaM.saldoNeto);
    if (elEfectivo) elEfectivo.textContent = formatARS(cajaM.efectivo);
    if (elDigital) elDigital.textContent = formatARS(cajaM.digital);
    if (elEgresos) elEgresos.textContent = formatARS(cajaM.totalEgresos);

    const filterTipo = document.getElementById('filterCajaTipo')?.value || 'all';
    const filterCat = document.getElementById('filterCajaCat')?.value || 'all';
    const search = (document.getElementById('searchCajaInput')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('cajaMovementsTbody');
    if (!tbody) return;

    let movs = [...(state.cashMovements || [])].reverse();

    // Filtro por tipo
    if (filterTipo === 'INGRESO') {
      movs = movs.filter(m => m.type === 'INGRESO');
    } else if (filterTipo === 'EGRESO') {
      movs = movs.filter(m => m.type === 'EGRESO');
    } else if (filterTipo === 'GASTO') {
      movs = movs.filter(m => m.source_type === 'GASTO');
    } else if (filterTipo === 'VENTA') {
      movs = movs.filter(m => m.source_type === 'VENTA' || m.source_type === 'ANULACION_VENTA');
    } else if (filterTipo === 'APORTE_SOCIO') {
      movs = movs.filter(m => m.source_type === 'APORTE_SOCIO');
    }

    // Filtro por categoría
    if (filterCat !== 'all') {
      movs = movs.filter(m => {
        if (m.category === filterCat) return true;
        if (m.description && m.description.toLowerCase().includes(filterCat.toLowerCase())) return true;
        return false;
      });
    }

    // Búsqueda por texto
    if (search) {
      movs = movs.filter(m => {
        const desc = (m.description || '').toLowerCase();
        const src = (m.source_type || '').toLowerCase();
        const cat = (m.category || '').toLowerCase();
        const med = (m.payment_method || '').toLowerCase();
        return desc.includes(search) || src.includes(search) || cat.includes(search) || med.includes(search);
      });
    }

    if (movs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Sin movimientos registrados que coincidan con los filtros.</td></tr>';
      return;
    }

    tbody.innerHTML = movs.map(m => {
      const isIngreso = m.type === 'INGRESO';
      const badgeClass = isIngreso ? 'badge-green' : 'badge-red';
      const sign = isIngreso ? '+' : '-';
      const colorStyle = isIngreso ? 'color: var(--green);' : 'color: var(--red);';
      const origenTag = m.category ? `${m.source_type || 'MOVIMIENTO'} • ${m.category}` : (m.source_type || 'MANUAL');

      // Botones de acción: Editar y Eliminar para CUALQUIER movimiento
      const editFn = (m.source_type === 'GASTO' && m.source_id)
        ? `window.bhApp.openEditGasto('${m.source_id}')`
        : `window.bhApp.openEditCashMovement('${m.id}')`;

      const accionesHtml = `
        <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
          <button class="btn btn-sm btn-outline" style="padding: 5px 9px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;" onclick="${editFn}" title="Editar Movimiento">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            <span>Editar</span>
          </button>
          <button class="btn btn-sm" style="padding: 5px 9px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.16); color: #ff5555; border: 1px solid rgba(239, 68, 68, 0.45); font-weight: 600; cursor: pointer; border-radius: var(--radius-sm);" onclick="window.bhApp.deleteCashMovement('${m.id}')" title="Eliminar Movimiento de Caja">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      return `
        <tr>
          <td style="white-space: nowrap;">${new Date(m.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td><span class="badge ${badgeClass}">${m.type}</span></td>
          <td><strong>${m.description || 'Sin concepto'}</strong></td>
          <td><span class="badge badge-purple">${origenTag}</span></td>
          <td>${m.payment_method || 'Efectivo'}</td>
          <td><strong class="font-mono" style="${colorStyle}">${sign} ${formatARS(m.amount)}</strong></td>
          <td style="text-align: right;">${accionesHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // 3. RENDER PRODUCTOS (CATÁLOGO)
  function renderProductos() {
    const grid = document.getElementById('productsCatalogGrid');
    if (!grid) return;

    const search = (document.getElementById('searchProdsInput')?.value || '').toLowerCase();
    const cat = document.getElementById('filterProdsCategoria')?.value || 'all';
    const estado = document.getElementById('filterProdsEstado')?.value || 'activos';

    let prods = [...(state.products || [])];

    if (estado === 'activos') {
      prods = prods.filter(p => !p.is_deleted);
    } else if (estado === 'eliminados') {
      prods = prods.filter(p => p.is_deleted);
    }

    if (cat !== 'all') {
      prods = prods.filter(p => p.category_id === cat);
    }

    if (search) {
      prods = prods.filter(p => p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search)));
    }

    if (prods.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 50px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); color: var(--text-sec);">
          No se encontraron productos que coincidan con los filtros.
        </div>
      `;
      return;
    }

    grid.innerHTML = prods.map(p => {
      const isDeleted = p.is_deleted === 1;
      const imgSrc = resolveMediaUrl(p.image);
      const mediaHtml = imgSrc
        ? `<img src="${imgSrc}" alt="${p.name}" onerror="this.onerror=null; this.src='../assets/mascota.svg'; this.style.opacity='0.4';">`
        : `
          <svg class="svg-product-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
          </svg>
        `;

      const sizePills = (p.variants || []).map(v => {
        const stock = parseInt(v.stock, 10) || 0;
        let cls = '';
        if (stock === 0) cls = 'critical';
        else if (stock <= (v.low_stock_threshold || 2)) cls = 'low';
        return `<span class="size-pill ${cls}">${v.size}: <strong>${stock}u</strong></span>`;
      }).join('');

      return `
        <article class="product-admin-card ${isDeleted ? 'is-deleted' : ''}" data-id="${p.id}">
          <div class="product-thumb-container">
            <span class="product-sku-chip">${p.sku || p.id}</span>
            ${mediaHtml}
          </div>
          <div class="product-card-body">
            <div class="product-card-meta">
              <span class="product-cat-name">${p.category_name || p.category_id}</span>
              <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto;">
                ${p.online_active !== false 
                  ? '<span class="badge badge-cyan" title="Visible en Tienda Web">🌐 En Web</span>' 
                  : '<span class="badge badge-gray" title="Oculto en Tienda Web">🔒 Oculto</span>'}
                ${p.featured ? '<span class="badge badge-purple" title="Destacado en Portada">⭐ Portada</span>' : ''}
                ${isDeleted ? '<span class="badge badge-red">Desactivado</span>' : '<span class="badge badge-green">Activo</span>'}
              </div>
            </div>
            <h3 class="product-card-title">${p.name}</h3>

            <div class="product-pricing-row">
              <div class="pricing-block">
                <span>Costo Fab.:</span>
                <strong>${formatARS(p.cost)}</strong>
              </div>
              <div class="pricing-block">
                <span>Precio Venta:</span>
                <strong style="color: var(--v-light);">${formatARS(p.price)}</strong>
              </div>
              <div class="pricing-block">
                <span>Margen:</span>
                <strong style="color: var(--green);">${formatPct(p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0)}</strong>
              </div>
            </div>

            <div class="product-sizes-block">
              <span class="sizes-label">Stock en tiempo real por talle:</span>
              <div class="size-matrix">
                ${sizePills}
              </div>
            </div>

            <div class="product-card-actions">
              ${!isDeleted ? `
                <button class="btn btn-sm btn-outline" onclick="window.bhApp.openEditProduct('${p.id}')">Editar</button>
                <button class="btn btn-sm btn-outline" onclick="window.bhApp.openStockModalFor('${p.id}')">Stock</button>
                <button class="btn btn-sm btn-outline" onclick="window.bhApp.toggleOnlineProduct('${p.id}')" title="Alternar visibilidad en tienda web">${p.online_active !== false ? 'Ocultar Web' : 'Publicar Web'}</button>
                <button class="btn btn-sm btn-danger" style="margin-left: auto;" onclick="window.bhApp.hardDeleteProduct('${p.id}')" title="Eliminar del sistema">Eliminar</button>
              ` : `
                <button class="btn btn-sm btn-outline" onclick="window.bhApp.toggleDeleteProduct('${p.id}')">Restaurar</button>
                <button class="btn btn-sm btn-danger" style="margin-left: auto;" onclick="window.bhApp.hardDeleteProduct('${p.id}')">Eliminar Definitivo</button>
              `}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // 4. RENDER INVENTARIO TABULAR CONSOLIDADO
  function renderInventario() {
    const tbody = document.getElementById('inventarioTableTbody');
    if (!tbody) return;

    const search = (document.getElementById('searchInventarioInput')?.value || '').toLowerCase();
    let prods = (state.products || []).filter(p => !p.is_deleted);

    if (search) {
      prods = prods.filter(p => p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search)));
    }

    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Sin productos registrados en el inventario.</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => {
      let totalU = 0;
      const breakdown = (p.variants || []).map(v => {
        const s = parseInt(v.stock, 10) || 0;
        totalU += s;
        const isCrit = s <= (v.low_stock_threshold || 2);
        return `<span class="size-pill ${isCrit ? 'critical' : ''}">${v.size}: <strong>${s}</strong></span>`;
      }).join(' ');

      const totalValuacion = totalU * (p.cost || 0);

      return `
        <tr>
          <td><span class="badge badge-purple">${p.sku || p.id}</span></td>
          <td><strong>${p.name}</strong></td>
          <td><span style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted);">${p.category_name || p.category_id}</span></td>
          <td><div class="size-matrix">${breakdown}</div></td>
          <td><strong class="font-mono" style="font-size: 1rem; color: #fff;">${totalU} u.</strong></td>
          <td class="font-mono">${formatARS(p.cost)}</td>
          <td class="font-mono" style="color: var(--v-light);">${formatARS(p.price)}</td>
          <td class="font-mono" style="color: var(--green);"><strong>${formatARS(totalValuacion)}</strong></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="window.bhApp.openStockModalFor('${p.id}')">Cargar Stock</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. RENDER VENTAS
  function renderVentas() {
    const tbody = document.getElementById('ventasTableTbody');
    if (!tbody) return;

    // Actualizar KPIs de la pestaña de Ventas
    const salesM = getSalesMetrics();
    const elCount = document.getElementById('ventasTabCount');
    const elFact = document.getElementById('ventasTabFacturacion');
    const elGan = document.getElementById('ventasTabGanancia');
    const elMargen = document.getElementById('ventasTabMargenSub');

    if (elCount) elCount.textContent = `${salesM.count} ventas`;
    if (elFact) elFact.textContent = formatARS(salesM.facturacion);
    if (elGan) elGan.textContent = formatARS(salesM.ganancia);
    if (elMargen) elMargen.textContent = `Margen estimado: ${formatPct(salesM.margen)}`;

    const search = (document.getElementById('searchVentasInput')?.value || '').toLowerCase();
    const filterEstado = document.getElementById('filterVentasEstado')?.value || 'all';
    const filterOrigen = document.getElementById('filterVentasOrigen')?.value || 'all';

    let ventas = [...(state.sales || [])].reverse();

    if (filterEstado !== 'all') {
      ventas = ventas.filter(v => v.status === filterEstado);
    }
    if (filterOrigen !== 'all') {
      ventas = ventas.filter(v => v.origin === filterOrigen);
    }
    if (search) {
      ventas = ventas.filter(v => 
        (v.customer_name && v.customer_name.toLowerCase().includes(search)) ||
        (v.order_number && v.order_number.toLowerCase().includes(search))
      );
    }

    if (ventas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 24px; color: var(--text-muted);">No se encontraron ventas para los filtros seleccionados.</td></tr>';
      return;
    }

    tbody.innerHTML = ventas.map(v => {
      const isPagada = v.status === 'PAGADA';
      const itemsHtml = (v.items || []).map(i => `
        <span class="venta-item-chip">
          <strong>${i.quantity}x</strong> ${i.product_name} <span class="chip-size">${i.size}</span>
        </span>
      `).join(' ');
      const origenBadge = v.origin === 'TIENDA ONLINE' ? 'badge-blue' : 'badge-purple';
      const statusBadge = isPagada ? 'badge-green' : 'badge-red';
      const fechaStr = new Date(v.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

      return `
        <tr class="venta-row ${isPagada ? '' : 'is-revertida'}">
          <td data-label="Fecha" class="cell-date">${fechaStr}</td>
          <td data-label="Nº Orden" class="cell-order"><strong class="order-code">${v.order_number}</strong></td>
          <td data-label="Origen" class="cell-origin"><span class="badge ${origenBadge}">${v.origin || 'MANUAL'}</span></td>
          <td data-label="Cliente" class="cell-customer">
            <strong class="customer-name">${v.customer_name || 'Consumidor Final'}</strong>
            ${v.customer_phone ? `<div class="customer-phone font-mono">${v.customer_phone}</div>` : ''}
          </td>
          <td data-label="Prendas" class="cell-items">${itemsHtml || '<span style="color:var(--text-muted);">-</span>'}</td>
          <td data-label="Medio Pago" class="cell-payment"><span class="badge badge-purple">${v.payment_method}</span></td>
          <td data-label="Subtotal" class="font-mono cell-subtotal">${formatARS(v.subtotal)}</td>
          <td data-label="Total" class="font-mono cell-total"><strong class="total-highlight">${formatARS(v.total)}</strong></td>
          <td data-label="Ganancia Neta" class="font-mono cell-profit"><span class="profit-highlight">${formatARS(v.net_profit)}</span></td>
          <td data-label="Estado" class="cell-status"><span class="badge ${statusBadge}">${v.status}</span></td>
          <td data-label="Acciones" class="cell-actions">
            <div class="row-actions-group">
              ${isPagada ? `
                <button class="btn btn-sm btn-outline btn-anular" onclick="window.bhApp.cancelSale(${v.id})" title="Anular venta y revertir stock y caja">Anular</button>
              ` : '<span class="revertida-text">Revertida</span>'}
              <button class="btn btn-sm btn-outline btn-delete-sale" onclick="window.bhApp.deleteSale(${v.id})" title="Eliminar definitivamente esta orden">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 6. RENDER GASTOS
  function renderGastos() {
    const tbody = document.getElementById('gastosTableTbody');
    if (!tbody) return;

    const filterCat = document.getElementById('filterGastosCat')?.value || 'all';
    let gastos = [...(state.expenses || [])].reverse();

    if (filterCat !== 'all') {
      gastos = gastos.filter(g => g.category === filterCat);
    }

    if (gastos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No hay gastos operativos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = gastos.map(g => `
      <tr>
        <td>${new Date(g.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</td>
        <td><strong>${g.concept}</strong></td>
        <td><span class="badge badge-yellow">${g.category}</span></td>
        <td>${g.payment_method || 'Efectivo'}</td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${g.notes || '-'}</td>
        <td><strong class="font-mono" style="color: var(--red);">- ${formatARS(g.amount)}</strong></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-outline" onclick="window.bhApp.openEditGasto('${g.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="window.bhApp.deleteGasto('${g.id}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // 7. RENDER SOCIOS & CAPITAL
  function renderSocios() {
    const summary = getPartnersSummary();
    const elValenNeto = document.getElementById('valenSaldoNeto');
    const elValenSub = document.getElementById('valenAportesSub');
    const elZairNeto = document.getElementById('zairSaldoNeto');
    const elZairSub = document.getElementById('zairAportesSub');
    const elTotalNeto = document.getElementById('totalCapitalNetoSocios');

    if (elValenNeto) elValenNeto.textContent = formatARS(summary.valen.neto);
    if (elValenSub) elValenSub.textContent = `Aportes: ${formatARS(summary.valen.aportes)} | Retiros: ${formatARS(summary.valen.retiros)}`;

    if (elZairNeto) elZairNeto.textContent = formatARS(summary.zair.neto);
    if (elZairSub) elZairSub.textContent = `Aportes: ${formatARS(summary.zair.aportes)} | Retiros: ${formatARS(summary.zair.retiros)}`;

    if (elTotalNeto) elTotalNeto.textContent = formatARS(summary.totalNeto);

    const tbody = document.getElementById('sociosTableTbody');
    if (!tbody) return;

    const list = [...(state.partnerContributions || [])].reverse();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Sin aportes o retiros registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(c => {
      const isAporte = c.type === 'APORTE';
      const badgeClass = isAporte ? 'badge-green' : 'badge-yellow';
      const sign = isAporte ? '+' : '-';
      const color = isAporte ? 'color: var(--green);' : 'color: var(--yellow);';

      return `
        <tr>
          <td>${new Date(c.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</td>
          <td><strong>${c.partner_name}</strong></td>
          <td><span class="badge ${badgeClass}">${c.type}</span></td>
          <td>${c.concept || '-'}</td>
          <td>${c.payment_method || 'Efectivo'}</td>
          <td><strong class="font-mono" style="${color}">${sign} ${formatARS(c.amount)}</strong></td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="window.bhApp.deleteSocioMovimiento('${c.id}')" title="Eliminar este movimiento">Eliminar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 8. RENDER RENTABILIDAD & PRICING
  function renderRentabilidadOptions() {
    const select = document.getElementById('rentProdSelector');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Calcular prenda nueva desde cero --</option>' +
      (state.products || []).filter(p => !p.is_deleted).map(p => `
        <option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>${p.name} (SKU: ${p.sku || p.id})</option>
      `).join('');
  }

  function calculateRentabilidad() {
    const costoBase = parseFloat(document.getElementById('rentCostoBase')?.value) || 0;
    const cantidad = parseInt(document.getElementById('rentCantidad')?.value, 10) || 1;
    const fleteTotal = parseFloat(document.getElementById('rentFleteTotal')?.value) || 0;
    const extrasUnit = parseFloat(document.getElementById('rentCostosExtras')?.value) || 0;
    let precioVenta = parseFloat(document.getElementById('rentPrecioVenta')?.value) || 0;
    const comisionCobroPct = parseFloat(document.getElementById('rentComisionCobro')?.value) || 0;

    // Sensibilidad sliders
    const sliderPrecioPct = parseFloat(document.getElementById('sliderPrecio')?.value) || 0;
    const sliderCostoPct = parseFloat(document.getElementById('sliderCosto')?.value) || 0;

    const sliderPrecioValEl = document.getElementById('sliderPrecioVal');
    const sliderCostoValEl = document.getElementById('sliderCostoVal');
    if (sliderPrecioValEl) sliderPrecioValEl.textContent = (sliderPrecioPct >= 0 ? '+' : '') + sliderPrecioPct + '%';
    if (sliderCostoValEl) sliderCostoValEl.textContent = '+' + sliderCostoPct + '%';

    // Aplicar sensibilidad
    const precioAjustado = precioVenta * (1 + sliderPrecioPct / 100);
    const costoBaseAjustado = costoBase * (1 + sliderCostoPct / 100);

    // Cálculos reales
    const fleteProrrateadoUnit = cantidad > 0 ? fleteTotal / cantidad : 0;
    const costoRealUnit = costoBaseAjustado + fleteProrrateadoUnit + extrasUnit;

    const comisionCobroMonto = (precioAjustado * comisionCobroPct) / 100;
    const ingresoNetoUnit = Math.max(0, precioAjustado - comisionCobroMonto);

    const gananciaUnit = ingresoNetoUnit - costoRealUnit;
    const inversionTotal = costoRealUnit * cantidad;
    const facturacionTotal = precioAjustado * cantidad;
    const gananciaTotalTanda = gananciaUnit * cantidad;

    const margenPct = precioAjustado > 0 ? (gananciaUnit / precioAjustado) * 100 : 0;
    const roiPct = inversionTotal > 0 ? (gananciaTotalTanda / inversionTotal) * 100 : 0;

    // Break Even
    const breakEvenUnits = gananciaUnit > 0 ? Math.ceil(inversionTotal / ingresoNetoUnit) : cantidad;

    // Actualizar UI
    const elCostoReal = document.getElementById('rentCostoRealUnit');
    const elIngresoNeto = document.getElementById('rentIngresoNetoUnit');
    const elGananciaUnit = document.getElementById('rentGananciaUnit');
    const elGananciaTanda = document.getElementById('rentGananciaTotalTanda');
    const elInversionTotal = document.getElementById('rentInversionTotal');
    const elFacturacion = document.getElementById('rentFacturacionProyectada');
    const elMargenText = document.getElementById('rentMargenPctText');
    const elRoiText = document.getElementById('rentRoiPctText');
    const elBreakEven = document.getElementById('rentBreakEvenText');

    if (elCostoReal) elCostoReal.textContent = formatARS(costoRealUnit);
    if (elIngresoNeto) elIngresoNeto.textContent = formatARS(ingresoNetoUnit);
    if (elGananciaUnit) {
      elGananciaUnit.textContent = formatARS(gananciaUnit);
      elGananciaUnit.style.color = gananciaUnit >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if (elGananciaTanda) {
      elGananciaTanda.textContent = formatARS(gananciaTotalTanda);
      elGananciaTanda.style.color = gananciaTotalTanda >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if (elInversionTotal) elInversionTotal.textContent = formatARS(inversionTotal);
    if (elFacturacion) elFacturacion.textContent = formatARS(facturacionTotal);
    if (elMargenText) elMargenText.textContent = formatPct(margenPct);
    if (elRoiText) elRoiText.textContent = formatPct(roiPct);
    if (elBreakEven) {
      elBreakEven.textContent = `${Math.min(breakEvenUnits, cantidad)} de ${cantidad} prendas (${formatPct((breakEvenUnits / cantidad) * 100)})`;
    }

    // Veredicto Visual
    const verdictCard = document.getElementById('rentVerdictCard');
    const verdictTitle = document.getElementById('rentVerdictTitle');
    const verdictDesc = document.getElementById('rentVerdictDesc');

    if (verdictCard && verdictTitle && verdictDesc) {
      verdictCard.className = 'results-verdict-card';
      if (margenPct >= 45) {
        verdictCard.classList.add('verdict-excelente');
        verdictTitle.textContent = 'EXCELENTE RENTABILIDAD';
        verdictDesc.textContent = 'Margen neto saludable superior al 45%. Óptimo retorno sobre el capital invertido.';
      } else if (margenPct >= 30) {
        verdictCard.classList.add('verdict-rentable');
        verdictTitle.textContent = 'RENTABILIDAD SALUDABLE';
        verdictDesc.textContent = 'Margen dentro del promedio de moda urbana (30% - 44%). Negocio sustentable.';
      } else if (margenPct > 0) {
        verdictCard.classList.add('verdict-ajustado');
        verdictTitle.textContent = 'MARGEN AJUSTADO';
        verdictDesc.textContent = 'Margen bajo (menor al 30%). Se recomienda ajustar costos de confección o subir precio.';
      } else {
        verdictCard.classList.add('verdict-perdida');
        verdictTitle.textContent = 'OPERACIÓN A PÉRDIDA';
        verdictDesc.textContent = 'El costo total supera los ingresos netos. Rediseñar estructura de costos urgente.';
      }
    }
  }

  // 9. RENDER PROVEEDORES
  function renderProveedores() {
    const tbody = document.getElementById('proveedoresTableTbody');
    if (!tbody) return;

    const list = state.suppliers || [];
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Sin proveedores registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.contact || '-'}</td>
        <td>
          ${p.phone ? `
            <a href="https://wa.me/${p.phone.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener" class="badge badge-green font-mono" style="text-decoration:none;">
              ${p.phone}
            </a>
          ` : '-'}
        </td>
        <td>
          ${p.instagram ? `
            <a href="https://instagram.com/${p.instagram.replace('@', '')}" target="_blank" rel="noopener" style="color: var(--v-light); text-decoration:none; font-weight:600;">
              ${p.instagram}
            </a>
          ` : '-'}
        </td>
        <td>${p.email || '-'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${p.notes || '-'}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-outline" onclick="window.bhApp.openEditProveedor('${p.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="window.bhApp.deleteProveedor('${p.id}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // RENDER GENERAL
  function renderAll(save = true) {
    if (save) saveState(true);
    renderDashboard();
    renderCaja();
    renderProductos();
    renderInventario();
    renderVentas();
    renderSocios();
    renderRentabilidadOptions();
    calculateRentabilidad();
    renderProveedores();
    renderCalendario();
  }

  // ==========================================================================
  // GESTIÓN DE NOTIFICACIONES TOAST
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ==========================================================================
  // NAVEGACIÓN POR TABS SPA
  // ==========================================================================
  function switchTab(tabId) {
    currentActiveTab = tabId;

    // Actualizar botones del sidebar
    document.querySelectorAll('.nav-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    // Actualizar paneles
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.remove('active');
    });

    const target = document.getElementById(`tab-${tabId}`);
    if (target) {
      target.classList.add('active');
    }

    // Actualizar título en topbar
    const titleEl = document.getElementById('currentViewTitle');
    if (titleEl) {
      const titles = {
        dashboard: 'DASHBOARD',
        caja: 'CAJA',
        socios: 'SOCIOS',
        calendario: 'CALENDARIO',
        productos: 'PRODUCTOS',
        inventario: 'STOCK',
        ventas: 'VENTAS',
        gastos: 'GASTOS',
        rentabilidad: 'RENTABILIDAD',
        proveedores: 'PROVEEDORES',
        backup: 'AJUSTES'
      };
      titleEl.textContent = titles[tabId] || tabId.toUpperCase();
    }

    // Cerrar sidebar en mobile si está abierto
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';

    // Re-renderizar módulo si corresponde
    if (tabId === 'rentabilidad') {
      calculateRentabilidad();
    } else if (tabId === 'calendario') {
      renderCalendario();
    }
  }

  // ==========================================================================
  // CONTROL DE MODALES
  // ==========================================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function setupModals() {
    // Cerrar al clickear botones [data-close-modal]
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) closeModal(modal.id);
      });
    });

    // Cerrar al clickear backdrop
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    // Escape
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
      }
    });
  }

  // ==========================================================================
  // OPERACIONES COMERCIALES & CRUD
  // ==========================================================================

  // 1. CARGA DE VENTA RÁPIDA CON CÁLCULO EN VIVO
  function setupSaleModal() {
    const prodSelect = document.getElementById('saleProductSelect');
    const varSelect = document.getElementById('saleVariantSelect');
    const qtyInput = document.getElementById('saleQuantity');
    const priceInput = document.getElementById('salePrice');
    const discInput = document.getElementById('saleDiscount');

    function populateSaleProducts() {
      if (!prodSelect) return;
      const prods = (state.products || []).filter(p => !p.is_deleted);
      prodSelect.innerHTML = prods.map(p => `<option value="${p.id}">${p.name} (SKU: ${p.sku || p.id})</option>`).join('');
      updateSaleVariants();
    }

    function updateSaleVariants() {
      if (!prodSelect || !varSelect) return;
      const prodId = prodSelect.value;
      const prod = (state.products || []).find(p => p.id === prodId);
      if (!prod) return;

      varSelect.innerHTML = (prod.variants || []).map(v => {
        return `<option value="${v.size}">${v.size} (Stock disp: ${v.stock}u)</option>`;
      }).join('');

      if (priceInput) priceInput.value = prod.price || 0;
      updateSalePreview();
    }

    function updateSalePreview() {
      const prodId = prodSelect?.value;
      const prod = (state.products || []).find(p => p.id === prodId);
      const qty = parseInt(qtyInput?.value, 10) || 1;
      const price = parseFloat(priceInput?.value) || 0;
      const disc = parseFloat(discInput?.value) || 0;

      const subtotal = price * qty;
      const total = Math.max(0, subtotal - disc);
      const costTotal = (prod ? prod.cost : 0) * qty;
      const profit = total - costTotal;

      const elSub = document.getElementById('salePreviewSubtotal');
      const elDisc = document.getElementById('salePreviewDiscount');
      const elTot = document.getElementById('salePreviewTotal');
      const elProf = document.getElementById('salePreviewProfit');

      if (elSub) elSub.textContent = formatARS(subtotal);
      if (elDisc) elDisc.textContent = `-${formatARS(disc)}`;
      if (elTot) elTot.textContent = formatARS(total);
      if (elProf) {
        elProf.textContent = `${formatARS(profit)} (${total > 0 ? ((profit / total) * 100).toFixed(1) : 0}%)`;
        elProf.style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
      }
    }

    if (prodSelect) prodSelect.addEventListener('change', updateSaleVariants);
    if (qtyInput) qtyInput.addEventListener('input', updateSalePreview);
    if (priceInput) priceInput.addEventListener('input', updateSalePreview);
    if (discInput) discInput.addEventListener('input', updateSalePreview);

    // Enviar Formulario de Venta
    const form = document.getElementById('formNuevaVenta');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();

        const prodId = prodSelect.value;
        const size = varSelect.value;
        const qty = parseInt(qtyInput.value, 10) || 1;
        const price = parseFloat(priceInput.value) || 0;
        const disc = parseFloat(discInput.value) || 0;
        const payMethod = document.getElementById('salePaymentMethod')?.value || 'Efectivo';
        const delivery = document.getElementById('saleDeliveryType')?.value || 'Envío';
        const custName = document.getElementById('saleCustomerName')?.value || 'Consumidor Final';
        const custPhone = document.getElementById('saleCustomerPhone')?.value || '';
        const origin = document.getElementById('saleOrigin')?.value || 'MANUAL';

        const prod = (state.products || []).find(p => p.id === prodId);
        if (!prod) return;

        const variant = (prod.variants || []).find(v => v.size === size);
        if (!variant) {
          showToast('Error: Talle no encontrado', 'error');
          return;
        }

        if (variant.stock < qty) {
          if (!confirm(`Stock insuficiente en talle ${size} (Disponible: ${variant.stock}u). ¿Deseas forzar la venta igualmente?`)) {
            return;
          }
        }

        // 1. Descontar Stock
        variant.stock = Math.max(0, variant.stock - qty);

        // 2. Crear Venta
        const subtotal = price * qty;
        const total = Math.max(0, subtotal - disc);
        const totalCost = (prod.cost || 0) * qty;
        const netProfit = total - totalCost;
        const orderNumber = 'BH-ORD-' + (1000 + (state.sales || []).length + 1);

        const newSale = {
          id: Date.now(),
          order_number: orderNumber,
          date: new Date().toISOString(),
          origin: origin,
          customer_name: custName,
          customer_phone: custPhone,
          payment_method: payMethod,
          delivery_type: delivery,
          status: 'PAGADA',
          subtotal: subtotal,
          discount: disc,
          total: total,
          total_cost: totalCost,
          net_profit: netProfit,
          margin_pct: total > 0 ? (netProfit / total) * 100 : 0,
          items: [
            {
              product_id: prod.id,
              product_name: prod.name,
              size: size,
              quantity: qty,
              price: price,
              cost: prod.cost || 0
            }
          ]
        };

        state.sales.push(newSale);

        // 3. Impactar en Caja como INGRESO
        state.cashMovements.push({
          id: Date.now() + 1,
          date: new Date().toISOString(),
          type: 'INGRESO',
          source_type: 'VENTA',
          amount: total,
          payment_method: payMethod,
          description: `Venta ${orderNumber} (${custName} - ${qty}x ${prod.name} ${size})`
        });

        saveState(true);
        closeModal('modalVenta');
        renderAll(false);
        showToast(`Venta ${orderNumber} registrada por ${formatARS(total)}`, 'success');
      });
    }

    // Botones para abrir modal venta
    const btnQuickSale = document.getElementById('btnQuickSale');
    const btnNuevaVenta = document.getElementById('btnNuevaVenta');
    if (btnQuickSale) {
      btnQuickSale.addEventListener('click', () => {
        populateSaleProducts();
        openModal('modalVenta');
      });
    }
    if (btnNuevaVenta) {
      btnNuevaVenta.addEventListener('click', () => {
        populateSaleProducts();
        openModal('modalVenta');
      });
    }
  }

  // CANCELAR / ANULAR VENTA CON REVERSIÓN DE STOCK Y CAJA
  function cancelSale(saleId) {
    const sale = (state.sales || []).find(s => s.id === saleId);
    if (!sale) return;

    if (sale.status === 'CANCELADA') {
      showToast('Esta venta ya fue cancelada', 'info');
      return;
    }

    if (!confirm(`¿Estás seguro de anular la orden ${sale.order_number}? Esto revertirá el stock de las prendas y restará ${formatARS(sale.total)} de la caja.`)) {
      return;
    }

    sale.status = 'CANCELADA';

    // 1. Revertir Stock
    (sale.items || []).forEach(item => {
      const prod = (state.products || []).find(p => p.id === item.product_id);
      if (prod) {
        const variant = (prod.variants || []).find(v => v.size === item.size);
        if (variant) {
          variant.stock += (item.quantity || 1);
        }
      }
    });

    // 2. Revertir Caja (EGRESO por reversión)
    state.cashMovements.push({
      id: Date.now(),
      date: new Date().toISOString(),
      type: 'EGRESO',
      source_type: 'ANULACION_VENTA',
      amount: sale.total,
      payment_method: sale.payment_method || 'Efectivo',
      description: `Reversión por anulación de Venta ${sale.order_number}`
    });

    saveState(true);
    renderAll(false);
    showToast(`Venta ${sale.order_number} anulada correctamente. Stock y dinero revertidos.`, 'success');
  }

  // ELIMINAR / DESHACER VENTA DEFINITIVAMENTE (REVERTIR STOCK Y CAJA)
  function deleteSale(saleId) {
    const sale = (state.sales || []).find(s => s.id === saleId);
    if (!sale) return;

    if (!confirm(`¿Eliminar definitivamente la orden ${sale.order_number}? Esto revertirá el stock de las prendas y borrará los movimientos de caja correspondientes.`)) {
      return;
    }

    // 1. Si la venta estaba PAGADA, devolver las prendas al stock
    if (sale.status === 'PAGADA') {
      (sale.items || []).forEach(item => {
        const prod = (state.products || []).find(p => p.id === item.product_id);
        if (prod) {
          const variant = (prod.variants || []).find(v => v.size === item.size);
          if (variant) {
            variant.stock += (item.quantity || 1);
          }
        }
      });
    }

    // 2. Eliminar movimientos de caja vinculados a esta orden
    state.cashMovements = (state.cashMovements || []).filter(m => {
      if ((m.source_type === 'VENTA' || m.source_type === 'ANULACION_VENTA') &&
          (String(m.source_id) === String(sale.id) || (m.description && m.description.includes(sale.order_number)))) {
        return false;
      }
      return true;
    });

    // 3. Remover de la lista de ventas
    state.sales = (state.sales || []).filter(s => s.id !== saleId);

    saveState(true);
    renderAll(false);
    showToast(`Venta ${sale.order_number} eliminada por completo. Stock y balance restaurados.`, 'success');
  }

  // 2. PRODUCTO CRUD (NUEVO / EDITAR / ELIMINAR)
  function setupProductModal() {
    const form = document.getElementById('formProducto');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const editId = document.getElementById('prodEditId')?.value;
      const sku = document.getElementById('prodSku')?.value.trim();
      const name = document.getElementById('prodName')?.value.trim();
      const category_id = document.getElementById('prodCategory')?.value;
      const cost = parseFloat(document.getElementById('prodCost')?.value) || 0;
      const price = parseFloat(document.getElementById('prodPrice')?.value) || 0;
      const image = document.getElementById('prodImage')?.value.trim();
      const desc = document.getElementById('prodDesc')?.value.trim();

      const online_active = document.getElementById('prodOnlineActive') ? document.getElementById('prodOnlineActive').checked : true;
      const featured = document.getElementById('prodFeatured') ? document.getElementById('prodFeatured').checked : false;
      const color = document.getElementById('prodColor')?.value || 'negro';
      const extraImgsStr = document.getElementById('prodExtraImages')?.value.trim() || '';
      const extraImages = extraImgsStr ? extraImgsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      const imagesList = image ? [image, ...extraImages] : [...extraImages];
      const specsStr = document.getElementById('prodSpecs')?.value.trim() || '';
      const specs = specsStr ? specsStr.split('\n').map(s => s.trim()).filter(Boolean) : [];

      const catNames = {
        mallas: 'Mallas & Shorts',
        remeras: 'Remeras',
        buzos: 'Buzos',
        gorras: 'Gorras',
        lentes: 'Lentes',
        mates: 'Mates'
      };

      const colorNames = {
        negro: 'Negro / Black',
        grafito: 'Grafito / Washed',
        crudo: 'Crudo / Off-White',
        blanco: 'Blanco',
        gris: 'Gris',
        otro: 'Otro'
      };

      if (editId) {
        // Editar existente
        const prod = (state.products || []).find(p => p.id === editId);
        if (prod) {
          prod.sku = sku || prod.sku;
          prod.name = name;
          prod.category_id = category_id;
          prod.category_name = catNames[category_id] || category_id;
          prod.cost = cost;
          prod.price = price;
          prod.image = image;
          prod.desc = desc;
          prod.online_active = online_active;
          prod.featured = featured;
          prod.color = color;
          prod.color_name = colorNames[color] || color;
          prod.images = imagesList.length > 0 ? imagesList : (image ? [image] : []);
          prod.specs = specs;

          // Actualizar variantes de stock si fueron editadas directamente
          const editVarInputs = document.querySelectorAll('.edit-prod-var-stock');
          if (editVarInputs && editVarInputs.length > 0) {
            prod.variants = Array.from(editVarInputs).map(inp => {
              const sz = inp.dataset.size;
              const sVal = parseInt(inp.value, 10);
              const prevV = (prod.variants || []).find(v => v.size === sz);
              return {
                size: sz,
                stock: isNaN(sVal) || sVal < 0 ? 0 : sVal,
                low_stock_threshold: prevV ? (prevV.low_stock_threshold || 2) : 2
              };
            });
          }

          showToast(`Producto ${prod.name} actualizado correctamente`, 'success');
        }
      } else {
        // Crear nuevo
        const newId = 'BH-' + String(100 + (state.products || []).length + 1);
        const finalSku = sku || newId;

        const stockS = parseInt(document.getElementById('initStockS')?.value, 10) || 0;
        const stockM = parseInt(document.getElementById('initStockM')?.value, 10) || 0;
        const stockL = parseInt(document.getElementById('initStockL')?.value, 10) || 0;
        const stockXL = parseInt(document.getElementById('initStockXL')?.value, 10) || 0;

        const newProd = {
          id: newId,
          sku: finalSku,
          name: name,
          category_id: category_id,
          category_name: catNames[category_id] || category_id,
          cost: cost,
          price: price,
          image: image,
          desc: desc,
          online_active: online_active,
          featured: featured,
          color: color,
          color_name: colorNames[color] || color,
          images: imagesList.length > 0 ? imagesList : (image ? [image] : []),
          specs: specs,
          is_deleted: 0,
          created_at: new Date().toISOString(),
          variants: [
            { size: 'S', stock: stockS, low_stock_threshold: 2 },
            { size: 'M', stock: stockM, low_stock_threshold: 2 },
            { size: 'L', stock: stockL, low_stock_threshold: 2 },
            { size: 'XL', stock: stockXL, low_stock_threshold: 2 }
          ]
        };

        state.products.unshift(newProd);
        showToast(`Producto ${name} creado con éxito`, 'success');
      }

      saveState(true);
      closeModal('modalProducto');
      renderAll(false);
    });

    const btnNuevo = document.getElementById('btnNuevoProducto');
    if (btnNuevo) {
      btnNuevo.addEventListener('click', () => {
        document.getElementById('prodEditId').value = '';
        document.getElementById('modalProdTitle').textContent = 'NUEVO PRODUCTO';
        document.getElementById('prodSku').value = 'BH-' + String(100 + (state.products || []).length + 1);
        document.getElementById('prodName').value = '';
        document.getElementById('prodCost').value = '20000';
        document.getElementById('prodPrice').value = '55000';
        document.getElementById('prodImage').value = '';
        document.getElementById('prodDesc').value = '';

        const activeCheck = document.getElementById('prodOnlineActive');
        if (activeCheck) activeCheck.checked = true;
        const featCheck = document.getElementById('prodFeatured');
        if (featCheck) featCheck.checked = false;
        const colorSel = document.getElementById('prodColor');
        if (colorSel) colorSel.value = 'negro';
        const extraImgs = document.getElementById('prodExtraImages');
        if (extraImgs) extraImgs.value = '';
        const specsInp = document.getElementById('prodSpecs');
        if (specsInp) specsInp.value = '';

        const btnDel = document.getElementById('btnDeleteProdModal');
        if (btnDel) btnDel.style.display = 'none';

        const dropPrompt = document.getElementById('cldDropPromptMain');
        if (dropPrompt) dropPrompt.style.display = 'flex';
        const uploadStatus = document.getElementById('cldUploadStatusMain');
        if (uploadStatus) uploadStatus.style.display = 'none';
        const fileInput = document.getElementById('cldFileInputMain');
        if (fileInput) fileInput.value = '';
        const progressBar = document.getElementById('cldProgressBarMain');
        if (progressBar) progressBar.style.width = '0%';

        if (window.bhApp && window.bhApp.renderExtraImagesGallery) {
          window.bhApp.renderExtraImagesGallery();
        }

        const varSection = document.getElementById('modalProdVariantsSection');
        const varLabel = document.getElementById('modalProdVariantsLabel');
        const varGrid = document.getElementById('modalProdVariantsGrid');
        if (varSection && varGrid) {
          varSection.style.display = 'block';
          if (varLabel) varLabel.textContent = 'Stock Inicial por Talle:';
          varGrid.innerHTML = `
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted);">Talle S</label>
              <input type="number" class="form-control font-mono" id="initStockS" value="5" min="0">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted);">Talle M</label>
              <input type="number" class="form-control font-mono" id="initStockM" value="5" min="0">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted);">Talle L</label>
              <input type="number" class="form-control font-mono" id="initStockL" value="5" min="0">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted);">Talle XL</label>
              <input type="number" class="form-control font-mono" id="initStockXL" value="5" min="0">
            </div>
          `;
        }
        openModal('modalProducto');
      });
    }
  }

  function openEditProduct(prodId) {
    const prod = (state.products || []).find(p => p.id === prodId);
    if (!prod) return;

    document.getElementById('prodEditId').value = prod.id;
    document.getElementById('modalProdTitle').textContent = 'EDITAR PRODUCTO';
    document.getElementById('prodSku').value = prod.sku || prod.id;
    document.getElementById('prodName').value = prod.name;
    document.getElementById('prodCategory').value = prod.category_id || 'mallas';
    document.getElementById('prodCost').value = prod.cost || 0;
    document.getElementById('prodPrice').value = prod.price || 0;
    document.getElementById('prodImage').value = prod.image || '';
    document.getElementById('prodDesc').value = prod.desc || '';

    const dropPrompt = document.getElementById('cldDropPromptMain');
    const uploadStatus = document.getElementById('cldUploadStatusMain');
    const thumbImg = document.getElementById('cldThumbMain');
    const statusText = document.getElementById('cldStatusTextMain');
    const progressBar = document.getElementById('cldProgressBarMain');

    if (prod.image) {
      if (dropPrompt) dropPrompt.style.display = 'none';
      if (uploadStatus) uploadStatus.style.display = 'block';
      if (thumbImg) thumbImg.src = resolveMediaUrl(prod.image);
      if (statusText) statusText.textContent = '✓ Imagen actual';
      if (progressBar) progressBar.style.width = '100%';
    } else {
      if (dropPrompt) dropPrompt.style.display = 'flex';
      if (uploadStatus) uploadStatus.style.display = 'none';
    }

    const activeCheck = document.getElementById('prodOnlineActive');
    if (activeCheck) activeCheck.checked = prod.online_active !== false;
    const featCheck = document.getElementById('prodFeatured');
    if (featCheck) featCheck.checked = !!prod.featured;
    const colorSel = document.getElementById('prodColor');
    if (colorSel) colorSel.value = prod.color || 'negro';
    const extraImgs = document.getElementById('prodExtraImages');
    if (extraImgs) {
      if (Array.isArray(prod.images) && prod.images.length > 1) {
        extraImgs.value = prod.images.slice(1).join(', ');
      } else {
        extraImgs.value = '';
      }
    }
    if (window.bhApp && window.bhApp.renderExtraImagesGallery) {
      window.bhApp.renderExtraImagesGallery();
    }
    const specsInp = document.getElementById('prodSpecs');
    if (specsInp) {
      specsInp.value = Array.isArray(prod.specs) ? prod.specs.join('\n') : (prod.specs || '');
    }

    const btnDel = document.getElementById('btnDeleteProdModal');
    if (btnDel) {
      btnDel.style.display = 'inline-block';
      btnDel.onclick = () => {
        closeModal('modalProducto');
        hardDeleteProduct(prod.id);
      };
    }

    // Mostrar variantes existentes para edición directa de stock
    const varSection = document.getElementById('modalProdVariantsSection');
    const varLabel = document.getElementById('modalProdVariantsLabel');
    const varGrid = document.getElementById('modalProdVariantsGrid');
    if (varSection && varGrid) {
      varSection.style.display = 'block';
      if (varLabel) varLabel.textContent = 'Stock por Talle (Editar unidades directamente):';
      const variants = prod.variants || [];
      if (variants.length > 0) {
        varGrid.innerHTML = variants.map(v => `
          <div style="background: var(--bg-surface-2); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); text-align: center;">
            <label style="font-size: 0.72rem; color: var(--v-light); font-weight: 700; display: block; margin-bottom: 4px;">Talle ${v.size}</label>
            <input type="number" class="form-control font-mono edit-prod-var-stock" data-size="${v.size}" value="${v.stock}" min="0" style="text-align: center; font-weight: 700;">
          </div>
        `).join('');
      } else {
        varGrid.innerHTML = `
          <div style="background: var(--bg-surface-2); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); text-align: center;">
            <label style="font-size: 0.72rem; color: var(--v-light); font-weight: 700; display: block; margin-bottom: 4px;">Talle Único</label>
            <input type="number" class="form-control font-mono edit-prod-var-stock" data-size="U" value="0" min="0" style="text-align: center; font-weight: 700;">
          </div>
        `;
      }
    }

    openModal('modalProducto');
  }

  function toggleOnlineProduct(prodId) {
    const prod = (state.products || []).find(p => p.id === prodId);
    if (!prod) return;

    prod.online_active = prod.online_active === false ? true : false;
    saveState(true);
    renderAll(false);
    showToast(`Producto ${prod.name} ahora está ${prod.online_active ? 'visible en la tienda web' : 'oculto de la tienda web'}`, 'info');
  }

  function toggleDeleteProduct(prodId) {
    const prod = (state.products || []).find(p => p.id === prodId);
    if (!prod) return;

    prod.is_deleted = prod.is_deleted ? 0 : 1;
    saveState(true);
    renderAll(false);
    showToast(`Producto ${prod.name} ${prod.is_deleted ? 'desactivado' : 'restaurado'}`, 'info');
  }

  function hardDeleteProduct(prodId) {
    if (!confirm('¿Eliminar permanentemente este producto del sistema? Esta acción no se puede deshacer.')) return;
    state.products = (state.products || []).filter(p => p.id !== prodId);
    saveState(true);
    renderAll(false);
    showToast('Producto eliminado definitivamente', 'info');
  }

  // ==========================================================================
  // MÓDULO CLOUDINARY: SUBIDA Y OPTIMIZACIÓN AUTOMÁTICA DE IMÁGENES
  // ==========================================================================
  function getCloudinaryConfig() {
    return state.cloudinaryConfig || {
      cloudName: '',
      uploadPreset: '',
      folder: 'blackhaze/productos'
    };
  }

  function saveCloudinaryConfig(cfg) {
    state.cloudinaryConfig = {
      cloudName: (cfg.cloudName || '').trim(),
      uploadPreset: (cfg.uploadPreset || '').trim(),
      folder: (cfg.folder || 'blackhaze/productos').trim()
    };
    saveState(true);
    showToast('Configuración de Cloudinary guardada en la nube', 'success');
  }

  function openCloudinaryModal() {
    const cfg = getCloudinaryConfig();
    const cName = document.getElementById('cldCloudName');
    const cPreset = document.getElementById('cldUploadPreset');
    const cFolder = document.getElementById('cldFolder');

    if (cName) cName.value = cfg.cloudName || '';
    if (cPreset) cPreset.value = cfg.uploadPreset || '';
    if (cFolder) cFolder.value = cfg.folder || 'blackhaze/productos';

    openModal('modalCloudinaryConfig');
  }

  function optimizeCloudinaryUrl(url) {
    if (!url || typeof url !== 'string') return url;
    // Si es una URL de Cloudinary, insertar transformaciones f_auto,q_auto si no las tiene
    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
      if (!url.includes('/f_auto') && !url.includes('f_auto,q_auto')) {
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
      }
    }
    return url;
  }

  function uploadFileToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
      const cfg = getCloudinaryConfig();
      if (!cfg.cloudName || !cfg.uploadPreset) {
        openCloudinaryModal();
        reject(new Error('Cloudinary no está configurado. Por favor ingresá Cloud Name y Upload Preset.'));
        return;
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', cfg.uploadPreset);
      if (cfg.folder) {
        formData.append('folder', cfg.folder);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            const optimized = optimizeCloudinaryUrl(res.secure_url || res.url);
            resolve(optimized);
          } catch (err) {
            reject(new Error('Respuesta inválida de Cloudinary'));
          }
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            reject(new Error(res.error?.message || `Error ${xhr.status} de Cloudinary`));
          } catch (e) {
            reject(new Error(`Error ${xhr.status} subiendo imagen`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Error de conexión con Cloudinary'));
      };

      xhr.send(formData);
    });
  }

  function setupCloudinaryUploader() {
    // 1. Modal config form
    const formCld = document.getElementById('formCloudinaryConfig');
    if (formCld) {
      formCld.addEventListener('submit', e => {
        e.preventDefault();
        const cName = document.getElementById('cldCloudName')?.value.trim();
        const cPreset = document.getElementById('cldUploadPreset')?.value.trim();
        const cFolder = document.getElementById('cldFolder')?.value.trim() || 'blackhaze/productos';

        saveCloudinaryConfig({
          cloudName: cName,
          uploadPreset: cPreset,
          folder: cFolder
        });
        closeModal('modalCloudinaryConfig');
      });
    }

    const btnOpenModal = document.getElementById('btnOpenCloudinaryModal');
    if (btnOpenModal) {
      btnOpenModal.addEventListener('click', e => {
        e.preventDefault();
        openCloudinaryModal();
      });
    }

    const btnSidebarCld = document.getElementById('sidebarBtnCloudinary');
    if (btnSidebarCld) {
      btnSidebarCld.addEventListener('click', e => {
        e.preventDefault();
        openCloudinaryModal();
      });
    }

    // 2. Dropzone para imagen principal
    const dropzone = document.getElementById('cldDropzoneMain');
    const fileInputMain = document.getElementById('cldFileInputMain');
    const dropPrompt = document.getElementById('cldDropPromptMain');
    const uploadStatus = document.getElementById('cldUploadStatusMain');
    const thumbImg = document.getElementById('cldThumbMain');
    const statusText = document.getElementById('cldStatusTextMain');
    const progressBar = document.getElementById('cldProgressBarMain');
    const btnCancel = document.getElementById('cldBtnCancelMain');
    const prodImgInput = document.getElementById('prodImage');

    async function handleMainFileUpload(file) {
      if (!file || !file.type.startsWith('image/')) {
        showToast('Por favor seleccioná un archivo de imagen válido', 'error');
        return;
      }

      // Preview instantáneo con FileReader
      const reader = new FileReader();
      reader.onload = ev => {
        if (thumbImg) thumbImg.src = ev.target.result;
        if (dropPrompt) dropPrompt.style.display = 'none';
        if (uploadStatus) uploadStatus.style.display = 'block';
      };
      reader.readAsDataURL(file);

      if (progressBar) progressBar.style.width = '10%';
      if (statusText) statusText.textContent = 'Subiendo a Cloudinary... (10%)';

      try {
        const cldUrl = await uploadFileToCloudinary(file, pct => {
          if (progressBar) progressBar.style.width = pct + '%';
          if (statusText) statusText.textContent = `Subiendo a Cloudinary... (${pct}%)`;
        });

        if (progressBar) progressBar.style.width = '100%';
        if (statusText) statusText.textContent = '✓ Imagen optimizada en Cloudinary';
        if (prodImgInput) prodImgInput.value = cldUrl;
        showToast('Imagen subida y optimizada en Cloudinary con éxito', 'success');
      } catch (err) {
        if (statusText) statusText.textContent = 'Error: ' + err.message;
        if (progressBar) progressBar.style.width = '0%';
        showToast(err.message, 'error');
      }
    }

    if (dropzone && fileInputMain) {
      dropzone.addEventListener('click', () => {
        fileInputMain.click();
      });

      fileInputMain.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
          handleMainFileUpload(e.target.files[0]);
        }
      });

      dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleMainFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnCancel && fileInputMain) {
      btnCancel.addEventListener('click', e => {
        e.stopPropagation();
        fileInputMain.click();
      });
    }

    const btnRemoveMain = document.getElementById('cldBtnRemoveMain');
    if (btnRemoveMain) {
      btnRemoveMain.addEventListener('click', e => {
        e.stopPropagation();
        if (prodImgInput) prodImgInput.value = '';
        if (fileInputMain) fileInputMain.value = '';
        if (dropPrompt) dropPrompt.style.display = 'flex';
        if (uploadStatus) uploadStatus.style.display = 'none';
        if (thumbImg) thumbImg.src = '';
        if (progressBar) progressBar.style.width = '0%';
        if (statusText) statusText.textContent = '';
        showToast('Imagen principal quitada', 'info');
      });
    }

    if (prodImgInput) {
      prodImgInput.addEventListener('input', () => {
        const val = prodImgInput.value.trim();
        if (val) {
          if (dropPrompt) dropPrompt.style.display = 'none';
          if (uploadStatus) uploadStatus.style.display = 'block';
          if (thumbImg) thumbImg.src = resolveMediaUrl(val);
          if (statusText) statusText.textContent = '✓ URL asignada';
          if (progressBar) progressBar.style.width = '100%';
        } else {
          if (dropPrompt) dropPrompt.style.display = 'flex';
          if (uploadStatus) uploadStatus.style.display = 'none';
        }
      });
    }

    // 3. Uploader y Galería interactiva para fotos adicionales
    const btnExtraCld = document.getElementById('btnUploadExtraCld');
    const fileInputExtra = document.getElementById('cldFileInputExtra');
    const extraImgsInput = document.getElementById('prodExtraImages');
    const cldExtraGallery = document.getElementById('cldExtraGallery');
    const cldExtraUploadStatus = document.getElementById('cldExtraUploadStatus');
    const cldExtraStatusText = document.getElementById('cldExtraStatusText');
    const cldExtraProgressBar = document.getElementById('cldExtraProgressBar');

    function renderExtraImagesGallery() {
      if (!cldExtraGallery || !extraImgsInput) return;
      const urls = extraImgsInput.value.split(',').map(s => s.trim()).filter(Boolean);
      if (urls.length === 0) {
        cldExtraGallery.style.display = 'none';
        cldExtraGallery.innerHTML = '';
        return;
      }
      cldExtraGallery.style.display = 'flex';
      cldExtraGallery.innerHTML = urls.map((url, idx) => `
        <div class="extra-img-item" title="Foto adicional #${idx + 1}">
          <img src="${resolveMediaUrl(url)}" alt="Extra ${idx + 1}" onerror="this.src='../assets/mascota.svg'">
          <span class="extra-img-badge">#${idx + 2}</span>
          <button type="button" class="extra-img-remove-btn" onclick="window.bhApp.removeExtraImage(${idx})" title="Eliminar foto">✕</button>
        </div>
      `).join('');
    }

    window.bhApp = window.bhApp || {};
    window.bhApp.renderExtraImagesGallery = renderExtraImagesGallery;
    window.bhApp.removeExtraImage = function (idx) {
      if (!extraImgsInput) return;
      const urls = extraImgsInput.value.split(',').map(s => s.trim()).filter(Boolean);
      if (idx >= 0 && idx < urls.length) {
        urls.splice(idx, 1);
        extraImgsInput.value = urls.join(', ');
        renderExtraImagesGallery();
        showToast('Foto adicional eliminada', 'info');
      }
    };

    if (extraImgsInput) {
      extraImgsInput.addEventListener('input', renderExtraImagesGallery);
    }

    if (btnExtraCld && fileInputExtra) {
      btnExtraCld.addEventListener('click', () => {
        fileInputExtra.click();
      });

      fileInputExtra.addEventListener('change', async e => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          if (cldExtraUploadStatus) {
            cldExtraUploadStatus.style.display = 'block';
            if (cldExtraStatusText) cldExtraStatusText.textContent = 'Subiendo a Cloudinary... (0%)';
            if (cldExtraProgressBar) cldExtraProgressBar.style.width = '10%';
          }
          try {
            const cldUrl = await uploadFileToCloudinary(file, pct => {
              if (cldExtraStatusText) cldExtraStatusText.textContent = `Subiendo a Cloudinary... (${pct}%)`;
              if (cldExtraProgressBar) cldExtraProgressBar.style.width = pct + '%';
            });
            const current = extraImgsInput ? extraImgsInput.value.trim() : '';
            const currentUrls = current ? current.split(',').map(s => s.trim()).filter(Boolean) : [];
            currentUrls.push(cldUrl);
            if (extraImgsInput) {
              extraImgsInput.value = currentUrls.join(', ');
            }
            renderExtraImagesGallery();
            showToast('Foto adicional agregada y optimizada en Cloudinary', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            if (cldExtraUploadStatus) cldExtraUploadStatus.style.display = 'none';
            fileInputExtra.value = '';
          }
        }
      });
    }
  }

  // 3. INGRESO Y EDICIÓN DIRECTA DE STOCK (Sin registrar venta ni ingreso)
  function setupStockModal() {
    const prodSelect = document.getElementById('stockProductSelect');
    const varSelect = document.getElementById('stockVariantSelect');
    const tabDirect = document.getElementById('tabStockDirect');
    const tabIngreso = document.getElementById('tabStockIngreso');
    const viewDirect = document.getElementById('viewStockDirect');
    const formIngreso = document.getElementById('formIngresoStock');
    const directVariantsContainer = document.getElementById('stockDirectVariantsContainer');
    const btnSaveDirect = document.getElementById('btnSaveDirectStock');
    const btnAddSize = document.getElementById('btnAddSizeToDirectStock');

    let currentMode = 'direct'; // 'direct' | 'ingreso'

    function setStockMode(mode) {
      currentMode = mode;
      if (mode === 'direct') {
        if (tabDirect) {
          tabDirect.style.background = 'var(--primary)';
          tabDirect.style.color = '#fff';
        }
        if (tabIngreso) {
          tabIngreso.style.background = 'transparent';
          tabIngreso.style.color = 'var(--text-sec)';
        }
        if (viewDirect) viewDirect.style.display = 'block';
        if (formIngreso) formIngreso.style.display = 'none';
        renderDirectVariants();
      } else {
        if (tabDirect) {
          tabDirect.style.background = 'transparent';
          tabDirect.style.color = 'var(--text-sec)';
        }
        if (tabIngreso) {
          tabIngreso.style.background = 'var(--primary)';
          tabIngreso.style.color = '#fff';
        }
        if (viewDirect) viewDirect.style.display = 'none';
        if (formIngreso) formIngreso.style.display = 'block';
        updateStockVariants();
      }
    }

    if (tabDirect) tabDirect.addEventListener('click', () => setStockMode('direct'));
    if (tabIngreso) tabIngreso.addEventListener('click', () => setStockMode('ingreso'));

    function populateStockProds(selectedProdId = null) {
      if (!prodSelect) return;
      const prods = (state.products || []).filter(p => !p.is_deleted);
      prodSelect.innerHTML = prods.map(p => `
        <option value="${p.id}" ${p.id === selectedProdId ? 'selected' : ''}>${p.name} (${p.sku || p.id})</option>
      `).join('');

      if (currentMode === 'direct') {
        renderDirectVariants();
      } else {
        updateStockVariants();
      }
    }

    function renderDirectVariants() {
      if (!directVariantsContainer || !prodSelect) return;
      const prod = (state.products || []).find(p => p.id === prodSelect.value);
      if (!prod) {
        directVariantsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">Seleccioná una prenda para editar su stock.</div>';
        return;
      }

      const variants = prod.variants || [];
      if (variants.length === 0) {
        directVariantsContainer.innerHTML = `
          <div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">
            Esta prenda no tiene talles configurados. Hacé clic en "+ Agregar Talle" para crearlos.
          </div>
        `;
        return;
      }

      directVariantsContainer.innerHTML = variants.map(v => {
        const curStock = parseInt(v.stock, 10) || 0;
        return `
          <div class="stock-direct-row" data-size="${v.size}" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface-2); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge badge-purple" style="font-size: 0.78rem; font-weight: 700; padding: 4px 10px;">TALLE ${v.size}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Stock actual: <strong style="color: #fff;">${curStock}u</strong></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 0.72rem; color: var(--text-sec); margin: 0;">Fijar unidades:</label>
              <input type="number" class="form-control font-mono stock-direct-var-input" data-size="${v.size}" value="${curStock}" min="0" style="width: 85px; text-align: center; font-weight: 700; font-size: 0.9rem; padding: 5px 8px;">
            </div>
          </div>
        `;
      }).join('');
    }

    function updateStockVariants() {
      if (!prodSelect || !varSelect) return;
      const prod = (state.products || []).find(p => p.id === prodSelect.value);
      if (!prod) return;

      varSelect.innerHTML = (prod.variants || []).map(v => `
        <option value="${v.size}">Talle ${v.size} (Stock actual: ${v.stock}u)</option>
      `).join('');
    }

    if (prodSelect) {
      prodSelect.addEventListener('change', () => {
        if (currentMode === 'direct') {
          renderDirectVariants();
        } else {
          updateStockVariants();
        }
      });
    }

    // Agregar talle nuevo a la prenda
    if (btnAddSize) {
      btnAddSize.addEventListener('click', () => {
        const prod = (state.products || []).find(p => p.id === prodSelect.value);
        if (!prod) return;

        const newSize = prompt('Ingresá el nombre del nuevo talle (ej: XXL, XS, Único, 38, 40):');
        if (!newSize || !newSize.trim()) return;

        const cleanSize = newSize.trim().toUpperCase();
        if (!prod.variants) prod.variants = [];

        if (prod.variants.some(v => v.size.toUpperCase() === cleanSize)) {
          alert('Ese talle ya existe en este producto.');
          return;
        }

        prod.variants.push({
          size: cleanSize,
          stock: 0,
          low_stock_threshold: 2
        });

        renderDirectVariants();
        updateStockVariants();
      });
    }

    // Guardar edición directa de stock (sin movimientos ni ventas)
    if (btnSaveDirect) {
      btnSaveDirect.addEventListener('click', () => {
        const prod = (state.products || []).find(p => p.id === prodSelect.value);
        if (!prod) return;

        const inputs = directVariantsContainer.querySelectorAll('.stock-direct-var-input');
        if (!inputs || inputs.length === 0) return;

        let totalUnits = 0;
        inputs.forEach(inp => {
          const sz = inp.dataset.size;
          const val = parseInt(inp.value, 10);
          const cleanVal = isNaN(val) || val < 0 ? 0 : val;
          totalUnits += cleanVal;

          let v = (prod.variants || []).find(varItem => varItem.size === sz);
          if (v) {
            v.stock = cleanVal;
          } else {
            if (!prod.variants) prod.variants = [];
            prod.variants.push({ size: sz, stock: cleanVal, low_stock_threshold: 2 });
          }
        });

        saveState(true);
        closeModal('modalStock');
        renderAll(false);
        showToast(`Stock actualizado directamente: ${prod.name} tiene ${totalUnits} unidades totales (sin registrar movimientos)`, 'success');
      });
    }

    // Formulario de Ingreso de Stock Tradicional (+)
    if (formIngreso) {
      formIngreso.addEventListener('submit', e => {
        e.preventDefault();
        const prodId = prodSelect.value;
        const size = varSelect.value;
        const qty = parseInt(document.getElementById('stockQtyToAdd')?.value, 10) || 0;
        const reason = document.getElementById('stockReason')?.value || 'Producción nueva';

        const prod = (state.products || []).find(p => p.id === prodId);
        if (!prod) return;

        const variant = (prod.variants || []).find(v => v.size === size);
        if (!variant) return;

        variant.stock += qty;
        saveState(true);
        closeModal('modalStock');
        renderAll(false);
        showToast(`Ingreso registrado: +${qty} unidades sumadas a ${prod.name} [${size}] (${reason})`, 'success');
      });
    }

    const btn = document.getElementById('btnIngresoStock');
    if (btn) {
      btn.addEventListener('click', () => {
        populateStockProds();
        setStockMode('direct');
        openModal('modalStock');
      });
    }

    // Expose helpers for external triggers
    window.bhApp = window.bhApp || {};
    window.bhApp.populateStockProds = populateStockProds;
    window.bhApp.setStockMode = setStockMode;
  }

  function openStockModalFor(prodId) {
    const prodSelect = document.getElementById('stockProductSelect');
    if (prodSelect) {
      const prods = (state.products || []).filter(p => !p.is_deleted);
      prodSelect.innerHTML = prods.map(p => `
        <option value="${p.id}" ${p.id === prodId ? 'selected' : ''}>${p.name} (${p.sku || p.id})</option>
      `).join('');
      prodSelect.value = prodId;
    }
    if (window.bhApp && window.bhApp.setStockMode) {
      window.bhApp.setStockMode('direct');
    }
    openModal('modalStock');
  }

  // EDITAR MOVIMIENTO DE CAJA (CUALQUIER INGRESO O EGRESO)
  function openEditCashMovement(movId) {
    const mov = (state.cashMovements || []).find(m => String(m.id) === String(movId));
    if (!mov) return;

    if (mov.source_type === 'GASTO' && mov.source_id) {
      openEditGasto(mov.source_id);
      return;
    }

    const editIdEl = document.getElementById('cajaEditMovId');
    if (editIdEl) editIdEl.value = mov.id;

    const titleEl = document.getElementById('modalMovCajaTitle');
    if (titleEl) titleEl.textContent = 'EDITAR MOVIMIENTO DE CAJA';
    const btnSubmit = document.getElementById('btnSubmitMovCaja');
    if (btnSubmit) btnSubmit.textContent = 'Guardar Cambios';

    const tipoEl = document.getElementById('cajaTipoMov');
    if (tipoEl) tipoEl.value = mov.type || 'INGRESO';

    const montoEl = document.getElementById('cajaMonto');
    if (montoEl) montoEl.value = mov.amount || 0;

    const medioEl = document.getElementById('cajaMedio');
    if (medioEl) medioEl.value = mov.payment_method || 'Efectivo';

    const descEl = document.getElementById('cajaDescripcion');
    if (descEl) descEl.value = mov.description || '';

    openModal('modalMovCaja');
  }

  // 4. MOVIMIENTOS DE CAJA MANUALES (CREAR & EDITAR)
  function setupCajaModal() {
    const form = document.getElementById('formMovCaja');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const editId = document.getElementById('cajaEditMovId')?.value;
        const tipo = document.getElementById('cajaTipoMov')?.value || 'INGRESO';
        const monto = parseFloat(document.getElementById('cajaMonto')?.value) || 0;
        const medio = document.getElementById('cajaMedio')?.value || 'Efectivo';
        const desc = document.getElementById('cajaDescripcion')?.value.trim();

        if (editId) {
          const mov = (state.cashMovements || []).find(m => String(m.id) === String(editId));
          if (mov) {
            mov.type = tipo;
            mov.amount = monto;
            mov.payment_method = medio;
            mov.description = desc;

            // Sincronizar si proviene de Gasto
            if (mov.source_type === 'GASTO' && mov.source_id) {
              const gasto = (state.expenses || []).find(g => String(g.id) === String(mov.source_id));
              if (gasto) {
                gasto.amount = monto;
                gasto.concept = desc.replace(/^Gasto:\s*/i, '');
                gasto.payment_method = medio;
              }
            }

            // Sincronizar si proviene de Socio
            if (mov.source_type === 'APORTE_SOCIO' && mov.source_id) {
              const contrib = (state.partnerContributions || []).find(c => String(c.id) === String(mov.source_id));
              if (contrib) {
                contrib.amount = monto;
                contrib.type = tipo === 'INGRESO' ? 'APORTE' : 'RETIRO';
                contrib.payment_method = medio;
              }
            }

            showToast('Movimiento de dinero actualizado con éxito', 'success');
          }
        } else {
          state.cashMovements.push({
            id: Date.now(),
            date: new Date().toISOString(),
            type: tipo,
            source_type: 'MANUAL',
            amount: monto,
            payment_method: medio,
            description: desc
          });
          showToast(`Movimiento registrado: ${tipo} de ${formatARS(monto)}`, 'success');
        }

        saveState(true);
        closeModal('modalMovCaja');
        renderAll(false);
      });
    }

    const btn = document.getElementById('btnNuevoMovCaja');
    if (btn) {
      btn.addEventListener('click', () => {
        const editIdEl = document.getElementById('cajaEditMovId');
        if (editIdEl) editIdEl.value = '';

        const titleEl = document.getElementById('modalMovCajaTitle');
        if (titleEl) titleEl.textContent = 'REGISTRAR MOVIMIENTO DE CAJA';
        const btnSubmit = document.getElementById('btnSubmitMovCaja');
        if (btnSubmit) btnSubmit.textContent = 'Impactar en Caja';

        const tipoEl = document.getElementById('cajaTipoMov');
        if (tipoEl) tipoEl.value = 'INGRESO';

        const montoEl = document.getElementById('cajaMonto');
        if (montoEl) montoEl.value = '';

        const medioEl = document.getElementById('cajaMedio');
        if (medioEl) medioEl.value = 'Efectivo';

        const descEl = document.getElementById('cajaDescripcion');
        if (descEl) descEl.value = '';

        openModal('modalMovCaja');
      });
    }
  }

  // 5. GASTOS OPERATIVOS (CRUD COMPLETO)
  function openEditGasto(gastoId) {
    const gasto = (state.expenses || []).find(g => String(g.id) === String(gastoId));
    if (!gasto) return;

    document.getElementById('gastoEditId').value = gasto.id;
    const titleEl = document.getElementById('modalGastoTitle');
    if (titleEl) titleEl.textContent = 'EDITAR GASTO OPERATIVO';
    const btnSubmit = document.getElementById('btnSubmitGasto');
    if (btnSubmit) btnSubmit.textContent = 'Guardar Cambios';

    document.getElementById('gastoConcepto').value = gasto.concept || '';
    document.getElementById('gastoCategoria').value = gasto.category || 'Otros';
    document.getElementById('gastoMonto').value = gasto.amount || 0;
    document.getElementById('gastoMedio').value = gasto.payment_method || 'Efectivo';
    document.getElementById('gastoNotas').value = gasto.notes || '';

    openModal('modalGasto');
  }

  function deleteGasto(gastoId) {
    const gasto = (state.expenses || []).find(g => String(g.id) === String(gastoId));
    if (!gasto) return;

    if (!confirm(`¿Eliminar el gasto "${gasto.concept}" por ${formatARS(gasto.amount)}? El dinero saliente se revertirá en caja.`)) {
      return;
    }

    state.expenses = (state.expenses || []).filter(g => String(g.id) !== String(gastoId));

    // Eliminar movimiento de caja vinculado
    state.cashMovements = (state.cashMovements || []).filter(m => {
      if (m.source_type === 'GASTO' && (String(m.source_id) === String(gastoId) || (m.description && m.description.includes(gasto.concept)))) {
        return false;
      }
      return true;
    });

    saveState(true);
    renderAll(false);
    showToast(`Gasto eliminado y saldo en caja actualizado`, 'success');
  }

  // ELIMINAR CUALQUIER MOVIMIENTO DE CAJA (DESHACER INGRESO, EGRESO, GASTO, VENTA O APORTE)
  function deleteCashMovement(movId) {
    const mov = (state.cashMovements || []).find(m => String(m.id) === String(movId));
    if (!mov) {
      showToast('Movimiento no encontrado', 'error');
      return;
    }

    if (!confirm(`¿Eliminar de la caja el movimiento "${mov.description || 'Sin concepto'}" (${formatARS(mov.amount)})?`)) {
      return;
    }

    // 1. Eliminar de cashMovements
    state.cashMovements = (state.cashMovements || []).filter(m => String(m.id) !== String(movId));

    // 2. Si proviene de un GASTO, eliminar de expenses también
    if (mov.source_type === 'GASTO') {
      if (mov.source_id) {
        state.expenses = (state.expenses || []).filter(g => String(g.id) !== String(mov.source_id));
      } else if (mov.description) {
        state.expenses = (state.expenses || []).filter(g => !mov.description.includes(g.concept));
      }
    }

    // 3. Si proviene de un APORTE O RETIRO DE SOCIO, eliminar de partnerContributions
    if (mov.source_type === 'APORTE_SOCIO' || mov.source_type === 'RETIRO_SOCIO') {
      if (mov.source_id) {
        state.partnerContributions = (state.partnerContributions || []).filter(c => String(c.id) !== String(mov.source_id));
      } else if (mov.description) {
        state.partnerContributions = (state.partnerContributions || []).filter(c => !mov.description.includes(c.partner_name) || c.amount !== mov.amount);
      }
    }

    // 4. Si proviene de una VENTA, anular la venta y devolver las prendas al stock
    if (mov.source_type === 'VENTA') {
      const sale = (state.sales || []).find(s =>
        (mov.source_id && String(s.id) === String(mov.source_id)) ||
        (mov.description && mov.description.includes(s.order_number))
      );
      if (sale && sale.status === 'PAGADA') {
        (sale.items || []).forEach(item => {
          const prod = (state.products || []).find(p => p.id === item.product_id);
          if (prod) {
            const variant = (prod.variants || []).find(v => v.size === item.size);
            if (variant) variant.stock += (item.quantity || 1);
          }
        });
        sale.status = 'CANCELADA';
      }
    }

    saveState(true);
    renderAll(false);
    showToast('Movimiento eliminado de la caja y saldo actualizado', 'info');
  }

  function setupGastosModal() {
    const form = document.getElementById('formGasto');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const editId = document.getElementById('gastoEditId')?.value;
        const concepto = document.getElementById('gastoConcepto')?.value.trim();
        const cat = document.getElementById('gastoCategoria')?.value || 'Otros';
        const monto = parseFloat(document.getElementById('gastoMonto')?.value) || 0;
        const medio = document.getElementById('gastoMedio')?.value || 'Efectivo';
        const notas = document.getElementById('gastoNotas')?.value.trim();

        if (editId) {
          // Actualizar gasto existente
          const gasto = (state.expenses || []).find(g => String(g.id) === String(editId));
          if (gasto) {
            gasto.concept = concepto;
            gasto.category = cat;
            gasto.amount = monto;
            gasto.payment_method = medio;
            gasto.notes = notas;

            // Actualizar movimiento de caja vinculado
            let mov = (state.cashMovements || []).find(m => m.source_type === 'GASTO' && String(m.source_id) === String(editId));
            if (mov) {
              mov.amount = monto;
              mov.payment_method = medio;
              mov.category = cat;
              mov.description = `Gasto: ${concepto}`;
            } else {
              state.cashMovements.push({
                id: Date.now(),
                date: gasto.date || new Date().toISOString(),
                type: 'EGRESO',
                source_type: 'GASTO',
                source_id: String(editId),
                category: cat,
                amount: monto,
                payment_method: medio,
                description: `Gasto: ${concepto}`
              });
            }
            showToast(`Gasto "${concepto}" actualizado con éxito`, 'success');
          }
        } else {
          // Crear nuevo gasto
          const newGastoId = Date.now();
          state.expenses.push({
            id: newGastoId,
            date: new Date().toISOString(),
            concept: concepto,
            category: cat,
            amount: monto,
            payment_method: medio,
            notes: notas
          });

          // Restar de Caja (EGRESO)
          state.cashMovements.push({
            id: newGastoId + 1,
            date: new Date().toISOString(),
            type: 'EGRESO',
            source_type: 'GASTO',
            source_id: String(newGastoId),
            category: cat,
            amount: monto,
            payment_method: medio,
            description: `Gasto: ${concepto}`
          });
          showToast(`Gasto de ${formatARS(monto)} registrado e impactado en caja`, 'success');
        }

        saveState(true);
        closeModal('modalGasto');
        renderAll(false);
      });
    }

    function openModalNuevoGasto() {
      document.getElementById('gastoEditId').value = '';
      const titleEl = document.getElementById('modalGastoTitle');
      if (titleEl) titleEl.textContent = 'REGISTRAR GASTO OPERATIVO';
      const btnSubmit = document.getElementById('btnSubmitGasto');
      if (btnSubmit) btnSubmit.textContent = 'Guardar Gasto';

      document.getElementById('gastoConcepto').value = '';
      document.getElementById('gastoCategoria').value = 'Packaging';
      document.getElementById('gastoMonto').value = '';
      document.getElementById('gastoMedio').value = 'Efectivo';
      document.getElementById('gastoNotas').value = '';
      openModal('modalGasto');
    }

    const btn = document.getElementById('btnNuevoGasto');
    if (btn) btn.addEventListener('click', openModalNuevoGasto);

    const btnMov = document.getElementById('btnNuevoGastoMov');
    if (btnMov) btnMov.addEventListener('click', openModalNuevoGasto);
  }

  // 6. SOCIOS APORTE / RETIRO
  function deleteSocioMovimiento(contributionId) {
    const item = (state.partnerContributions || []).find(c => String(c.id) === String(contributionId));
    if (!item) return;

    const tipoLabel = item.type === 'APORTE' ? 'aporte' : 'retiro';
    if (!confirm(`¿Eliminar este ${tipoLabel} de ${formatARS(item.amount)} de ${item.partner_name}? Se revertirá también el impacto en el saldo de Caja.`)) {
      return;
    }

    // 1. Remover de partnerContributions
    state.partnerContributions = (state.partnerContributions || []).filter(c => String(c.id) !== String(contributionId));

    // 2. Revertir / remover movimiento de caja vinculado
    state.cashMovements = (state.cashMovements || []).filter(m => {
      if (m.source_type === 'APORTE_SOCIO' && (String(m.source_id) === String(contributionId) || (m.description && m.description.includes(item.partner_name) && m.amount === item.amount))) {
        return false;
      }
      return true;
    });

    saveState(true);
    renderAll(false);
    showToast(`Movimiento de ${item.partner_name} eliminado y saldo de caja actualizado`, 'success');
  }

  function setupSociosModal() {
    const form = document.getElementById('formSocioAporte');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const socio = document.getElementById('socioNombre')?.value || 'Valen';
        const tipo = document.getElementById('socioTipo')?.value || 'APORTE';
        const monto = parseFloat(document.getElementById('socioMonto')?.value) || 0;
        const medio = document.getElementById('socioMedio')?.value || 'Efectivo';
        const concepto = document.getElementById('socioConcepto')?.value.trim();
        const contribId = Date.now();

        state.partnerContributions.push({
          id: contribId,
          partner_name: socio,
          type: tipo,
          amount: monto,
          date: new Date().toISOString(),
          concept: concepto,
          payment_method: medio
        });

        // Impactar en caja (Aporte = INGRESO, Retiro = EGRESO)
        const isAporte = tipo === 'APORTE';
        state.cashMovements.push({
          id: contribId + 1,
          date: new Date().toISOString(),
          type: isAporte ? 'INGRESO' : 'EGRESO',
          source_type: 'APORTE_SOCIO',
          source_id: String(contribId),
          amount: monto,
          payment_method: medio,
          description: `${tipo} de Socio ${socio}: ${concepto}`
        });

        saveState(true);
        closeModal('modalSocioAporte');
        renderAll(false);
        showToast(`${tipo} de Socio ${socio} por ${formatARS(monto)} registrado`, 'success');
      });
    }

    const btn = document.getElementById('btnNuevoAporteSocio');
    if (btn) btn.addEventListener('click', () => openModal('modalSocioAporte'));
  }

  // 7. PROVEEDORES (CRUD COMPLETO)
  function openEditProveedor(provId) {
    const prov = (state.suppliers || []).find(p => String(p.id) === String(provId));
    if (!prov) return;

    document.getElementById('provEditId').value = prov.id;
    const titleEl = document.getElementById('modalProvTitle');
    if (titleEl) titleEl.textContent = 'EDITAR PROVEEDOR';
    const btnSubmit = document.getElementById('btnGuardarProveedor');
    if (btnSubmit) btnSubmit.textContent = 'Guardar Cambios';

    document.getElementById('provName').value = prov.name || '';
    document.getElementById('provContact').value = prov.contact || '';
    document.getElementById('provPhone').value = prov.phone || '';
    document.getElementById('provInstagram').value = prov.instagram || '';
    document.getElementById('provEmail').value = prov.email || '';
    document.getElementById('provNotes').value = prov.notes || '';

    openModal('modalProveedor');
  }

  function deleteProveedor(provId) {
    const prov = (state.suppliers || []).find(p => String(p.id) === String(provId));
    if (!prov) return;

    if (!confirm(`¿Eliminar al proveedor "${prov.name}" del directorio?`)) {
      return;
    }

    state.suppliers = (state.suppliers || []).filter(p => String(p.id) !== String(provId));
    saveState(true);
    renderAll(false);
    showToast(`Proveedor ${prov.name} eliminado`, 'info');
  }

  function setupProveedoresModal() {
    const form = document.getElementById('formProveedor');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const editId = document.getElementById('provEditId')?.value;
        const name = document.getElementById('provName')?.value.trim();
        const contact = document.getElementById('provContact')?.value.trim();
        const phone = document.getElementById('provPhone')?.value.trim();
        const ig = document.getElementById('provInstagram')?.value.trim();
        const email = document.getElementById('provEmail')?.value.trim();
        const notes = document.getElementById('provNotes')?.value.trim();

        if (editId) {
          // Actualizar existente
          const prov = (state.suppliers || []).find(p => String(p.id) === String(editId));
          if (prov) {
            prov.name = name;
            prov.contact = contact;
            prov.phone = phone;
            prov.instagram = ig;
            prov.email = email;
            prov.notes = notes;
            showToast(`Proveedor ${name} actualizado con éxito`, 'success');
          }
        } else {
          // Crear nuevo proveedor
          state.suppliers.push({
            id: Date.now(),
            name: name,
            contact: contact,
            phone: phone,
            instagram: ig,
            email: email,
            notes: notes
          });
          showToast(`Proveedor ${name} agregado al directorio`, 'success');
        }

        saveState(true);
        closeModal('modalProveedor');
        renderAll(false);
      });
    }

    const btn = document.getElementById('btnNuevoProveedor');
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('provEditId').value = '';
        const titleEl = document.getElementById('modalProvTitle');
        if (titleEl) titleEl.textContent = 'REGISTRAR NUEVO PROVEEDOR';
        const btnSubmit = document.getElementById('btnGuardarProveedor');
        if (btnSubmit) btnSubmit.textContent = 'Guardar Proveedor';

        document.getElementById('provName').value = '';
        document.getElementById('provContact').value = '';
        document.getElementById('provPhone').value = '';
        document.getElementById('provInstagram').value = '';
        document.getElementById('provEmail').value = '';
        document.getElementById('provNotes').value = '';
        openModal('modalProveedor');
      });
    }
  }

  // ==========================================================================
  // CALENDARIO COMPARTIDO (TAREAS DE CONTENIDO ENTRE SOCIOS)
  // ==========================================================================
  let calCurrentDate = new Date();
  let calFilterSocio = 'all'; // 'all', 'Valen', 'Zair'
  let calSelectedDate = null; // 'YYYY-MM-DD'
  let draggedTaskId = null;

  const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const DAY_NAMES_ES = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
  ];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateIso(year, monthIndex, day) {
    const y = year;
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getTodayIso() {
    const now = new Date();
    return formatDateIso(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function renderCalendario() {
    const grid = document.getElementById('calendarMonthlyGrid');
    const titleEl = document.getElementById('calendarMonthTitle');
    const badgePending = document.getElementById('badgePendingTasks');

    // 1. Contador de tareas pendientes globales
    const allTasks = state.calendarTasks || [];
    const pendingCount = allTasks.filter(t => !t.completed).length;
    if (badgePending) {
      if (pendingCount > 0) {
        badgePending.textContent = pendingCount;
        badgePending.style.display = 'inline-block';
      } else {
        badgePending.style.display = 'none';
      }
    }

    if (!grid) return;

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();

    if (titleEl) {
      titleEl.textContent = `${MONTH_NAMES_ES[month].toUpperCase()} ${year}`;
    }

    const todayStr = getTodayIso();

    // Días del mes actual
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    // Días del mes previo
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Primer día del mes (0 = Domingo, 1 = Lunes, ...)
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startingDay = (firstDayIndex + 6) % 7; // Lunes = 0, Domingo = 6

    let html = '';

    // Celdas de días del mes anterior (padding inicial)
    for (let i = startingDay - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, prevDay);
      const prevIso = formatDateIso(prevDate.getFullYear(), prevDate.getMonth(), prevDay);
      html += renderCalendarCell(prevIso, prevDay, false, prevIso === todayStr);
    }

    // Celdas del mes actual
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const currentIso = formatDateIso(year, month, day);
      html += renderCalendarCell(currentIso, day, true, currentIso === todayStr);
    }

    // Celdas del mes siguiente (padding final hasta completar semanas)
    const totalCells = startingDay + daysInCurrentMonth;
    const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(year, month + 1, day);
      const nextIso = formatDateIso(nextDate.getFullYear(), nextDate.getMonth(), day);
      html += renderCalendarCell(nextIso, day, false, nextIso === todayStr);
    }

    grid.innerHTML = html;
  }

  function renderCalendarCell(dateStr, dayNumber, isCurrentMonth, isToday) {
    const allTasks = state.calendarTasks || [];
    let dayTasks = allTasks.filter(t => t.date === dateStr);

    if (calFilterSocio !== 'all') {
      dayTasks = dayTasks.filter(t => t.responsible === calFilterSocio);
    }

    // Ordenar: pendientes primero, luego por hora
    dayTasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.time || '').localeCompare(b.time || '');
    });

    const cellClass = [
      'calendar-day-cell',
      !isCurrentMonth ? 'calendar-day-other-month' : '',
      isToday ? 'calendar-day-today' : ''
    ].filter(Boolean).join(' ');

    const tasksHtml = dayTasks.map(t => {
      const isValen = t.responsible === 'Valen';
      const pillClass = isValen ? 'task-pill-valen' : 'task-pill-zair';
      const completedClass = t.completed ? 'task-completed' : '';
      const checkIcon = t.completed ? '<span class="task-pill-check">✓</span>' : '';
      const timeStr = t.time ? `<span class="task-pill-time">${t.time}</span>` : '';

      return `
        <div class="task-pill ${pillClass} ${completedClass}"
             draggable="true"
             ondragstart="window.bhApp.handleTaskDragStart(event, '${t.id}')"
             onclick="event.stopPropagation(); window.bhApp.openDayDetail('${dateStr}')"
             title="${escapeHtml(t.title)} (${t.responsible})">
          ${checkIcon}${timeStr}<span class="task-pill-title">${escapeHtml(t.title)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="${cellClass}"
           data-date="${dateStr}"
           onclick="window.bhApp.openDayDetail('${dateStr}')"
           ondragover="window.bhApp.handleDayDragOver(event)"
           ondragleave="window.bhApp.handleDayDragLeave(event)"
           ondrop="window.bhApp.handleDayDrop(event, '${dateStr}')">
        <div class="cal-day-header">
          <span class="cal-day-num">${dayNumber}</span>
          <button class="cal-btn-add-mini"
                  onclick="event.stopPropagation(); window.bhApp.openModalTarea('${dateStr}')"
                  title="Nueva tarea para este día">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
        <div class="cal-day-tasks">
          ${tasksHtml}
        </div>
      </div>
    `;
  }

  function navCalMonth(offset) {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + offset);
    renderCalendario();
  }

  function navCalToday() {
    calCurrentDate = new Date();
    renderCalendario();
  }

  function setCalFilterSocio(socio) {
    calFilterSocio = socio;
    document.querySelectorAll('.cal-filter-chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-socio') === socio);
    });
    renderCalendario();
    if (calSelectedDate) {
      renderDayTasksList(calSelectedDate);
    }
  }

  function openModalTarea(dateStr = null, taskId = null) {
    // Si el detalle del día estaba abierto, cerrarlo para no dejar dos formularios superpuestos
    closeModal('modalDetalleDia');

    const editIdEl = document.getElementById('tareaEditId');
    const titleModalEl = document.getElementById('modalTareaTitle');
    const tituloEl = document.getElementById('tareaTitulo');
    const respEl = document.getElementById('tareaResponsable');
    const fechaEl = document.getElementById('tareaFecha');
    const horaEl = document.getElementById('tareaHora');
    const estadoEl = document.getElementById('tareaEstado');
    const notaEl = document.getElementById('tareaNota');
    const btnSubmit = document.getElementById('btnGuardarTarea');

    if (taskId) {
      const task = (state.calendarTasks || []).find(t => String(t.id) === String(taskId));
      if (!task) return;
      if (editIdEl) editIdEl.value = task.id;
      if (titleModalEl) titleModalEl.textContent = 'EDITAR TAREA';
      if (tituloEl) tituloEl.value = task.title || '';
      if (respEl) respEl.value = task.responsible || 'Valen';
      if (fechaEl) fechaEl.value = task.date || getTodayIso();
      if (horaEl) horaEl.value = task.time || '';
      if (estadoEl) estadoEl.value = task.completed ? 'true' : 'false';
      if (notaEl) notaEl.value = task.note || '';
      if (btnSubmit) btnSubmit.textContent = 'Actualizar tarea';
    } else {
      if (editIdEl) editIdEl.value = '';
      if (titleModalEl) titleModalEl.textContent = 'NUEVA TAREA';
      if (tituloEl) tituloEl.value = '';
      if (respEl) respEl.value = 'Valen';
      if (fechaEl) fechaEl.value = dateStr || getTodayIso();
      if (horaEl) horaEl.value = '';
      if (estadoEl) estadoEl.value = 'false';
      if (notaEl) notaEl.value = '';
      if (btnSubmit) btnSubmit.textContent = 'Guardar tarea';
    }

    openModal('modalTarea');
  }

  function saveTaskFromModal(e) {
    e.preventDefault();
    const editId = document.getElementById('tareaEditId')?.value;
    const title = document.getElementById('tareaTitulo')?.value.trim();
    const responsible = document.getElementById('tareaResponsable')?.value || 'Valen';
    const date = document.getElementById('tareaFecha')?.value;
    const time = document.getElementById('tareaHora')?.value.trim();
    const completed = document.getElementById('tareaEstado')?.value === 'true';
    const note = document.getElementById('tareaNota')?.value.trim();

    if (!title || !date) {
      showToast('Completá el título y la fecha de la tarea', 'error');
      return;
    }

    state.calendarTasks = state.calendarTasks || [];

    if (editId) {
      const task = state.calendarTasks.find(t => String(t.id) === String(editId));
      if (task) {
        task.title = title;
        task.responsible = responsible;
        task.date = date;
        task.time = time;
        task.completed = completed;
        task.note = note;
        task.updatedAt = new Date().toISOString();
        showToast('Tarea actualizada correctamente', 'success');
      }
    } else {
      const newTask = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title,
        responsible,
        date,
        time,
        completed,
        note,
        createdAt: new Date().toISOString()
      };
      state.calendarTasks.push(newTask);
      showToast('Nueva tarea guardada en el calendario', 'success');
    }

    saveState(true);
    closeModal('modalTarea');
    closeModal('modalDetalleDia');
    renderCalendario();
    if (calSelectedDate) {
      renderDayTasksList(calSelectedDate);
    }
  }

  function toggleTaskStatus(taskId) {
    const task = (state.calendarTasks || []).find(t => String(t.id) === String(taskId));
    if (!task) return;

    task.completed = !task.completed;
    saveState(true);
    renderCalendario();
    if (calSelectedDate) {
      renderDayTasksList(calSelectedDate);
    }
    showToast(task.completed ? 'Tarea marcada como completada' : 'Tarea marcada como pendiente', 'info');
  }

  function deleteTask(taskId) {
    const task = (state.calendarTasks || []).find(t => String(t.id) === String(taskId));
    if (!task) return;

    if (!confirm(`¿Eliminar la tarea "${task.title}"?`)) return;

    state.calendarTasks = (state.calendarTasks || []).filter(t => String(t.id) !== String(taskId));
    saveState(true);
    renderCalendario();
    if (calSelectedDate) {
      renderDayTasksList(calSelectedDate);
    }
    showToast('Tarea eliminada del calendario', 'info');
  }

  function openDayDetail(dateStr) {
    calSelectedDate = dateStr;
    const parts = dateStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);

    const dayName = DAY_NAMES_ES[dateObj.getDay()];
    const monthName = MONTH_NAMES_ES[m];
    const subEl = document.getElementById('modalDetalleDiaSub');
    if (subEl) {
      subEl.textContent = `${dayName} ${d} de ${monthName} de ${y}`;
    }

    const btnAdd = document.getElementById('btnAgregarTareaEnDia');
    if (btnAdd) {
      btnAdd.onclick = () => openModalTarea(dateStr);
    }

    renderDayTasksList(dateStr);
    openModal('modalDetalleDia');
  }

  function renderDayTasksList(dateStr) {
    const container = document.getElementById('dayTasksListContainer');
    const countEl = document.getElementById('modalDetalleDiaCount');
    if (!container) return;

    let tasks = (state.calendarTasks || []).filter(t => t.date === dateStr);

    if (calFilterSocio !== 'all') {
      tasks = tasks.filter(t => t.responsible === calFilterSocio);
    }

    tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.time || '').localeCompare(b.time || '');
    });

    if (countEl) {
      countEl.textContent = `${tasks.length} tarea${tasks.length === 1 ? '' : 's'} (${calFilterSocio === 'all' ? 'todos' : calFilterSocio})`;
    }

    if (tasks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; opacity: 0.5;">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <p style="font-size: 0.88rem; font-weight: 500;">No hay tareas programadas para este día.</p>
          <button class="btn btn-sm btn-outline" style="margin-top: 12px;" onclick="window.bhApp.openModalTarea('${dateStr}')">
            + Crear primera tarea
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = tasks.map(t => {
      const isValen = t.responsible === 'Valen';
      const badgeSocio = isValen
        ? '<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);"><span class="socio-dot dot-valen" style="margin-right: 4px;"></span>Valen (Socio 1)</span>'
        : '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4);"><span class="socio-dot dot-zair" style="margin-right: 4px;"></span>Zair (Socio 2)</span>';

      const timeBadge = t.time
        ? `<span class="badge" style="background: rgba(255, 255, 255, 0.08); font-family: var(--font-mono); color: #e2e8f0;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${t.time} hs</span>`
        : '';

      const statusBadge = t.completed
        ? '<span class="badge badge-green">Completada</span>'
        : '<span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-sec);">Pendiente</span>';

      const noteHtml = t.note
        ? `<div class="day-task-note">${escapeHtml(t.note)}</div>`
        : '';

      return `
        <div class="day-task-card ${t.completed ? 'task-completed' : ''}">
          <div class="day-task-left">
            <button class="day-task-check-btn"
                    onclick="window.bhApp.toggleTaskStatus('${t.id}')"
                    title="${t.completed ? 'Marcar como pendiente' : 'Marcar como completada'}">
              ${t.completed ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </button>
            <div class="day-task-info">
              <div class="day-task-title">${escapeHtml(t.title)}</div>
              <div class="day-task-meta">
                ${badgeSocio}
                ${timeBadge}
                ${statusBadge}
              </div>
              ${noteHtml}
            </div>
          </div>
          <div class="day-task-actions">
            <button class="btn btn-sm btn-outline"
                    style="padding: 4px 8px; font-size: 0.74rem;"
                    onclick="window.bhApp.openModalTarea('${dateStr}', '${t.id}')"
                    title="Editar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn btn-sm"
                    style="padding: 4px 8px; font-size: 0.74rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4);"
                    onclick="window.bhApp.deleteTask('${t.id}')"
                    title="Eliminar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Drag and Drop Handlers
  function handleTaskDragStart(e, taskId) {
    draggedTaskId = taskId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', taskId);
      e.dataTransfer.effectAllowed = 'move';
    }
    if (e.target && e.target.classList) {
      e.target.classList.add('is-dragging');
    }
  }

  function handleDayDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const cell = e.currentTarget;
    if (cell && !cell.classList.contains('drag-over')) {
      cell.classList.add('drag-over');
    }
  }

  function handleDayDragLeave(e) {
    const cell = e.currentTarget;
    if (cell) {
      cell.classList.remove('drag-over');
    }
  }

  function handleDayDrop(e, targetDateStr) {
    e.preventDefault();
    const cell = e.currentTarget;
    if (cell) {
      cell.classList.remove('drag-over');
    }

    const taskId = (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '') || draggedTaskId;
    draggedTaskId = null;
    if (!taskId) return;

    const task = (state.calendarTasks || []).find(t => String(t.id) === String(taskId));
    if (task) {
      if (task.date !== targetDateStr) {
        task.date = targetDateStr;
        saveState(true);
        renderCalendario();
        showToast(`Tarea "${task.title}" movida al ${targetDateStr}`, 'info');
      }
    }
  }

  function setupCalendario() {
    const btnPrev = document.getElementById('btnCalPrevMonth');
    if (btnPrev) btnPrev.addEventListener('click', () => navCalMonth(-1));

    const btnNext = document.getElementById('btnCalNextMonth');
    if (btnNext) btnNext.addEventListener('click', () => navCalMonth(1));

    const btnToday = document.getElementById('btnCalToday');
    if (btnToday) btnToday.addEventListener('click', navCalToday);

    document.querySelectorAll('.cal-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const socio = btn.getAttribute('data-socio') || 'all';
        setCalFilterSocio(socio);
      });
    });

    const btnNew = document.getElementById('btnNuevaTareaModal');
    if (btnNew) btnNew.addEventListener('click', () => openModalTarea(getTodayIso()));

    const form = document.getElementById('formTarea');
    if (form) form.addEventListener('submit', saveTaskFromModal);
  }

  // 8. RENTABILIDAD & PRICING LISTENERS
  function setupRentabilidad() {
    const prodSelector = document.getElementById('rentProdSelector');
    const inputCostoBase = document.getElementById('rentCostoBase');
    const inputCantidad = document.getElementById('rentCantidad');
    const inputFlete = document.getElementById('rentFleteTotal');
    const inputExtras = document.getElementById('rentCostosExtras');
    const inputPrecio = document.getElementById('rentPrecioVenta');
    const inputComision = document.getElementById('rentComisionCobro');
    const inputNombre = document.getElementById('rentNombrePrenda');
    const btnActualizarCatalogo = document.getElementById('btnRentActualizarCatalogo');

    // Al seleccionar prenda del catálogo
    if (prodSelector) {
      prodSelector.addEventListener('change', () => {
        const prodId = prodSelector.value;
        const prod = (state.products || []).find(p => p.id === prodId);

        if (prod) {
          if (inputNombre) inputNombre.value = prod.name;
          if (inputCostoBase) inputCostoBase.value = prod.cost || 0;
          if (inputPrecio) inputPrecio.value = prod.price || 0;
          if (btnActualizarCatalogo) btnActualizarCatalogo.style.display = 'block';
        } else {
          if (btnActualizarCatalogo) btnActualizarCatalogo.style.display = 'none';
        }
        calculateRentabilidad();
      });
    }

    [inputCostoBase, inputCantidad, inputFlete, inputExtras, inputPrecio, inputComision].forEach(input => {
      if (input) input.addEventListener('input', calculateRentabilidad);
    });

    const sliderPrecio = document.getElementById('sliderPrecio');
    const sliderCosto = document.getElementById('sliderCosto');
    if (sliderPrecio) sliderPrecio.addEventListener('input', calculateRentabilidad);
    if (sliderCosto) sliderCosto.addEventListener('input', calculateRentabilidad);

    // Chips de Margen Objetivo
    document.querySelectorAll('.margin-chip-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.margin-chip-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        const targetMargenPct = parseFloat(this.getAttribute('data-margin')) || 50;
        const costoBase = parseFloat(inputCostoBase?.value) || 0;
        const cantidad = parseInt(inputCantidad?.value, 10) || 1;
        const fleteTotal = parseFloat(inputFlete?.value) || 0;
        const extrasUnit = parseFloat(inputExtras?.value) || 0;
        const comisionCobroPct = parseFloat(inputComision?.value) || 0;

        const costoRealUnit = costoBase + (cantidad > 0 ? fleteTotal / cantidad : 0) + extrasUnit;

        // Fórmula: Precio = Costo / (1 - (MargenObjetivo + Comision))
        const divisor = 1 - ((targetMargenPct + comisionCobroPct) / 100);
        if (divisor > 0) {
          const precioSugerido = Math.ceil((costoRealUnit / divisor) / 500) * 500; // Redondear a múltiplos de 500
          if (inputPrecio) {
            inputPrecio.value = precioSugerido;
            calculateRentabilidad();
            showToast(`Precio ajustado a ${formatARS(precioSugerido)} para margen objetivo del ${targetMargenPct}%`, 'info');
          }
        }
      });
    });

    // Actualizar precio en catálogo
    if (btnActualizarCatalogo) {
      btnActualizarCatalogo.addEventListener('click', () => {
        const prodId = prodSelector?.value;
        const prod = (state.products || []).find(p => p.id === prodId);
        const nuevoPrecio = parseFloat(inputPrecio?.value) || 0;
        const nuevoCosto = parseFloat(inputCostoBase?.value) || 0;

        if (prod && nuevoPrecio > 0) {
          prod.price = nuevoPrecio;
          if (nuevoCosto > 0) prod.cost = nuevoCosto;
          saveState(true);
          renderAll(false);
          showToast(`¡Precio de ${prod.name} actualizado en catálogo a ${formatARS(nuevoPrecio)}!`, 'success');
        }
      });
    }

    // Copiar Resumen para WhatsApp
    const btnCopy = document.getElementById('btnCopiarResumenRentabilidad');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const nombre = inputNombre?.value || 'Prenda';
        const costo = document.getElementById('rentCostoRealUnit')?.textContent || '$0';
        const precio = formatARS(parseFloat(inputPrecio?.value) || 0);
        const ganancia = document.getElementById('rentGananciaUnit')?.textContent || '$0';
        const margen = document.getElementById('rentMargenPctText')?.textContent || '0%';
        const breakEven = document.getElementById('rentBreakEvenText')?.textContent || '0';

        const text = `*BLACKHAZE ARCHIVE // ANÁLISIS DE RENTABILIDAD*\n\n` +
          `👕 *Prenda:* ${nombre}\n` +
          `💰 *Costo Real Unitario:* ${costo}\n` +
          `🏷️ *Precio de Venta:* ${precio}\n` +
          `💵 *Ganancia Neta por Prenda:* ${ganancia}\n` +
          `📈 *Margen Neto:* ${margen}\n` +
          `🎯 *Punto de Equilibrio:* ${breakEven}\n\n` +
          `_Calculado con el motor financiero BLACKHAZE Central_`;

        navigator.clipboard.writeText(text).then(() => {
          showToast('¡Resumen copiado al portapapeles para WhatsApp!', 'success');
        }).catch(() => {
          showToast('No se pudo copiar automáticamente', 'error');
        });
      });
    }
  }

  // 9. CONFIGURACIÓN FIREBASE MODAL
  function setupFirebaseConfigModal() {
    const btnOpen = document.getElementById('btnFirebaseConfigModal');
    const form = document.getElementById('formFirebaseConfig');
    const btnTest = document.getElementById('btnTestFbConnection');

    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        if (document.getElementById('fbApiKey')) document.getElementById('fbApiKey').value = OFFICIAL_FIREBASE_CONFIG.apiKey;
        if (document.getElementById('fbProjectId')) document.getElementById('fbProjectId').value = OFFICIAL_FIREBASE_CONFIG.projectId;
        if (document.getElementById('fbAuthDomain')) document.getElementById('fbAuthDomain').value = OFFICIAL_FIREBASE_CONFIG.authDomain;
        if (document.getElementById('fbStorageBucket')) document.getElementById('fbStorageBucket').value = OFFICIAL_FIREBASE_CONFIG.storageBucket;
        if (document.getElementById('fbAppId')) document.getElementById('fbAppId').value = OFFICIAL_FIREBASE_CONFIG.appId;
        openModal('modalFirebaseConfig');
      });
    }

    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        closeModal('modalFirebaseConfig');
        showToast('Conectado a la base de datos de ' + OFFICIAL_FIREBASE_CONFIG.projectId, 'success');
        initFirebase();
      });
    }

    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        showToast('Verificando conexión con Firestore en la nube...', 'info');
        if (firestoreDb) {
          try {
            await firestoreDb.collection('blackhaze_store').doc('main_data').get();
            showToast('¡Conexión exitosa y activa con Firestore!', 'success');
          } catch (err) {
            showToast('Error de conexión: ' + (err.message || 'Verifique conexión'), 'error');
          }
        } else {
          showToast('No se pudo inicializar la base de datos Firestore.', 'error');
        }
      });
    }

    const btnRefresh = document.getElementById('btnSyncRefresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.classList.add('spinning');
        showToast('Descargando datos actualizados de Firestore...', 'info');
        try {
          if (firestoreDb) {
            const doc = await firestoreDb.collection('blackhaze_store').doc('main_data').get();
            if (doc.exists) {
              const cloudData = doc.data();
              if (cloudData) {
                state.products = Array.isArray(cloudData.products) ? cloudData.products : DEFAULT_DATA.products;
                state.sales = Array.isArray(cloudData.sales) ? cloudData.sales : [];
                state.expenses = Array.isArray(cloudData.expenses) ? cloudData.expenses : [];
                state.cashMovements = Array.isArray(cloudData.cashMovements) ? cloudData.cashMovements : [];
                state.partnerContributions = Array.isArray(cloudData.partnerContributions) ? cloudData.partnerContributions : [];
                state.suppliers = Array.isArray(cloudData.suppliers) ? cloudData.suppliers : [];
                state.revision = cloudData.revision || 1;
                state.lastUpdated = cloudData.lastUpdated || Date.now();
                renderAll(false);
                updateSyncStatusUI('online');
                showToast('¡Datos sincronizados desde Firestore!', 'success');
              }
            } else {
              await saveState(true);
              showToast('Base de datos inicializada en Firestore', 'info');
            }
          } else {
            showToast('Firestore no está conectado', 'error');
          }
        } catch (err) {
          showToast('Error al sincronizar: ' + err.message, 'error');
        } finally {
          setTimeout(() => {
            btnRefresh.classList.remove('spinning');
          }, 600);
        }
      });
    }

    const btnClearCache = document.getElementById('btnClearCacheReload');
    if (btnClearCache) {
      btnClearCache.addEventListener('click', async () => {
        if (!confirm('¿Deseas limpiar toda la memoria caché del navegador y recargar? La base de datos en la nube quedará intacta.')) {
          return;
        }
        showToast('Limpiando caché del navegador...', 'info');
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          }
          try { localStorage.clear(); } catch (e) {}
          try { sessionStorage.clear(); } catch (e) {}
        } catch (e) {}
        setTimeout(() => {
          window.location.href = window.location.origin + window.location.pathname + '?nocache=' + Date.now();
        }, 400);
      });
    }
  }

  // 10. BACKUP & EXPORTACIÓN CSV/JSON
  function exportCSV(entity) {
    let rows = [];
    let filename = `blackhaze_${entity}_${Date.now()}.csv`;

    if (entity === 'productos') {
      rows.push(['SKU', 'Nombre', 'Categoria', 'Costo', 'Precio', 'Stock Total']);
      (state.products || []).forEach(p => {
        const totalU = (p.variants || []).reduce((acc, v) => acc + (v.stock || 0), 0);
        rows.push([p.sku || p.id, p.name, p.category_name || p.category_id, p.cost, p.price, totalU]);
      });
    } else if (entity === 'ventas') {
      rows.push(['Fecha', 'Orden', 'Origen', 'Cliente', 'Telefono', 'Medio Pago', 'Total', 'Ganancia Neta', 'Estado']);
      (state.sales || []).forEach(v => {
        rows.push([v.date, v.order_number, v.origin, v.customer_name, v.customer_phone, v.payment_method, v.total, v.net_profit, v.status]);
      });
    } else if (entity === 'gastos') {
      rows.push(['Fecha', 'Concepto', 'Categoria', 'Monto', 'Medio Pago', 'Notas']);
      (state.expenses || []).forEach(g => {
        rows.push([g.date, g.concept, g.category, g.amount, g.payment_method, g.notes || '']);
      });
    } else if (entity === 'caja') {
      rows.push(['Fecha', 'Tipo', 'Concepto', 'Medio', 'Monto']);
      (state.cashMovements || []).forEach(c => {
        rows.push([c.date, c.type, c.description, c.payment_method, c.amount]);
      });
    }

    const csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    showToast(`Archivo ${filename} generado y descargado`, 'success');
  }

  function downloadFullBackup() {
    const backup = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      data: state
    };
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `blackhaze_backup_${Date.now()}.json`;
    link.click();
    showToast('Copia de seguridad completa descargada', 'success');
  }

  function setupBackupRestore() {
    const input = document.getElementById('inputRestoreBackup');
    if (input) {
      input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
          try {
            const parsed = JSON.parse(evt.target.result);
            const importedData = parsed.data || parsed;

            if (importedData && Array.isArray(importedData.products)) {
              if (confirm('¿Restaurar la base de datos completa con este archivo? Los datos actuales se reemplazarán.')) {
                state = importedData;
                saveState(true);
                renderAll(false);
                showToast('¡Copia de seguridad restaurada exitosamente!', 'success');
              }
            } else {
              showToast('Estructura de archivo de backup no válida', 'error');
            }
          } catch (err) {
            showToast('Error al leer el archivo JSON: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function resetAllData() {
    if (!confirm('ATENCIÓN: ¿Seguro que querés vaciar todos los datos de prueba y reiniciar el sistema?')) return;
    if (!confirm('Confirmación definitiva: Se borrarán ventas, movimientos y gastos cargados.')) return;

    state = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveState(true);
    renderAll(false);
    showToast('Base de datos reiniciada a valores predeterminados', 'info');
  }

  // ==========================================================================
  // RELOJ EN VIVO & UI LISTENERS
  // ==========================================================================
  function startLiveClock() {
    const clockEl = document.getElementById('clockText');
    function tick() {
      if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  function setupGeneralEventListeners() {
    // Tabs de navegación
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Sidebar toggle (desktop collapse/close & mobile drawer)
    const mobileBtn = document.getElementById('mobileMenuToggle');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const adminLayout = document.querySelector('.admin-layout');

    // Cargar preferencia guardada de sidebar compactado
    const savedCollapsed = localStorage.getItem('bh_sidebar_collapsed');
    if (savedCollapsed === 'true' && window.innerWidth > 768 && adminLayout) {
      adminLayout.classList.add('sidebar-collapsed');
    }

    const toggleSidebarCollapse = () => {
      if (!adminLayout) return;
      if (adminLayout.classList.contains('sidebar-closed')) {
        adminLayout.classList.remove('sidebar-closed');
      } else if (adminLayout.classList.contains('sidebar-collapsed')) {
        adminLayout.classList.remove('sidebar-collapsed');
        localStorage.setItem('bh_sidebar_collapsed', 'false');
      } else {
        adminLayout.classList.add('sidebar-collapsed');
        localStorage.setItem('bh_sidebar_collapsed', 'true');
      }
    };

    const toggleSidebarClose = () => {
      if (!adminLayout) return;
      if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
      } else {
        adminLayout.classList.toggle('sidebar-closed');
      }
    };

    const handleTopbarToggle = () => {
      if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('active');
        document.body.style.overflow = (sidebar && sidebar.classList.contains('open')) ? 'hidden' : '';
      } else {
        if (adminLayout && adminLayout.classList.contains('sidebar-closed')) {
          adminLayout.classList.remove('sidebar-closed');
        } else {
          toggleSidebarCollapse();
        }
      }
    };

    if (mobileBtn) mobileBtn.addEventListener('click', handleTopbarToggle);
    if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebarCollapse);
    if (closeBtn) closeBtn.addEventListener('click', toggleSidebarClose);
    if (backdrop) backdrop.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
    });

    // Atajo de teclado Ctrl+B para compactar/abrir menú lateral
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleTopbarToggle();
      }
    });

    // Filtros de búsqueda en tiempo real
    const sProds = document.getElementById('searchProdsInput');
    const fCat = document.getElementById('filterProdsCategoria');
    const fEst = document.getElementById('filterProdsEstado');
    if (sProds) sProds.addEventListener('input', renderProductos);
    if (fCat) fCat.addEventListener('change', renderProductos);
    if (fEst) fEst.addEventListener('change', renderProductos);

    const sInv = document.getElementById('searchInventarioInput');
    if (sInv) sInv.addEventListener('input', renderInventario);

    const sVentas = document.getElementById('searchVentasInput');
    const fVentasEst = document.getElementById('filterVentasEstado');
    const fVentasOrig = document.getElementById('filterVentasOrigen');
    if (sVentas) sVentas.addEventListener('input', renderVentas);
    if (fVentasEst) fVentasEst.addEventListener('change', renderVentas);
    if (fVentasOrig) fVentasOrig.addEventListener('change', renderVentas);

    const fCaja = document.getElementById('filterCajaTipo');
    if (fCaja) fCaja.addEventListener('change', renderCaja);

    const fCajaCat = document.getElementById('filterCajaCat');
    if (fCajaCat) fCajaCat.addEventListener('change', renderCaja);

    const sCaja = document.getElementById('searchCajaInput');
    if (sCaja) sCaja.addEventListener('input', renderCaja);
  }

  // ==========================================================================
  // EXPOSICIÓN GLOBAL PARA MANIPULACIÓN DESDE HTML
  // ==========================================================================
  window.bhApp = {
    switchTab,
    openModal,
    closeModal,
    openEditProduct,
    toggleDeleteProduct,
    hardDeleteProduct,
    toggleOnlineProduct,
    openStockModalFor,
    cancelSale,
    deleteSale,
    openEditCashMovement,
    deleteCashMovement,
    openEditGasto,
    deleteGasto,
    openEditProveedor,
    deleteProveedor,
    deleteSocioMovimiento,
    // Calendario Compartido
    renderCalendario,
    navCalMonth,
    navCalToday,
    setCalFilterSocio,
    openModalTarea,
    toggleTaskStatus,
    deleteTask,
    openDayDetail,
    handleTaskDragStart,
    handleDayDragOver,
    handleDayDragLeave,
    handleDayDrop,
    exportCSV,
    downloadFullBackup,
    resetAllData,
    openCloudinaryModal,
    clearCacheAndReload: async function() {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
        try { localStorage.clear(); } catch(e) {}
        try { sessionStorage.clear(); } catch(e) {}
      } catch(e) {}
      window.location.href = window.location.origin + window.location.pathname + '?nocache=' + Date.now();
    }
  };

  // INICIALIZACIÓN AL CARGAR DOM
  document.addEventListener('DOMContentLoaded', () => {
    setupGeneralEventListeners();
    setupModals();
    setupSaleModal();
    setupProductModal();
    setupStockModal();
    setupCloudinaryUploader();
    setupCajaModal();
    setupGastosModal();
    setupSociosModal();
    setupProveedoresModal();
    setupRentabilidad();
    setupCalendario();
    setupFirebaseConfigModal();
    setupBackupRestore();
    startLiveClock();

    // Render inicial
    renderAll(false);

    // Conectar a Firebase
    initFirebase();
  });

})();
