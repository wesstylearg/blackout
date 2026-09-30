/* ==========================================================================
   BLACKHAZE — MOTOR DE CATÁLOGO & DETALLE DE PRODUCTO
   - 8 productos con ficha técnica y 4 slots de imagen
   - Modal de detalle de producto interactivo
   - Filtros y Ordenamiento por separado con iconos
   - Redirección por categoría desde index.html
   ========================================================================== */

(function () {
  'use strict';

  // AUTO-PURGA DE CACHÉ SEGURA (Diferida para no interrumpir peticiones en vuelo)
  const BH_BUILD_VERSION = '2026.09.30.8_V10';
  if (typeof window !== 'undefined') {
    window.addEventListener('load', function () {
      setTimeout(function () {
        try {
          const lastVer = localStorage.getItem('bh_store_build_ver');
          if (lastVer !== BH_BUILD_VERSION) {
            localStorage.setItem('bh_store_build_ver', BH_BUILD_VERSION);
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then(regs => {
                for (let r of regs) r.unregister();
              }).catch(() => {});
            }
          }
        } catch (e) {}
      }, 1500);
    });
  }

  // CONFIGURACIÓN OFICIAL DE FIREBASE (SINCRONIZACIÓN EN TIEMPO REAL)
  const OFFICIAL_FIREBASE_CONFIG = {
    projectId: "blackhaze-app",
    appId: "1:395380855761:web:ebaef82f5ac0f36ca1c6f0",
    storageBucket: "blackhaze-app.firebasestorage.app",
    apiKey: "AIzaSyAWXmcStLgbkGR59qljC7-TjSRYHrNdYJw",
    authDomain: "blackhaze-app.firebaseapp.com",
    messagingSenderId: "395380855761"
  };

  // CATÁLOGO DE PRODUCTOS (HIDRATACIÓN INMEDIATA DESDE CACHÉ LOCAL + FIRESTORE EN VIVO)
  let PRODUCTS = [];
  try {
    const cached = localStorage.getItem('bh_cached_products');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        PRODUCTS = parsed;
      }
    }
  } catch (e) {}

  let isStoreLoaded = PRODUCTS.length > 0;
  let firestoreDb = null;
  let currentDetailProduct = null;
  let currentDetailImgIndex = 0;

  // ESTADO
  let cart = [];
  const selectedSizes = {};

  function normalizeProductForWeb(p) {
    const rawImages = Array.isArray(p.images) && p.images.length > 0 
      ? p.images 
      : (p.image ? [p.image] : []);
    const images = rawImages.filter(Boolean);

    let sizes = [];
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      sizes = p.variants.map(v => v.size);
    } else if (Array.isArray(p.sizes) && p.sizes.length > 0) {
      sizes = p.sizes;
    } else {
      sizes = ['S', 'M', 'L', 'XL'];
    }

    let specs = [];
    if (Array.isArray(p.specs) && p.specs.length > 0) {
      specs = p.specs;
    } else if (typeof p.specs === 'string' && p.specs.trim()) {
      specs = p.specs.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      specs = [
        'Confección nacional de alta calidad',
        'Corte y calce exclusivo BLACKHAZE',
        'Edición limitada'
      ];
    }

    return {
      id: p.id,
      sku: p.sku || p.id,
      ref: p.sku ? `REF. ${p.sku}` : `REF. ${p.id}`,
      name: p.name || 'PRENDA BLACKHAZE',
      price: typeof p.price === 'number' ? p.price : (parseFloat(p.price) || 0),
      type: p.category_id || p.type || 'remeras',
      typeName: p.category_name || p.typeName || 'Indumentaria',
      color: (p.color || 'negro').toLowerCase(),
      colorName: p.color_name || p.colorName || 'Negro',
      sizes: sizes,
      variants: p.variants || [],
      images: images,
      desc: p.desc || '',
      specs: specs,
      views: ['FRENTE', 'LATERAL', 'DETALLE'],
      online_active: p.online_active !== false,
      featured: !!p.featured,
      is_deleted: !!p.is_deleted
    };
  }

  function initFirebaseStore() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[BH Store] Firebase SDK diferido');
        return;
      }

      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(OFFICIAL_FIREBASE_CONFIG);
      }

      firestoreDb = firebase.firestore();

      try {
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      } catch (e) {}

      // Escuchar cambios de productos en vivo
      firestoreDb.collection('blackhaze_store').doc('main_data')
        .onSnapshot(
          doc => {
            isStoreLoaded = true;
            if (doc.exists) {
              const cloudData = doc.data();
              if (cloudData && Array.isArray(cloudData.products)) {
                // Filtrar solo los productos activos y con online_active habilitado
                PRODUCTS = cloudData.products
                  .filter(p => !p.is_deleted && p.online_active !== false)
                  .map(normalizeProductForWeb);

                // Asegurar selección de talle inicial para cada producto seleccionando uno con stock disponible
                PRODUCTS.forEach(p => {
                  const avail = getFirstAvailableSize(p);
                  selectedSizes[p.id] = avail || (p.sizes && p.sizes[0]) || 'U';
                });

                // Persistir en caché local para renderizado instantáneo (0ms) en próximas visitas
                try {
                  localStorage.setItem('bh_cached_products', JSON.stringify(PRODUCTS));
                } catch (e) {}

                // Renderizar inmediatamente en catálogo y portada
                renderHomeDrop();
                renderProductsCatalog();
              }
            } else {
              PRODUCTS = [];
              renderHomeDrop();
              renderProductsCatalog();
            }
          },
          err => {
            console.warn('[BH Store] Conexión Firestore en segundo plano:', err && err.message);
          }
        );
    } catch (err) {
      console.warn('[BH Store] Error iniciando Firebase:', err && err.message);
    }
  }

  let currentFilters = {
    type: 'all',
    color: 'all',
    size: 'all',
    sort: 'default'
  };

  // URL PARAM CHECK (?tipo=remeras, etc.)
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('tipo');
  if (typeParam) {
    currentFilters.type = typeParam;
  }

  // DOM
  const cartBtn = document.getElementById('cartToggleBtn');
  const cartCountEl = document.getElementById('cartCount');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartBackdrop = document.getElementById('cartBackdrop');
  const cartCloseBtn = document.getElementById('cartCloseBtn');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartSubtotalEl = document.getElementById('cartSubtotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutModalClose = document.getElementById('checkoutModalClose');
  const checkoutSummaryList = document.getElementById('checkoutSummaryList');
  const checkoutModalTotal = document.getElementById('checkoutModalTotal');
  const checkoutOrderIdBadge = document.getElementById('checkoutOrderIdBadge');
  const sendWhatsappOrderBtn = document.getElementById('sendWhatsappOrderBtn');
  const orderCustomerName = document.getElementById('orderCustomerName');
  const orderCustomerPhone = document.getElementById('orderCustomerPhone');
  const orderCustomerEmail = document.getElementById('orderCustomerEmail');
  const orderCustomerPostal = document.getElementById('orderCustomerPostal');
  const orderCustomerNotes = document.getElementById('orderCustomerNotes');
  let currentOrderId = '';

  const cartTotalFinal = document.getElementById('cartTotalFinal');
  const checkoutBtnLabel = document.getElementById('checkoutBtnLabel');

  // CATALOG DOM
  const productsCatalogGrid = document.getElementById('productsCatalogGrid');
  const catalogCountBadge = document.getElementById('catalogCountBadge');
  const homeDropGrid = document.getElementById('homeDropGrid');

  // FILTERS & SORT POPUPS
  const btnToggleFilter = document.getElementById('btnToggleFilter');
  const btnToggleSort = document.getElementById('btnToggleSort');
  const filterDropdownPanel = document.getElementById('filterDropdownPanel');
  const sortDropdownPanel = document.getElementById('sortDropdownPanel');

  const filterType = document.getElementById('filterType');
  const filterColor = document.getElementById('filterColor');
  const filterSize = document.getElementById('filterSize');
  const filterReset = document.getElementById('filterReset');

  // PRODUCT DETAIL MODAL
  const productDetailModal = document.getElementById('productDetailModal');
  const productDetailBox = document.getElementById('productDetailBox');
  const productDetailClose = document.getElementById('productDetailClose');

  function formatARS(amount) {
    return '$' + amount.toLocaleString('es-AR');
  }

  // CONTROL DE STOCK POR VARIANTE Y PRODUCTO
  function getVariantStock(product, size) {
    if (!product) return 0;
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const v = product.variants.find(item => item.size === size);
      if (v) return parseInt(v.stock, 10) || 0;
      return 0;
    }
    return 0;
  }

  function isSizeAvailable(product, size) {
    if (!product) return false;
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      return getVariantStock(product, size) > 0;
    }
    return true;
  }

  function getFirstAvailableSize(product) {
    if (!product) return null;
    const sizes = product.sizes || [];
    for (const s of sizes) {
      if (isSizeAvailable(product, s)) return s;
    }
    return null;
  }

  function isProductSoldOut(product) {
    if (!product) return false;
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      return product.variants.every(v => (parseInt(v.stock, 10) || 0) <= 0);
    }
    return false;
  }

  // OPTIMIZACIÓN CLOUDINARY ROBUSTA (Calidad nítida, sin artefactos de compresión y escalado exacto)
  function optimizeCloudinaryUrl(url, width = 600) {
    if (!url || typeof url !== 'string') return url || '';
    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
      // Limpiar cualquier prefijo de transformación existente (evita duplicados o compresión residual excesiva)
      const cleanUrl = url.replace(/\/upload\/(?:(?:f_auto|q_auto|w_\d+|c_\w+)[^\/]*\/)+/, '/upload/');
      return cleanUrl.replace('/upload/', `/upload/f_auto,q_auto:best,w_${width},c_limit/`);
    }
    return url;
  }

  function getProductMediaHtml(product, isDetail) {
    const rawSrc = (product.images && product.images.length > 0) ? product.images[0] : product.image;
    if (rawSrc) {
      const optimizedSrc = optimizeCloudinaryUrl(rawSrc, isDetail ? 900 : 450);
      return `<img src="${optimizedSrc}" alt="${product.name}" class="product-real-img" loading="lazy" onerror="this.onerror=null; this.src='assets/mascota.svg'; this.style.opacity='0.4';">`;
    }
    return `
      <div class="product-placeholder-box font-ui">
        <svg class="icon-svg" style="width:26px;height:26px;opacity:0.45;" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span style="font-size:0.7rem; font-weight:600; letter-spacing:0.04em;">Ver detalles</span>
      </div>
    `;
  }

  // CAMBIO DE FOTO DIRECTO EN LA TARJETA DEL PRODUCTO
  window.switchCardImage = function (productId, delta, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const p = PRODUCTS.find(prod => prod.id === productId);
    if (!p || !p.images || p.images.length <= 1) return;

    const cards = document.querySelectorAll(`.product-card[data-id="${productId}"]`);
    cards.forEach(cardEl => {
      const imgEl = cardEl.querySelector('.product-real-img');
      const dots = cardEl.querySelectorAll('.card-dot');
      let currentIndex = parseInt(cardEl.getAttribute('data-img-index') || '0', 10);
      const len = p.images.length;
      currentIndex = (currentIndex + delta + len) % len;
      cardEl.setAttribute('data-img-index', currentIndex);

      if (imgEl && p.images[currentIndex]) {
        imgEl.src = optimizeCloudinaryUrl(p.images[currentIndex], 450);
      }
      if (dots.length > 0) {
        dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
      }
    });
  };

  // RENDER DROP ON HOME PAGE (4 NEW PRODUCTS / FEATURED)
  function renderHomeDrop() {
    if (!homeDropGrid) return;

    if (PRODUCTS.length === 0) {
      homeDropGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; border: 1px dashed var(--border-line); border-radius: 8px; color: var(--text-dim);">
          <p class="font-ui" style="font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">PRÓXIMO DROP EN PREPARACIÓN</p>
          <span class="font-ui" style="font-size: 0.82rem; color: var(--text-dim);">Estamos configurando las nuevas piezas de la colección.</span>
        </div>
      `;
      return;
    }

    const featuredProds = PRODUCTS.filter(p => p.featured);
    const dropItems = featuredProds.length > 0 ? featuredProds : PRODUCTS;

    homeDropGrid.innerHTML = dropItems.map(renderProductCard).join('');
    bindSizeSelectors();
  }

  // PRODUCT CARD HTML BUILDER
  function renderProductCard(p) {
    const soldOut = isProductSoldOut(p);
    let activeSize = selectedSizes[p.id];
    if (!activeSize || !isSizeAvailable(p, activeSize)) {
      activeSize = getFirstAvailableSize(p) || (p.sizes && p.sizes[0]) || 'U';
      selectedSizes[p.id] = activeSize;
    }

    const sizeBtnsHtml = (p.sizes || []).map(s => {
      const hasStock = isSizeAvailable(p, s);
      if (!hasStock) {
        return `<button class="size-btn out-of-stock" disabled title="Talle ${s} sin stock">${s}</button>`;
      }
      return `<button class="size-btn ${s === activeSize ? 'active' : ''}" data-product="${p.id}" data-size="${s}">${s}</button>`;
    }).join('');

    const hasMultipleImages = Array.isArray(p.images) && p.images.length > 1;

    return `
      <article class="product-card ${soldOut ? 'is-soldout' : ''}" data-id="${p.id}" data-img-index="0">
        <div class="product-media-wrap" onclick="window.openProductDetail('${p.id}')">
          ${getProductMediaHtml(p)}
          ${hasMultipleImages ? `
            <div class="card-dots-indicator">
              ${p.images.map((_, idx) => `<span class="card-dot ${idx === 0 ? 'active' : ''}"></span>`).join('')}
            </div>
          ` : ''}
          ${soldOut ? `
            <div class="soldout-overlay">
              <span class="soldout-badge">SIN STOCK</span>
            </div>
          ` : ''}
        </div>
        <div class="product-body">
          <div onclick="window.openProductDetail('${p.id}')">
            <div class="product-header-line">
              <h3 class="product-title">${p.name}</h3>
              <span class="product-price price-tag">${formatARS(p.price)}</span>
            </div>
            <p class="product-desc font-ui">${p.desc || ''}</p>
          </div>

          <div>
            <div class="size-selector-wrap">
              <span class="size-selector-label font-ui">Talle:</span>
              <div class="size-options font-ui">
                ${sizeBtnsHtml}
              </div>
            </div>

            ${soldOut ? `
              <button class="add-bag-btn font-ui is-soldout" disabled>
                <span>SIN STOCK</span>
              </button>
            ` : `
              <button class="add-bag-btn font-ui" onclick="event.stopPropagation(); window.addToCart('${p.id}')">
                <svg class="icon-svg" style="width:15px;height:15px;" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span class="btn-text-full">AGREGAR AL CARRITO</span>
                <span class="btn-text-short">AGREGAR</span>
              </button>
            `}
          </div>
        </div>
      </article>
    `;
  }

  // CATEGORY DEFINITIONS FOR ORDER & LABELS
  const CATEGORY_DEFINITIONS = [
    { id: 'mallas', name: 'MALLAS & SHORTS' }
    // { id: 'buzos', name: 'BUZOS & HOODIES' },
    // { id: 'remeras', name: 'REMERAS' },
    // { id: 'gorras', name: 'GORRAS' },
    // { id: 'lentes', name: 'LENTES' },
    // { id: 'mates', name: 'MATES' },
    // { id: 'otros', name: 'ACCESORIOS & OTROS' }
  ];

  // RENDER CATALOG ON PRODUCTOS.HTML (GROUPED BY CATEGORY OR FILTERED)
  function renderProductsCatalog() {
    if (!productsCatalogGrid) return;

    // Actualizar botones de categorías en el nav superior
    const catPills = document.querySelectorAll('.cat-pill-btn');
    catPills.forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-category') === currentFilters.type);
    });

    if (PRODUCTS.length === 0) {
      if (catalogCountBadge) {
        catalogCountBadge.textContent = '0 piezas disponibles';
      }
      productsCatalogGrid.innerHTML = `
        <div style="text-align: center; padding: 5rem 1.5rem; border: 1px dashed var(--border-line); border-radius: 8px; color: var(--text-dim);">
          <p class="font-ui" style="font-size: 1.15rem; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">CATÁLOGO EN PREPARACIÓN</p>
          <span class="font-ui" style="font-size: 0.85rem; color: var(--text-dim);">Próximamente se publicarán nuevas piezas exclusivas.</span>
        </div>
      `;
      return;
    }

    let filtered = [...PRODUCTS];

    if (currentFilters.type !== 'all') {
      filtered = filtered.filter(p => p.type === currentFilters.type);
    }
    if (currentFilters.color !== 'all') {
      filtered = filtered.filter(p => p.color === currentFilters.color);
    }
    if (currentFilters.size !== 'all') {
      filtered = filtered.filter(p => (p.sizes || []).includes(currentFilters.size));
    }

    if (currentFilters.sort === 'price-asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (currentFilters.sort === 'price-desc') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (currentFilters.sort === 'name-asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentFilters.sort === 'name-desc') {
      filtered.sort((a, b) => b.name.localeCompare(a.name));
    }

    if (catalogCountBadge) {
      catalogCountBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'pieza encontrada' : 'piezas encontradas'}`;
    }

    if (filtered.length === 0) {
      productsCatalogGrid.innerHTML = `
        <div style="text-align: center; padding: 5rem 1rem; border: 1px dashed var(--border-line); border-radius: 8px; color: var(--text-dim);">
          <p class="font-ui" style="font-size: 1rem; margin-bottom: 0.5rem; color: var(--text-secondary);">No se encontraron piezas para los filtros seleccionados.</p>
          <button id="resetFiltersInline" class="btn-modern" style="margin-top: 1rem;">RESTABLECER FILTROS</button>
        </div>
      `;
      const inlineReset = document.getElementById('resetFiltersInline');
      if (inlineReset) inlineReset.addEventListener('click', resetAllFilters);
      return;
    }

    // 1. Si se seleccionó una categoría específica
    if (currentFilters.type !== 'all') {
      const catDef = CATEGORY_DEFINITIONS.find(c => c.id === currentFilters.type);
      const catTitle = catDef ? catDef.name : currentFilters.type.toUpperCase();

      productsCatalogGrid.innerHTML = `
        <section class="catalog-category-block" data-category="${currentFilters.type}">
          <div class="category-block-header">
            <div class="category-block-title-group">
              <div class="category-block-indicator"></div>
              <h3 class="category-block-title">${catTitle}</h3>
            </div>
            <span class="category-block-count font-ui">${filtered.length} ${filtered.length === 1 ? 'prenda' : 'prendas'}</span>
          </div>
          <div class="drop-grid">
            ${filtered.map(renderProductCard).join('')}
          </div>
        </section>
      `;
    } else {
      // 2. Vista agrupada y dividida por categorías para "TODOS"
      const grouped = {};
      filtered.forEach(p => {
        const catKey = p.type || 'otros';
        if (!grouped[catKey]) grouped[catKey] = [];
        grouped[catKey].push(p);
      });

      // Ordenar según el orden definido en CATEGORY_DEFINITIONS
      const orderedKeys = [];
      CATEGORY_DEFINITIONS.forEach(def => {
        if (grouped[def.id] && grouped[def.id].length > 0) {
          orderedKeys.push(def.id);
        }
      });
      // Incluir categorías extras si hubiere
      Object.keys(grouped).forEach(k => {
        if (!orderedKeys.includes(k) && grouped[k].length > 0) {
          orderedKeys.push(k);
        }
      });

      productsCatalogGrid.innerHTML = orderedKeys.map(catKey => {
        const catDef = CATEGORY_DEFINITIONS.find(c => c.id === catKey);
        const catTitle = catDef ? catDef.name : (grouped[catKey][0]?.typeName?.toUpperCase() || catKey.toUpperCase());
        const items = grouped[catKey];

        return `
          <section class="catalog-category-block" data-category="${catKey}">
            <div class="category-block-header">
              <div class="category-block-title-group">
                <div class="category-block-indicator"></div>
                <h3 class="category-block-title">${catTitle}</h3>
              </div>
              <span class="category-block-count font-ui">${items.length} ${items.length === 1 ? 'prenda' : 'prendas'}</span>
            </div>
            <div class="drop-grid">
              ${items.map(renderProductCard).join('')}
            </div>
          </section>
        `;
      }).join('');
    }

    bindSizeSelectors();
  }

  // NAVEGACIÓN DE FOTOS EN MODAL DE DETALLE
  window.changeDetailImage = function (delta, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!currentDetailProduct || !currentDetailProduct.images || currentDetailProduct.images.length <= 1) return;
    const len = currentDetailProduct.images.length;
    currentDetailImgIndex = (currentDetailImgIndex + delta + len) % len;
    updateDetailGalleryDisplay();
  };

  window.setDetailImageIndex = function (index, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!currentDetailProduct || !currentDetailProduct.images) return;
    currentDetailImgIndex = index;
    updateDetailGalleryDisplay();
  };

  function updateDetailGalleryDisplay() {
    if (!currentDetailProduct) return;
    const images = currentDetailProduct.images || [];
    const mainImg = document.getElementById('detailMainRealImg');
    const counterEl = document.getElementById('galleryCurrentIndex');
    if (mainImg && images[currentDetailImgIndex]) {
      mainImg.style.opacity = '0.5';
      mainImg.src = optimizeCloudinaryUrl(images[currentDetailImgIndex], 900);
      mainImg.onload = () => { mainImg.style.opacity = '1'; };
    }
    if (counterEl) {
      counterEl.textContent = (currentDetailImgIndex + 1);
    }
    document.querySelectorAll('.detail-thumb-box').forEach((tb, i) => {
      tb.classList.toggle('active', i === currentDetailImgIndex);
    });
  }

  // PRODUCT DETAIL MODAL (3 A 4 IMÁGENES Y MÁS DETALLES)
  
  function cleanMeasurementColumnName(name) {
    const n = name.toLowerCase();
    if (n.includes('largo')) return 'Largo';
    if (n.includes('cintura plana')) return 'Cintura plana';
    if (n.includes('contorno')) return 'Contorno aprox.';
    return name;
  }

  function parseProductSpecs(rawSpecs) {
    if (!Array.isArray(rawSpecs) || rawSpecs.length === 0) {
      return { features: [], measurements: null };
    }

    const features = [];
    const measurementCategories = [];
    let currentCategory = null;

    const ignoreRegex = /^(ficha t[eé]cnica|talles?:.*)$/i;

    for (let rawLine of rawSpecs) {
      const line = String(rawLine).trim();
      if (!line || ignoreRegex.test(line)) continue;

      if (line.endsWith(':') && !line.toLowerCase().startsWith('tipo:')) {
        const colName = cleanMeasurementColumnName(line.replace(/:$/, '').trim());
        currentCategory = {
          name: colName,
          values: {}
        };
        measurementCategories.push(currentCategory);
        continue;
      }

      const sizeMatch = line.match(/^([SMLX|XL|XXL|U|0-9]+)\s*[:=-]\s*(.+)$/i);
      if (sizeMatch && currentCategory) {
        const sizeKey = sizeMatch[1].toUpperCase();
        const val = sizeMatch[2].trim();
        currentCategory.values[sizeKey] = val;
        continue;
      }

      features.push(line);
    }

    let measurementsTable = null;
    if (measurementCategories.length > 0) {
      const allSizes = ['S', 'M', 'L', 'XL', 'XXL'];
      const foundSizes = allSizes.filter(s => measurementCategories.some(cat => cat.values[s]));

      if (foundSizes.length > 0) {
        measurementsTable = {
          columns: measurementCategories.map(cat => cat.name),
          rows: foundSizes.map(size => {
            const rowValues = {};
            measurementCategories.forEach(cat => {
              rowValues[cat.name] = cat.values[size] || '-';
            });
            return {
              size,
              values: rowValues
            };
          })
        };
      }
    }

    return { features, measurements: measurementsTable };
  }

  window.selectProductDetailSize = function (productId, size) {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod || !isSizeAvailable(prod, size)) return;

    selectedSizes[productId] = size;

    const detailBox = document.getElementById('productDetailBox');
    if (detailBox) {
      detailBox.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-size') === size);
      });
      detailBox.querySelectorAll('.size-table-row').forEach(row => {
        row.classList.toggle('is-active-size', row.getAttribute('data-size-row') === size);
      });
    }
  };

  window.openProductDetail = function (productId) {
    const p = PRODUCTS.find(prod => prod.id === productId);
    if (!p || !productDetailModal || !productDetailBox) return;

    currentDetailProduct = p;
    currentDetailImgIndex = 0;

    const soldOut = isProductSoldOut(p);
    let activeSize = selectedSizes[p.id];
    if (!activeSize || !isSizeAvailable(p, activeSize)) {
      activeSize = getFirstAvailableSize(p) || (p.sizes && p.sizes[0]) || 'U';
      selectedSizes[p.id] = activeSize;
    }

    const sizeBtnsHtml = (p.sizes || []).map(s => {
      const hasStock = isSizeAvailable(p, s);
      if (!hasStock) {
        return `<button class="size-btn out-of-stock" disabled title="Talle ${s} sin stock">${s}</button>`;
      }
      return `<button class="size-btn ${s === activeSize ? 'active' : ''}" data-product="${p.id}" data-size="${s}" onclick="window.selectProductDetailSize('${p.id}', '${s}')">${s}</button>`;
    }).join('');

    // Parseo inteligente de Ficha Técnica vs Tabla de Medidas
    const parsedSpecs = parseProductSpecs(p.specs);

    const specsHtml = parsedSpecs.features.length > 0 ? `
      <div class="product-specs-section">
        <span class="product-specs-title">Detalles de la prenda:</span>
        <div class="product-specs-wrap">
          ${parsedSpecs.features.map(feat => `
            <div class="spec-pill font-ui">
              <span class="spec-pill-dot"></span>
              <span>${feat}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const measurementsHtml = parsedSpecs.measurements ? `
      <div class="product-measurements-section font-ui">
        <div class="measurements-header">
          <svg class="icon-svg" style="width:14px;height:14px;color:var(--violet-light);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
          <span>Guía de Talles y Medidas (en cm)</span>
        </div>
        <div class="measurements-table-wrapper">
          <table class="measurements-table">
            <thead>
              <tr>
                <th>Talle</th>
                ${parsedSpecs.measurements.columns.map(col => `<th>${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${parsedSpecs.measurements.rows.map(r => `
                <tr class="size-table-row ${r.size === activeSize ? 'is-active-size' : ''}" data-size-row="${r.size}" onclick="window.selectProductDetailSize('${p.id}', '${r.size}')" title="Seleccionar talle ${r.size}">
                  <td><span class="size-col-tag">${r.size}</span></td>
                  ${parsedSpecs.measurements.columns.map(col => `<td>${r.values[col] || '-'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : '';

    const hasImages = p.images && p.images.length > 0;
    const hasMultipleImages = hasImages && p.images.length > 1;

    const thumbsHtml = hasImages
      ? p.images.map((imgSrc, i) => `
        <div class="detail-thumb-box ${i === 0 ? 'active' : ''}" data-img="${imgSrc}" data-index="${i}" onclick="window.setDetailImageIndex(${i}, event)">
          <img src="${optimizeCloudinaryUrl(imgSrc, 180)}" alt="${p.name} vista ${i + 1}" onerror="this.onerror=null; this.src='assets/mascota.svg';">
        </div>
      `).join('')
      : p.views.map((v, i) => `
        <div class="detail-thumb-box ${i === 0 ? 'active' : ''}" data-view="${v}">
          <span>${v}</span>
        </div>
      `).join('');

    const mainMediaHtml = hasImages
      ? `
        <img id="detailMainRealImg" src="${optimizeCloudinaryUrl(p.images[0], 900)}" alt="${p.name}" class="detail-main-real-img" onerror="this.onerror=null; this.src='assets/mascota.svg';">
        ${hasMultipleImages ? `
          <button class="gallery-arrow-btn gallery-prev" aria-label="Foto anterior" onclick="window.changeDetailImage(-1, event)">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button class="gallery-arrow-btn gallery-next" aria-label="Siguiente foto" onclick="window.changeDetailImage(1, event)">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
          <div class="gallery-index-badge">
            <span id="galleryCurrentIndex">1</span> / ${p.images.length}
          </div>
        ` : ''}
        ${soldOut ? `
          <div class="soldout-overlay">
            <span class="soldout-badge">SIN STOCK</span>
          </div>
        ` : ''}
      `
      : `
        <svg class="icon-svg" style="width:44px;height:44px;opacity:0.35;" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span id="detailMainViewTitle" style="font-size:0.85rem; font-weight:600; letter-spacing:0.06em; color:#ffffff;">${p.views[0]}</span>
        <span style="font-size:0.72rem; color:#777;">Fotos del producto</span>
        ${soldOut ? `
          <div class="soldout-overlay">
            <span class="soldout-badge">SIN STOCK</span>
          </div>
        ` : ''}
      `;

    productDetailBox.innerHTML = `
      <button id="productDetailCloseBtn" class="modal-close-corner" aria-label="Cerrar ventana">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="product-detail-gallery font-ui">
        <div class="detail-main-img-box" id="detailMainImageBox">
          ${mainMediaHtml}
        </div>

        <div class="detail-thumbnails-row">
          ${thumbsHtml}
        </div>
      </div>

      <div class="product-detail-info font-ui">
        <div>
          <div style="font-size:0.72rem; color:var(--violet-light); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:0.35rem; font-weight:600;">${p.typeName.toUpperCase()}</div>
          <h2 class="font-editorial" style="font-size: 1.85rem; font-weight: 700; line-height: 1.15; margin-bottom: 0.5rem;">${p.name}</h2>
          <div class="price-tag" style="font-size: 1.45rem; color: #ffffff; margin-bottom: 1rem;">${formatARS(p.price)} ARS</div>

          <p style="font-size: 0.84rem; color: #ccc; line-height: 1.5; margin-bottom: 0.85rem;">${p.desc}</p>

          ${specsHtml}
          ${measurementsHtml}
        </div>

        <div>
          <div class="size-selector-wrap" style="margin-top: 0.5rem;">
            <span class="size-selector-label">Seleccionar Talle:</span>
            <div class="size-options">
              ${sizeBtnsHtml}
            </div>
          </div>

          ${soldOut ? `
            <button class="add-bag-btn font-ui is-soldout" disabled style="padding: 15px; font-size: 0.85rem;">
              <span>SIN STOCK</span>
            </button>
          ` : `
            <button class="add-bag-btn font-ui" onclick="window.addToCart('${p.id}'); window.closeProductDetail();" style="padding: 15px; font-size: 0.85rem;">
              <svg class="icon-svg" style="width:18px;height:18px;" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>AGREGAR AL CARRITO</span>
            </button>
          `}
        </div>
      </div>
    `;

    // Soporte táctil / swipe para cambiar de foto con el dedo en celular
    const galleryEl = productDetailBox.querySelector('.product-detail-gallery');
    if (galleryEl && hasMultipleImages) {
      let touchStartX = 0;
      galleryEl.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      galleryEl.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        if (Math.abs(diff) > 40) {
          if (diff < 0) {
            window.changeDetailImage(1);
          } else {
            window.changeDetailImage(-1);
          }
        }
      }, { passive: true });
    }

    const closeBtn = document.getElementById('productDetailCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeProductDetail);

    bindSizeSelectors();
    productDetailModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeProductDetail = function () {
    if (productDetailModal) {
      productDetailModal.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  function bindSizeSelectors() {
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (this.disabled || this.classList.contains('out-of-stock')) return;
        const prodId = this.getAttribute('data-product');
        const size = this.getAttribute('data-size');
        if (!prodId || !size) return;

        const prod = PRODUCTS.find(p => p.id === prodId);
        if (prod && !isSizeAvailable(prod, size)) return;

        selectedSizes[prodId] = size;

        const parent = this.closest('.size-options');
        if (parent) {
          parent.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
        }

        const detailBox = this.closest('#productDetailBox');
        if (detailBox) {
          detailBox.querySelectorAll('.size-table-row').forEach(row => {
            row.classList.toggle('is-active-size', row.getAttribute('data-size-row') === size);
          });
        }
      });
    });
  }

  function resetAllFilters() {
    currentFilters = {
      type: 'all',
      color: 'all',
      size: 'all',
      sort: 'default'
    };
    if (filterType) filterType.value = 'all';
    if (filterColor) filterColor.value = 'all';
    if (filterSize) filterSize.value = 'all';
    renderProductsCatalog();
  }

  function setupFiltersAndSort() {
    // CATEGORY PILL NAVIGATION (ACCESO RÁPIDO)
    const categoryNav = document.getElementById('catalogCategoryNav');
    if (categoryNav) {
      categoryNav.addEventListener('click', e => {
        const btn = e.target.closest('.cat-pill-btn');
        if (!btn) return;
        const cat = btn.getAttribute('data-category') || 'all';
        currentFilters.type = cat;
        if (filterType) filterType.value = cat;
        renderProductsCatalog();
      });
    }

    // TOGGLE SEPARATE POPUPS
    if (btnToggleFilter && filterDropdownPanel) {
      btnToggleFilter.addEventListener('click', () => {
        filterDropdownPanel.classList.toggle('open');
        btnToggleFilter.classList.toggle('active');
        if (sortDropdownPanel) {
          sortDropdownPanel.classList.remove('open');
          if (btnToggleSort) btnToggleSort.classList.remove('active');
        }
      });
    }

    if (btnToggleSort && sortDropdownPanel) {
      btnToggleSort.addEventListener('click', () => {
        sortDropdownPanel.classList.toggle('open');
        btnToggleSort.classList.toggle('active');
        if (filterDropdownPanel) {
          filterDropdownPanel.classList.remove('open');
          if (btnToggleFilter) btnToggleFilter.classList.remove('active');
        }
      });
    }

    // Sort buttons click
    document.querySelectorAll('.sort-option-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sort-option-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentFilters.sort = this.getAttribute('data-sort');
        renderProductsCatalog();
        if (sortDropdownPanel) sortDropdownPanel.classList.remove('open');
        if (btnToggleSort) btnToggleSort.classList.remove('active');
      });
    });

    if (filterType) {
      if (currentFilters.type !== 'all') filterType.value = currentFilters.type;
      filterType.addEventListener('change', e => {
        currentFilters.type = e.target.value;
        renderProductsCatalog();
      });
    }
    if (filterColor) {
      filterColor.addEventListener('change', e => {
        currentFilters.color = e.target.value;
        renderProductsCatalog();
      });
    }
    if (filterSize) {
      filterSize.addEventListener('change', e => {
        currentFilters.size = e.target.value;
        renderProductsCatalog();
      });
    }
    if (filterReset) {
      filterReset.addEventListener('click', resetAllFilters);
    }
  }

  // CART LOGIC
  function initCart() {
    try {
      const stored = localStorage.getItem('blackhaze_cart_v1');
      if (stored) cart = JSON.parse(stored);
    } catch (e) {
      cart = [];
    }
    renderCart();
  }

  function saveCart() {
    try {
      localStorage.setItem('blackhaze_cart_v1', JSON.stringify(cart));
    } catch (e) {}
    renderCart();
  }

  function renderCart() {
    const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
    if (cartCountEl) cartCountEl.textContent = totalItems;

    if (!cartItemsList) return;

    if (cart.length === 0) {
      if (cartTotalFinal) cartTotalFinal.textContent = '$0 ARS';
      if (checkoutBtnLabel) checkoutBtnLabel.textContent = 'COORDINAR POR WHATSAPP';

      cartItemsList.innerHTML = `
        <div class="cart-empty-state font-ui">
          <svg class="icon-svg" style="width:36px;height:36px;opacity:0.3;margin-bottom:1rem;" viewBox="0 0 24 24">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          <p style="font-size: 0.9rem; color: #888;">Tu carrito está vacío.</p>
          <p style="font-size: 0.75rem; margin-top: 0.4rem; color: #555;">Seleccioná prendas del catálogo para agregarlas.</p>
        </div>
      `;
      if (cartSubtotalEl) cartSubtotalEl.textContent = '$0 ARS';
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.style.opacity = '0.4';
      }
      return;
    }

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.style.opacity = '1';
    }

    let subtotal = 0;
    cartItemsList.innerHTML = cart.map((item, index) => {
      const itemSub = item.price * item.qty;
      subtotal += itemSub;
      return `
        <div class="cart-item-card" data-index="${index}">
          <div style="width:72px; height:72px; background:#0a0a0a; border:1px solid #222; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#555; overflow:hidden; padding:4px;">
            ${item.image ? `<img src="${optimizeCloudinaryUrl(item.image, 240)}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.onerror=null; this.src='assets/mascota.svg';">` : `
              <svg class="icon-svg" style="width:20px;height:20px;" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18"></rect>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            `}
          </div>
          <div class="cart-item-info">
            <div>
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-meta font-ui" style="margin-top:2px;">Talle: <strong style="color:var(--text-primary); font-weight:600;">${item.size}</strong></div>
            </div>
            <div class="cart-item-price price-tag">${formatARS(item.price)}</div>
            <div class="cart-qty-ctrl">
              <button class="cart-qty-btn btn-dec" data-index="${index}">-</button>
              <span class="cart-qty-num font-ui">${item.qty}</span>
              <button class="cart-qty-btn btn-inc" data-index="${index}">+</button>
            </div>
          </div>
          <button class="cart-del-btn" data-index="${index}" aria-label="Eliminar producto">
            <svg class="icon-svg" style="width:16px;height:16px;" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
    }).join('');

    if (cartSubtotalEl) {
      cartSubtotalEl.textContent = formatARS(subtotal) + ' ARS';
    }

    if (cartTotalFinal) {
      cartTotalFinal.textContent = formatARS(subtotal) + ' ARS';
    }

    if (checkoutBtnLabel) {
      checkoutBtnLabel.textContent = `COORDINAR POR WHATSAPP (${formatARS(subtotal)})`;
    }
  }

  window.addToCart = function (productId) {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod) return;

    if (isProductSoldOut(prod)) {
      alert('Este producto se encuentra actualmente SIN STOCK.');
      return;
    }

    const size = selectedSizes[productId] || getFirstAvailableSize(prod) || prod.sizes[0];
    if (!isSizeAvailable(prod, size)) {
      alert(`El talle ${size} se encuentra actualmente sin stock. Por favor seleccioná otro talle disponible.`);
      return;
    }

    const availableStock = getVariantStock(prod, size);
    const existingIndex = cart.findIndex(item => item.id === productId && item.size === size);

    if (existingIndex > -1) {
      if (prod.variants && prod.variants.length > 0 && cart[existingIndex].qty >= availableStock) {
        alert(`No podés agregar más unidades. El stock disponible para el talle ${size} es de ${availableStock} unidad(es).`);
        return;
      }
      cart[existingIndex].qty += 1;
    } else {
      cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        ref: prod.ref,
        image: prod.images && prod.images.length > 0 ? prod.images[0] : null,
        size: size,
        qty: 1
      });
    }

    saveCart();
    openCart();
  };

  function openCart() {
    if (cartDrawer && cartBackdrop) {
      cartDrawer.classList.add('open');
      cartBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeCart() {
    if (cartDrawer && cartBackdrop) {
      cartDrawer.classList.remove('open');
      cartBackdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  if (cartItemsList) {
    cartItemsList.addEventListener('click', function (e) {
      const incBtn = e.target.closest('.btn-inc');
      const decBtn = e.target.closest('.btn-dec');
      const delBtn = e.target.closest('.cart-del-btn');

      if (incBtn) {
        const idx = parseInt(incBtn.dataset.index, 10);
        const item = cart[idx];
        if (item) {
          const prod = PRODUCTS.find(p => p.id === item.id);
          if (prod && Array.isArray(prod.variants) && prod.variants.length > 0) {
            const availableStock = getVariantStock(prod, item.size);
            if (item.qty >= availableStock) {
              alert(`Stock máximo disponible para ${item.name} [Talle ${item.size}]: ${availableStock} unidad(es).`);
              return;
            }
          }
          item.qty += 1;
          saveCart();
        }
      } else if (decBtn) {
        const idx = parseInt(decBtn.dataset.index, 10);
        if (cart[idx]) {
          if (cart[idx].qty > 1) {
            cart[idx].qty -= 1;
          } else {
            cart.splice(idx, 1);
          }
          saveCart();
        }
      } else if (delBtn) {
        const idx = parseInt(delBtn.dataset.index, 10);
        if (cart[idx]) {
          cart.splice(idx, 1);
          saveCart();
        }
      }
    });
  }

  const WHATSAPP_PHONE = '5492983611938';

  function generateOrderId() {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'BH-' + code;
  }

  // Envíos a todo el país coordinados vía WhatsApp

  function openCheckoutModal() {
    if (cart.length === 0) return;
    closeCart();

    currentOrderId = generateOrderId();
    if (checkoutOrderIdBadge) {
      checkoutOrderIdBadge.textContent = '#' + currentOrderId;
    }

    let subtotal = 0;
    let itemsHtml = cart.map(item => {
      const lineTotal = item.price * item.qty;
      subtotal += lineTotal;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.8rem;">
          <div style="text-align: left;">
            <span style="font-weight: 600; color: #fff;">${item.qty}x ${item.name}</span>
            <span style="display: block; font-size: 0.7rem; color: var(--text-dim); margin-top: 1px;">Talle: <strong style="color: var(--violet-light);">${item.size}</strong> • Unitario: ${formatARS(item.price)}</span>
          </div>
          <span class="price-tag" style="font-size: 0.85rem; font-weight: 700; color: #fff;">${formatARS(lineTotal)}</span>
        </div>
      `;
    }).join('');

    // Banner de envío a todo el país coordinado por WhatsApp
    itemsHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 10px; border: 1px dashed rgba(168,85,247,0.3); font-size: 0.76rem; background: rgba(136,80,201,0.08); border-radius: 4px; margin-top: 6px;">
        <span style="font-weight: 600; color: var(--violet-light);">🚚 Envío a todo el país:</span>
        <span style="font-size: 0.74rem; color: #fff; font-weight: 600;">A coordinar por WhatsApp</span>
      </div>
    `;

    if (checkoutSummaryList) {
      checkoutSummaryList.innerHTML = itemsHtml;
    }

    if (checkoutModalTotal) {
      checkoutModalTotal.textContent = formatARS(subtotal) + ' ARS';
    }

    if (checkoutModal) checkoutModal.classList.add('open');
  }

  function closeCheckoutModal() {
    if (checkoutModal) checkoutModal.classList.remove('open');
  }

  function handleWhatsappCheckout() {
    if (cart.length === 0) {
      alert('Tu carrito de compras está vacío.');
      return;
    }

    const name = orderCustomerName ? orderCustomerName.value.trim() : '';
    const phone = orderCustomerPhone ? orderCustomerPhone.value.trim() : '';
    const email = orderCustomerEmail ? orderCustomerEmail.value.trim() : '';
    const postal = orderCustomerPostal ? orderCustomerPostal.value.trim() : '';
    const notes = orderCustomerNotes ? orderCustomerNotes.value.trim() : '';

    if (!name) {
      alert('Por favor, ingresá tu Nombre y Apellido para coordinar el pedido.');
      if (orderCustomerName) orderCustomerName.focus();
      return;
    }
    if (!phone) {
      alert('Por favor, ingresá tu Teléfono o Celular para que podamos responderte.');
      if (orderCustomerPhone) orderCustomerPhone.focus();
      return;
    }
    if (!email || !email.includes('@')) {
      alert('Por favor, ingresá un Email de contacto válido.');
      if (orderCustomerEmail) orderCustomerEmail.focus();
      return;
    }
    if (!postal) {
      alert('Por favor, ingresá tu Código Postal / Localidad para acordar el envío.');
      if (orderCustomerPostal) orderCustomerPostal.focus();
      return;
    }

    let subtotal = 0;
    const itemsLines = cart.map(item => {
      const lineTotal = item.price * item.qty;
      subtotal += lineTotal;
      const refCode = item.ref || item.id;
      return `• ${item.qty}x ${item.name} [Ref: ${refCode}] (Talle: ${item.size}) — ${formatARS(lineTotal)}`;
    }).join('\n');

    const total = subtotal;

    const message = 
`*NUEVO PEDIDO BLACKHAZE* — #${currentOrderId}
──────────────────────────
*DATOS DEL COMPRADOR:*
• *Nombre:* ${name}
• *WhatsApp / Tel:* ${phone}
• *Email:* ${email}
• *CP / Localidad:* ${postal}
${notes ? `• *Aclaraciones:* ${notes}\n` : ''}
*DETALLE DE PRENDAS:*
${itemsLines}

*ENVÍO:* A todo el país (se coordina por este chat)
*TOTAL PRENDAS:* ${formatARS(total)} ARS
──────────────────────────
¡Hola! Acabo de hacer este pedido en la tienda web. ¿Cómo coordinamos el pago y el envío a mi localidad?`;

    const waUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;

    // Registrar en Firestore en segundo plano para que el admin lo visualice
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('blackhaze_store').doc('main_data').get().then(doc => {
          if (doc.exists) {
            const data = doc.data() || {};
            const sales = Array.isArray(data.sales) ? data.sales : [];
            sales.unshift({
              id: Date.now(),
              order_number: currentOrderId,
              date: new Date().toISOString(),
              customer_name: name,
              customer_phone: phone,
              customer_email: email,
              postal: postal,
              origin: 'TIENDA ONLINE',
              payment_method: 'WHATSAPP / A COORDINAR',
              status: 'PENDIENTE',
              subtotal: subtotal,
              shipping_cost: 0,
              shipping_method: 'A COORDINAR POR WHATSAPP (ENVÍOS A TODO EL PAÍS)',
              total: total,
              notes: notes || 'Pedido web con envío a coordinar por WhatsApp',
              items: cart.map(i => ({
                product_id: i.id,
                product_name: i.name,
                size: i.size,
                quantity: i.qty,
                price: i.price,
                total: i.price * i.qty
              }))
            });
            db.collection('blackhaze_store').doc('main_data').update({ sales });
          }
        }).catch(() => {});
      }
    } catch (e) {}

    // Abrir WhatsApp
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Limpiar carrito y cerrar modal
    cart = [];
    saveCart();
    closeCheckoutModal();
  }

  function setupEvents() {
    if (cartBtn) cartBtn.addEventListener('click', openCart);
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
    if (cartBackdrop) cartBackdrop.addEventListener('click', closeCart);

    if (checkoutBtn) checkoutBtn.addEventListener('click', openCheckoutModal);
    if (checkoutModalClose) checkoutModalClose.addEventListener('click', closeCheckoutModal);
    if (sendWhatsappOrderBtn) sendWhatsappOrderBtn.addEventListener('click', handleWhatsappCheckout);

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeCart();
        closeCheckoutModal();
        closeProductDetail();
      }
    });

    if (productDetailModal) {
      productDetailModal.addEventListener('click', function (e) {
        if (e.target === productDetailModal) closeProductDetail();
      });
    }
  }

  // INIT
  function startApp() {
    initCart();
    // Envios coordinados por WhatsApp
    initFirebaseStore();
    renderHomeDrop();
    renderProductsCatalog();
    setupFiltersAndSort();
    setupEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
})();


