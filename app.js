/* ==========================================================================
   BLACKOUT — MOTOR DE CATÁLOGO & DETALLE DE PRODUCTO
   - 8 productos con ficha técnica y 4 slots de imagen
   - Modal de detalle de producto interactivo
   - Filtros y Ordenamiento por separado con iconos
   - Redirección por categoría desde index.html
   ========================================================================== */

(function () {
  'use strict';

  // CATÁLOGO DE PRODUCTOS COMPLETO
  const PRODUCTS = [
    {
      id: 'BO-001',
      name: 'REMERA BOX HEAVYWEIGHT',
      price: 48000,
      type: 'remeras',
      typeName: 'Remeras',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['S', 'M', 'L', 'XL'],
      ref: 'REF. BO-001',
      desc: 'Remera de corte boxy rígido confeccionada en algodón peinado de 240 GSM. Caída estructurada, cuello cerrado de 3 cm y costuras reforzadas.',
      specs: [
        'Composición: 100% Algodón peinado de alto gramaje',
        'Gramaje: 240 GSM de alta densidad',
        'Corte: Boxy fit contemporáneo',
        'Origen: Fabricado en Argentina'
      ],
      views: ['FRENTE', 'ESPALDA', 'DETALLE CUELLO', 'ETIQUETA INTERNA']
    },
    {
      id: 'BO-002',
      name: 'BERMUDA TÁCTICA RIPSTOP',
      price: 62000,
      type: 'mallas',
      typeName: 'Mallas y Shorts',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['28', '30', '32', '34'],
      ref: 'REF. BO-002',
      desc: 'Bermuda y boardshort técnico en tejido ripstop hidrofóbico. Bolsillos con cierre termosellado y anilla táctica para accesorios.',
      specs: [
        'Tejido: Nylon ripstop ultraliviano antidesgarro',
        'Tratamiento: Repelente al agua y secado rápido',
        'Cierres: Herméticos con tirador de goma',
        'Ajuste: Cintura elastizada con cordón técnico'
      ],
      views: ['VISTA GENERAL', 'LATERAL BOLSILLO', 'DETALLE CIERRE', 'TEXTURA RIPSTOP']
    },
    {
      id: 'BO-003',
      name: 'MATE TÉRMICO INDUSTRIAL',
      price: 35000,
      type: 'mates',
      typeName: 'Mates',
      color: 'negro',
      colorName: 'Negro Mate',
      sizes: ['STD'],
      ref: 'REF. BO-003',
      desc: 'Mate térmico de acero inoxidable 304 con cámara de vacío de doble pared. Acabado en pintura en polvo negro mate y grabado láser de alta precisión.',
      specs: [
        'Material: Acero inoxidable quirúrgico 304',
        'Aislamiento: Vacío de doble pared térmico',
        'Capacidad: 240 ml estándar',
        'Terminación: Pintura electrostática microtexturada'
      ],
      views: ['PERSPECTIVA', 'VISTA SUPERIOR', 'GRABADO LÁSER', 'BASE DE APOYO']
    },
    {
      id: 'BO-004',
      name: 'ANTEOJOS ENVOLVENTES CYBER',
      price: 52000,
      type: 'lentes',
      typeName: 'Lentes',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['ÚNICO'],
      ref: 'REF. BO-004',
      desc: 'Montura anatómica envolvente con curvas aerodinámicas en acetato rígido de alta densidad. Lentes polarizadas UV400 oscurecidas al 90%.',
      specs: [
        'Protección: UV400 Categoría 3 (Bloqueo 100% UVA/UVB)',
        'Lentes: Policarbonato polarizado de alta resistencia',
        'Armazón: Acetato inyectado ultra resistente',
        'Incluye: Funda rígida de microfibra industrial'
      ],
      views: ['FRENTE', 'LATERAL PATILLAS', 'ÁNGULO SUPERIOR', 'DETALLE BISAGRA']
    },
    {
      id: 'BO-005',
      name: 'BUZO OVERSIZE HEAVYWEIGHT',
      price: 85000,
      type: 'buzos',
      typeName: 'Buzos',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['M', 'L', 'XL'],
      ref: 'REF. BO-005',
      desc: 'Hoodie estructurado sin cordones en frisa pesada de 450 GSM. Capucha forrada de doble paño y puños acanalados anchos.',
      specs: [
        'Tejido: Frisa invisible 450 GSM de máxima densidad',
        'Capucha: Doble capa sin cordones',
        'Hombros: Corte caído pronunciado',
        'Color: Negro absoluto teñido en reactivo'
      ],
      views: ['FRENTE', 'ESPALDA', 'DETALLE CAPUCHA', 'RIB PUÑO']
    },
    {
      id: 'BO-006',
      name: 'REMERA BOX BLANCA CRUDO',
      price: 48000,
      type: 'remeras',
      typeName: 'Remeras',
      color: 'blanco',
      colorName: 'Blanco Crudo',
      sizes: ['S', 'M', 'L', 'XL'],
      ref: 'REF. BO-006',
      desc: 'Edición especial de nuestra remera box en algodón crudo natural sin blanqueadores químicos agresivos. Textura orgánica y pesada.',
      specs: [
        'Algodón: 100% hilado crudo natural 240 GSM',
        'Corte: Boxy fit arquitectónico',
        'Terminación: Cuello cerrado de 3 cm reforzado',
        'Origen: Producción nacional artesanal'
      ],
      views: ['FRENTE', 'ESPALDA', 'DETALLE CUELLO', 'TEXTURA CRUDO']
    },
    {
      id: 'BO-007',
      name: 'GORRA TÁCTICA ESTRUCTURADA',
      price: 29000,
      type: 'gorras',
      typeName: 'Gorras',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['ÚNICO'],
      ref: 'REF. BO-007',
      desc: 'Gorra de 6 paneles en sarga de algodón pesado con visera semi-curva rígida y broche metálico regulable negro mate.',
      specs: [
        'Material: Sarga 100% algodón de alto gramaje',
        'Estructura: 6 paneles con refuerzo frontal',
        'Cierre: Broche de aleación metálica mate',
        'Detalle: Bordado tonal minimalista'
      ],
      views: ['FRENTE', 'LATERAL', 'REGULADOR TRASERO', 'INTERIOR']
    },
    {
      id: 'BO-008',
      name: 'PANTALÓN CARGO TÉCNICO',
      price: 78000,
      type: 'pantalones',
      typeName: 'Pantalones',
      color: 'negro',
      colorName: 'Negro',
      sizes: ['30', '32', '34'],
      ref: 'REF. BO-008',
      desc: 'Pantalón utilitario en ripstop con 6 bolsillos de carga volumétrica, botamangas regulables con tanca y rodillas preformadas.',
      specs: [
        'Material: Ripstop técnico reforzado',
        'Bolsillos: 2 laterales, 2 fuelle cargo, 2 traseros',
        'Ajuste: Tancas en tobillos para regular silueta',
        'Corte: Relaxed fit cónico'
      ],
      views: ['FRENTE', 'DETALLE BOLSILLOS', 'BOTAMANGA', 'ESPALDA']
    }
  ];

  // ESTADO
  let cart = [];
  const selectedSizes = {};
  PRODUCTS.forEach(p => {
    selectedSizes[p.id] = p.sizes[0];
  });

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
  const proceedMercadoPagoBtn = document.getElementById('proceedMercadoPagoBtn');

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

  // RENDER DROP ON HOME PAGE (4 NEW PRODUCTS)
  function renderHomeDrop() {
    if (!homeDropGrid) return;
    const dropItems = PRODUCTS.slice(0, 4);

    homeDropGrid.innerHTML = dropItems.map(p => {
      const activeSize = selectedSizes[p.id] || p.sizes[0];
      const sizeBtnsHtml = p.sizes.map(s => `
        <button class="size-btn ${s === activeSize ? 'active' : ''}" data-product="${p.id}" data-size="${s}">${s}</button>
      `).join('');

      return `
        <article class="product-card" data-id="${p.id}">
          <div class="product-media-wrap" onclick="window.openProductDetail('${p.id}')">
            <span class="product-tag-chip font-ui">${p.ref}</span>
            <div class="product-placeholder-box font-ui">
              <svg class="icon-svg" style="width:26px;height:26px;opacity:0.45;" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span style="font-size:0.7rem; font-weight:600; letter-spacing:0.04em;">Ver detalles</span>
            </div>
          </div>
          <div class="product-body">
            <div onclick="window.openProductDetail('${p.id}')">
              <div class="product-header-line">
                <h3 class="product-title">${p.name}</h3>
                <span class="product-price price-tag">${formatARS(p.price)}</span>
              </div>
              <p class="product-desc font-ui">${p.desc}</p>
            </div>

            <div>
              <div class="size-selector-wrap">
                <span class="size-selector-label font-ui">Talle:</span>
                <div class="size-options font-ui">
                  ${sizeBtnsHtml}
                </div>
              </div>

              <button class="add-bag-btn font-ui" onclick="event.stopPropagation(); window.addToCart('${p.id}')">
                <svg class="icon-svg" style="width:15px;height:15px;" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>AGREGAR AL CARRITO</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    bindSizeSelectors();
  }

  // RENDER CATALOG ON PRODUCTOS.HTML
  function renderProductsCatalog() {
    if (!productsCatalogGrid) return;

    let filtered = [...PRODUCTS];

    if (currentFilters.type !== 'all') {
      filtered = filtered.filter(p => p.type === currentFilters.type);
    }
    if (currentFilters.color !== 'all') {
      filtered = filtered.filter(p => p.color === currentFilters.color);
    }
    if (currentFilters.size !== 'all') {
      filtered = filtered.filter(p => p.sizes.includes(currentFilters.size));
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
      catalogCountBadge.textContent = `${filtered.length} piezas encontradas`;
    }

    if (filtered.length === 0) {
      productsCatalogGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 5rem 1rem; border: 1px dashed var(--border-line); border-radius: 8px; color: var(--text-dim);">
          <p class="font-ui" style="font-size: 1rem; margin-bottom: 0.5rem; color: var(--text-secondary);">No se encontraron piezas para los filtros seleccionados.</p>
          <button id="resetFiltersInline" class="btn-modern" style="margin-top: 1rem;">RESTABLECER FILTROS</button>
        </div>
      `;
      const inlineReset = document.getElementById('resetFiltersInline');
      if (inlineReset) inlineReset.addEventListener('click', resetAllFilters);
      return;
    }

    productsCatalogGrid.innerHTML = filtered.map(p => {
      const activeSize = selectedSizes[p.id] || p.sizes[0];
      const sizeBtnsHtml = p.sizes.map(s => `
        <button class="size-btn ${s === activeSize ? 'active' : ''}" data-product="${p.id}" data-size="${s}">${s}</button>
      `).join('');

      return `
        <article class="product-card" data-id="${p.id}">
          <div class="product-media-wrap" onclick="window.openProductDetail('${p.id}')">
            <span class="product-tag-chip font-ui">${p.ref}</span>
            <div class="product-placeholder-box font-ui">
              <svg class="icon-svg" style="width:28px;height:28px;opacity:0.45;" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span style="font-size:0.7rem; font-weight:600; letter-spacing:0.04em;">Ver ficha & 4 vistas</span>
            </div>
          </div>
          <div class="product-body">
            <div onclick="window.openProductDetail('${p.id}')">
              <div class="product-header-line">
                <h3 class="product-title">${p.name}</h3>
                <span class="product-price price-tag">${formatARS(p.price)}</span>
              </div>
              <p class="product-desc font-ui">${p.desc}</p>
            </div>

            <div>
              <div class="size-selector-wrap">
                <span class="size-selector-label font-ui">Talle:</span>
                <div class="size-options font-ui">
                  ${sizeBtnsHtml}
                </div>
              </div>

              <button class="add-bag-btn font-ui" onclick="event.stopPropagation(); window.addToCart('${p.id}')">
                <svg class="icon-svg" style="width:15px;height:15px;" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>AGREGAR AL CARRITO</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    bindSizeSelectors();
  }

  // PRODUCT DETAIL MODAL (3 A 4 IMÁGENES Y MÁS DETALLES)
  window.openProductDetail = function (productId) {
    const p = PRODUCTS.find(prod => prod.id === productId);
    if (!p || !productDetailModal || !productDetailBox) return;

    const activeSize = selectedSizes[p.id] || p.sizes[0];
    const sizeBtnsHtml = p.sizes.map(s => `
      <button class="size-btn ${s === activeSize ? 'active' : ''}" data-product="${p.id}" data-size="${s}">${s}</button>
    `).join('');

    const specsHtml = p.specs.map(spec => `
      <li style="margin-bottom: 0.5rem; color: #b3b3b3; font-size: 0.82rem; display:flex; align-items:center; gap:0.5rem;">
        <span style="width:4px; height:4px; border-radius:50%; background:#fff; display:inline-block;"></span>
        ${spec}
      </li>
    `).join('');

    const thumbsHtml = p.views.map((v, i) => `
      <div class="detail-thumb-box ${i === 0 ? 'active' : ''}" data-view="${v}">
        <span>${v}</span>
      </div>
    `).join('');

    productDetailBox.innerHTML = `
      <button id="productDetailCloseBtn" class="modal-close-corner" aria-label="Cerrar ventana">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="product-detail-gallery font-ui">
        <div class="detail-main-img-box" id="detailMainImageBox">
          <svg class="icon-svg" style="width:44px;height:44px;opacity:0.35;" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="3"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span id="detailMainViewTitle" style="font-size:0.85rem; font-weight:600; letter-spacing:0.06em; color:#ffffff;">${p.views[0]}</span>
          <span style="font-size:0.72rem; color:#777;">4 tomas de archivo fotográfico</span>
        </div>

        <div class="detail-thumbnails-row">
          ${thumbsHtml}
        </div>
      </div>

      <div class="product-detail-info font-ui">
        <div>
          <div style="font-size:0.72rem; color:#888; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:0.4rem; font-weight:600;">${p.ref} • ${p.typeName.toUpperCase()}</div>
          <h2 class="font-editorial" style="font-size: 1.85rem; font-weight: 700; line-height: 1.15; margin-bottom: 0.6rem;">${p.name}</h2>
          <div class="price-tag" style="font-size: 1.5rem; color: #ffffff; margin-bottom: 1.25rem;">${formatARS(p.price)} ARS</div>

          <p style="font-size: 0.85rem; color: #ccc; line-height: 1.6; margin-bottom: 1.5rem;">${p.desc}</p>

          <div style="margin-bottom: 1.5rem; border-top: 1px solid #222; padding-top: 1rem;">
            <span style="font-size:0.72rem; color:#888; text-transform:uppercase; display:block; margin-bottom:0.5rem; font-weight:600;">Ficha técnica de archivo:</span>
            <ul style="list-style: none; padding-left: 0;">
              ${specsHtml}
            </ul>
          </div>
        </div>

        <div>
          <div class="size-selector-wrap">
            <span class="size-selector-label">Seleccionar Talle:</span>
            <div class="size-options">
              ${sizeBtnsHtml}
            </div>
          </div>

          <button class="add-bag-btn font-ui" onclick="window.addToCart('${p.id}'); window.closeProductDetail();" style="padding: 16px; font-size: 0.85rem;">
            <svg class="icon-svg" style="width:18px;height:18px;" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>AGREGAR AL CARRITO</span>
          </button>
        </div>
      </div>
    `;

    // Bind thumbnails in modal
    document.querySelectorAll('.detail-thumb-box').forEach(t => {
      t.addEventListener('click', function () {
        document.querySelectorAll('.detail-thumb-box').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const viewText = this.getAttribute('data-view');
        const mainTitle = document.getElementById('detailMainViewTitle');
        if (mainTitle) mainTitle.textContent = viewText;
      });
    });

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
        const prodId = this.getAttribute('data-product');
        const size = this.getAttribute('data-size');
        if (!prodId || !size) return;

        selectedSizes[prodId] = size;

        const parent = this.closest('.size-options');
        if (parent) {
          parent.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
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
      const stored = localStorage.getItem('blackout_cart_v3');
      if (stored) cart = JSON.parse(stored);
    } catch (e) {
      cart = [];
    }
    renderCart();
  }

  function saveCart() {
    try {
      localStorage.setItem('blackout_cart_v3', JSON.stringify(cart));
    } catch (e) {}
    renderCart();
  }

  function renderCart() {
    const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
    if (cartCountEl) cartCountEl.textContent = totalItems;

    if (!cartItemsList) return;

    if (cart.length === 0) {
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
          <div style="width:72px; height:72px; background:#0a0a0a; border:1px solid #222; display:flex; align-items:center; justify-content:center; color:#555;">
            <svg class="icon-svg" style="width:20px;height:20px;" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18"></rect>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="cart-item-info">
            <div>
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-meta font-ui" style="margin-top:2px;">${item.ref} // TALLE: ${item.size}</div>
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
  }

  window.addToCart = function (productId) {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod) return;

    const size = selectedSizes[productId] || prod.sizes[0];
    const existingIndex = cart.findIndex(item => item.id === productId && item.size === size);

    if (existingIndex > -1) {
      cart[existingIndex].qty += 1;
    } else {
      cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        ref: prod.ref,
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
        if (cart[idx]) {
          cart[idx].qty += 1;
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

  function openCheckoutModal() {
    if (cart.length === 0) return;
    closeCart();

    let total = 0;
    if (checkoutSummaryList) {
      checkoutSummaryList.innerHTML = cart.map(item => {
        const lineTotal = item.price * item.qty;
        total += lineTotal;
        return `
          <div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid #1f1f1f; font-size: 0.82rem;">
            <span>${item.qty}x ${item.name} (${item.size})</span>
            <span class="price-tag">${formatARS(lineTotal)} ARS</span>
          </div>
        `;
      }).join('');
    }

    if (checkoutModalTotal) {
      checkoutModalTotal.textContent = formatARS(total) + ' ARS';
    }

    if (checkoutModal) checkoutModal.classList.add('open');
  }

  function closeCheckoutModal() {
    if (checkoutModal) checkoutModal.classList.remove('open');
  }

  function setupEvents() {
    if (cartBtn) cartBtn.addEventListener('click', openCart);
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
    if (cartBackdrop) cartBackdrop.addEventListener('click', closeCart);

    if (checkoutBtn) checkoutBtn.addEventListener('click', openCheckoutModal);
    if (checkoutModalClose) checkoutModalClose.addEventListener('click', closeCheckoutModal);

    if (proceedMercadoPagoBtn) {
      proceedMercadoPagoBtn.addEventListener('click', function () {
        this.innerHTML = '<span>REDIRECCIONANDO A MERCADO PAGO...</span>';
        setTimeout(() => {
          alert('BLACKOUT ARCHIVE: En la versión de producción conectará con la API de Mercado Pago Preference ID. Simulacro de compra exitoso.');
          this.innerHTML = '<span>PAGAR CON MERCADO PAGO</span>';
          closeCheckoutModal();
        }, 900);
      });
    }

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
  document.addEventListener('DOMContentLoaded', () => {
    initCart();
    renderHomeDrop();
    renderProductsCatalog();
    setupFiltersAndSort();
    setupEvents();
  });
})();


