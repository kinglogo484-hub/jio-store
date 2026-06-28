// ===== STATE =====
function imgUrl(src) { if (!src) return ''; if (src.startsWith('s3:') || src.startsWith('/uploads/')) return '/api/image/' + encodeURIComponent(src.replace('/uploads/', '')); return src; }
let products = [];
let cart = JSON.parse(localStorage.getItem('jio_cart')) || [];
let settings = {};
let payments = [];
let shippingFee = 50;
let shippingRates = [];
let selectedOptions = {}; // { productId: { size, color } }

// ===== DOM REFS =====
const productGrid = document.getElementById('productGrid');
const cartSidebar = document.getElementById('cartSidebar');
const cartOverlay = document.getElementById('cartOverlay');
const cartItems = document.getElementById('cartItems');
const cartFooter = document.getElementById('cartFooter');
const cartCount = document.getElementById('cartCount');
const cartTotal = document.getElementById('cartTotal');
const checkoutModal = document.getElementById('checkoutModal');
const successModal = document.getElementById('successModal');
const paymentSelect = document.getElementById('paymentMethod');
const orderSummary = document.getElementById('orderSummary');
const detailModal = document.getElementById('productDetailModal');
const detailContent = document.getElementById('detailContent');
let detailQty = 1;
let detailProduct = null;

// ===== API =====
const API = {
  async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};

// ===== INIT =====
async function init() {
  await loadSettings();
  await loadProducts();
  await loadShippingRates();
  renderProducts();
  renderCart();
  setupEventListeners();
}

async function loadSettings() {
  try {
    settings = await API.get('/api/settings');
    shippingFee = parseFloat(settings.shipping_fee) || 50;
    document.getElementById('storeName').textContent = settings.store_name || 'JIO';
  } catch (e) {
    console.warn('Could not load settings, using defaults');
  }
}

async function loadProducts() {
  try {
    products = await API.get('/api/products');
  } catch (e) {
    console.warn('Could not load products');
  }
}

async function loadShippingRates() {
  try {
    shippingRates = await API.get('/api/shipping-rates');
    renderGovernorates();
  } catch (e) {
    console.warn('Could not load shipping rates');
  }
}

function renderGovernorates() {
  const sel = document.getElementById('custGovernorate');
  sel.innerHTML = '<option value="">Select governorate</option>' +
    shippingRates.map(r => `<option value="${r.governorate}" data-fee="${r.fee}">${r.governorate} — EGP ${Number(r.fee).toFixed(2)}</option>`).join('');
}

async function loadPayments() {
  try {
    payments = await API.get('/api/payments');
    renderPaymentMethods();
  } catch (e) {
    console.warn('Could not load payments');
  }
}

// ===== PRODUCTS =====
function renderProducts(filter = 'all') {
  const filtered = filter === 'all' ? products : products.filter(p => p.category === filter);
  productGrid.innerHTML = filtered.map(p => {
    const sizes = p.sizes ? p.sizes.split(',').map(s => s.trim()).filter(Boolean) : [];
    const colors = p.colors ? p.colors.split(',').map(c => c.trim()).filter(Boolean) : [];
    const sel = selectedOptions[p.id] || {};
    return `
    <div class="product-card" data-id="${p.id}">
      <div class="product-img" data-initial="${p.name[0]}">
        ${p.image ? `<img src="${imgUrl(p.image)}" alt="${p.name}" loading="lazy">` : ''}
        <span class="product-category">${p.category}</span>
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <p class="desc">${p.description || ''}</p>
        ${sizes.length ? `<div class="opt-group"><span class="opt-label">Size</span><div class="opt-options">${sizes.map(s => `<button class="opt-btn ${sel.size === s ? 'selected' : ''}" data-pid="${p.id}" data-type="size" data-val="${s}" translate="no">${s}</button>`).join('')}</div></div>` : ''}
        ${colors.length ? `<div class="opt-group"><span class="opt-label">Color</span><div class="opt-options">${colors.map(c => `<button class="opt-btn ${sel.color === c ? 'selected' : ''}" data-pid="${p.id}" data-type="color" data-val="${c}" translate="no">${c}</button>`).join('')}</div></div>` : ''}
        <div class="price">${p.old_price ? `<span class="old-price">EGP ${Number(p.old_price).toFixed(2)}</span> ` : ''}EGP ${Number(p.price).toFixed(2)}</div>
        ${p.size_chart ? `<div class="size-chart-inline"><table><thead><tr><th translate="no">Size</th><th>Length</th><th>Width</th></tr></thead><tbody>${p.size_chart.split('|').filter(Boolean).map(r => { const [s,l,w] = r.split(',').map(x => x.trim()); return `<tr><td translate="no">${s}</td><td>${l}</td><td>${w}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
        <button class="add-to-cart" data-id="${p.id}">Add to Cart</button>
      </div>
    </div>`}).join('');
}

// ===== CART =====
function renderCart() {
  const isEmpty = cart.length === 0;
  cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);

  if (isEmpty) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
    cartFooter.style.display = 'none';
    return;
  }

  cartFooter.style.display = 'block';
  cartItems.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-img">${item.name[0]}</div>
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="item-price">EGP ${Number(item.price).toFixed(2)}</div>
        ${item.selectedSize || item.selectedColor ? `<div style="font-size:11px;color:rgba(61,43,31,0.4);margin-bottom:4px" translate="no">${item.selectedSize ? item.selectedSize : ''}${item.selectedSize && item.selectedColor ? ' / ' : ''}${item.selectedColor ? item.selectedColor : ''}</div>` : ''}
        <div class="cart-item-actions">
          <button class="qty-btn" data-index="${idx}" data-action="dec">-</button>
          <span class="item-qty">${item.qty}</span>
          <button class="qty-btn" data-index="${idx}" data-action="inc">+</button>
          <button class="remove-item" data-index="${idx}">&times;</button>
        </div>
      </div>
    </div>
  `).join('');

  updateCartTotal();
  saveCart();
}

function updateCartTotal() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartTotal.textContent = `EGP ${(subtotal + shippingFee).toFixed(2)}`;
}

function addToCart(product) {
  const opts = selectedOptions[product.id] || {};
  const size = opts.size || '';
  const color = opts.color || '';
  const existing = cart.find(i => i.id === product.id && i.selectedSize === size && i.selectedColor === color);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1, selectedSize: size, selectedColor: color });
  }
  renderCart();
  openCart();
}

function saveCart() {
  localStorage.setItem('jio_cart', JSON.stringify(cart));
}

function openCart() {
  cartSidebar.classList.add('open');
  cartOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  cartSidebar.classList.remove('open');
  cartOverlay.classList.remove('show');
  document.body.style.overflow = '';
}

// ===== CHECKOUT =====
function openCheckout() {
  if (cart.length === 0) return;
  closeCart();
  loadPayments();
  renderOrderSummary();
  checkoutModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function renderPaymentMethods() {
  paymentSelect.innerHTML = payments
    .filter(p => p.is_active)
    .map(p => {
      const display = p.method === 'Cash on Delivery' ? p.method : `${p.method} (${p.number})`;
      return `<option value="${p.method}">${display}</option>`;
    })
    .join('');
}

function renderOrderSummary() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  orderSummary.innerHTML = `
    ${cart.map(i => `<div class="summary-line"><span translate="no">${i.name}${i.selectedSize ? ' (' + i.selectedSize : ''}${i.selectedColor ? (i.selectedSize ? ', ' : ' (') + i.selectedColor : ''}${i.selectedSize || i.selectedColor ? ')' : ''} x${i.qty}</span><span>EGP ${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
    <div class="summary-line"><span>Shipping</span><span>EGP ${shippingFee.toFixed(2)}</span></div>
    <div class="summary-total"><span>Total</span><span>EGP ${(subtotal + shippingFee).toFixed(2)}</span></div>
  `;
}

async function placeOrder(data) {
  try {
    const order = await API.post('/api/orders', data);
    cart = [];
    saveCart();
    renderCart();
    checkoutModal.classList.remove('show');
    successModal.classList.add('show');
  } catch (e) {
    alert(e.message || 'Failed to place order. Please try again.');
  }
}

// ===== EVENTS =====
function setupEventListeners() {
  // Nav scroll
  const nav = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  });

  // Mobile menu
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('active');
  });
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('active');
    });
  });

  // Product filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.filter-btn.active').classList.remove('active');
      btn.classList.add('active');
      renderProducts(btn.dataset.filter);
    });
  });

  // Unified click handler for grid
  productGrid.addEventListener('click', e => {
    const addBtn = e.target.closest('.add-to-cart');
    const optBtn = e.target.closest('.opt-btn');
    const card = e.target.closest('.product-card');
    if (addBtn) {
      const id = parseInt(addBtn.dataset.id);
      const product = products.find(p => p.id === id);
      if (!product) return;
      const sizes = product.sizes ? product.sizes.split(',').map(s => s.trim()).filter(Boolean) : [];
      const colors = product.colors ? product.colors.split(',').map(c => c.trim()).filter(Boolean) : [];
      const opts = selectedOptions[product.id] || {};
      if (sizes.length && !opts.size) { alert('Please select a size'); return; }
      if (colors.length && !opts.color) { alert('Please select a color'); return; }
      addToCart(product);
    } else if (optBtn) {
      const pid = parseInt(optBtn.dataset.pid);
      const type = optBtn.dataset.type;
      const val = optBtn.dataset.val;
      if (!selectedOptions[pid]) selectedOptions[pid] = {};
      selectedOptions[pid][type] = selectedOptions[pid][type] === val ? '' : val;
      renderProducts(document.querySelector('.filter-btn.active')?.dataset?.filter || 'all');
    } else if (card) {
      const id = parseInt(card.dataset.id);
      const product = products.find(p => p.id === id);
      if (product) openProductDetail(product);
    }
  });

  // Detail modal - close
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  detailModal.addEventListener('click', e => { if (e.target === detailModal) closeDetail(); });

  // Cart sidebar handlers
  document.getElementById('cartBtn').addEventListener('click', e => {
    e.preventDefault();
    openCart();
  });
  document.getElementById('cartClose').addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);

  // Cart item actions (delegated)
  cartItems.addEventListener('click', e => {
    const target = e.target;
    const index = parseInt(target.dataset.index);

    if (target.classList.contains('qty-btn')) {
      const action = target.dataset.action;
      if (action === 'inc') cart[index].qty++;
      else if (action === 'dec' && cart[index].qty > 1) cart[index].qty--;
      else return;
      renderCart();
    }

    if (target.classList.contains('remove-item')) {
      cart.splice(index, 1);
      renderCart();
    }
  });

  // Governorate change → update shipping
  document.getElementById('custGovernorate').addEventListener('change', () => {
    const sel = document.getElementById('custGovernorate');
    const opt = sel.options[sel.selectedIndex];
    shippingFee = opt ? parseFloat(opt.dataset.fee) || 0 : 0;
    renderOrderSummary();
  });

  // Checkout
  document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
  document.getElementById('modalClose').addEventListener('click', () => {
    checkoutModal.classList.remove('show');
    document.body.style.overflow = '';
  });

  // Checkout form
  document.getElementById('checkoutForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const gov = document.getElementById('custGovernorate').value;
    const address = document.getElementById('custAddress').value.trim();
    const payment = document.getElementById('paymentMethod').value;
    const notes = document.getElementById('orderNotes').value.trim();
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

    if (!name || !phone) {
      alert('Please enter your name and phone number');
      return;
    }
    if (!gov) {
      alert('Please select your governorate');
      return;
    }

    placeOrder({
      customer_name: name,
      customer_phone: phone,
      customer_address: gov + ' - ' + address,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, size: i.selectedSize || '', color: i.selectedColor || '' })),
      total: subtotal + shippingFee,
      shipping_fee: shippingFee,
      payment_method: payment,
      notes
    });
  });

  // Success modal
  document.getElementById('successClose').addEventListener('click', () => {
    successModal.classList.remove('show');
    document.body.style.overflow = '';
  });

  // Subscribe
  document.getElementById('subscribeForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    alert(`Thanks for subscribing, ${input.value}!`);
    input.value = '';
  });

  // Reveal animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.product-card, .about-text, .banner-content').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(40px)';
    el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    observer.observe(el);
  });
}

// ===== PRODUCT DETAIL MODAL =====
function openProductDetail(product) {
  detailProduct = product;
  detailQty = 1;
  const sizes = product.sizes ? product.sizes.split(',').map(s => s.trim()).filter(Boolean) : [];
  const colors = product.colors ? product.colors.split(',').map(c => c.trim()).filter(Boolean) : [];
  detailContent.innerHTML = `
    <div class="detail-image">${product.image ? `<img src="${imgUrl(product.image)}" alt="${product.name}">` : product.name[0]}</div>
    <div class="detail-info">
      <span class="detail-category">${product.category}</span>
      <h2>${product.name}</h2>
      <p class="detail-desc">${product.description || ''}</p>
      <div class="detail-price">${product.old_price ? `<span class="old-price">EGP ${Number(product.old_price).toFixed(2)}</span> ` : ''}EGP ${Number(product.price).toFixed(2)}${product.old_price ? ` <span class="discount-badge">-${Math.round((1 - product.price / product.old_price) * 100)}%</span>` : ''}</div>
      ${product.size_chart ? `<div class="size-chart-inline"><table><thead><tr><th translate="no">Size</th><th>Length</th><th>Width</th></tr></thead><tbody>${product.size_chart.split('|').filter(Boolean).map(r => { const [s,l,w] = r.split(',').map(x => x.trim()); return `<tr><td translate="no">${s}</td><td>${l}</td><td>${w}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <div class="detail-options">
        ${sizes.length ? `<div class="opt-group"><span class="opt-label">Size</span><div class="opt-options">${sizes.map((s,i) => `<button class="opt-btn${i===0?' selected':''}" data-type="size" data-val="${s}" translate="no">${s}</button>`).join('')}</div></div>` : ''}
        ${colors.length ? `<div class="opt-group" style="margin-top:12px"><span class="opt-label">Color</span><div class="opt-options">${colors.map((c,i) => `<button class="opt-btn${i===0?' selected':''}" data-type="color" data-val="${c}" translate="no">${c}</button>`).join('')}</div></div>` : ''}
        <div class="detail-qty">
          <label>Quantity</label>
          <div class="detail-qty-selector">
            <button id="detailQtyDec">-</button>
            <span id="detailQtyDisplay">1</span>
            <button id="detailQtyInc">+</button>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn" id="detailAddCart">Add to Cart</button>
        <button class="btn btn-primary" id="detailBuyNow">Buy Now</button>
      </div>
    </div>
  `;
  detailModal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Size/Color toggle inside detail
  detailContent.querySelectorAll('.opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      detailContent.querySelectorAll(`.opt-btn[data-type="${type}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Qty
  document.getElementById('detailQtyDec').addEventListener('click', () => {
    if (detailQty > 1) { detailQty--; document.getElementById('detailQtyDisplay').textContent = detailQty; }
  });
  document.getElementById('detailQtyInc').addEventListener('click', () => {
    detailQty++; document.getElementById('detailQtyDisplay').textContent = detailQty;
  });

  // Add to cart from detail
  document.getElementById('detailAddCart').addEventListener('click', () => {
    const size = detailContent.querySelector('.opt-btn[data-type="size"].selected')?.dataset?.val || '';
    const color = detailContent.querySelector('.opt-btn[data-type="color"].selected')?.dataset?.val || '';
    for (let i = 0; i < detailQty; i++) {
      const existing = cart.find(c => c.id === product.id && c.selectedSize === size && c.selectedColor === color);
      if (existing) existing.qty++;
      else cart.push({ ...product, qty: 1, selectedSize: size, selectedColor: color });
    }
    saveCart();
    renderCart();
    closeDetail();
    openCart();
  });

  // Buy now from detail
  document.getElementById('detailBuyNow').addEventListener('click', () => {
    const size = detailContent.querySelector('.opt-btn[data-type="size"].selected')?.dataset?.val || '';
    const color = detailContent.querySelector('.opt-btn[data-type="color"].selected')?.dataset?.val || '';
    for (let i = 0; i < detailQty; i++) {
      const existing = cart.find(c => c.id === product.id && c.selectedSize === size && c.selectedColor === color);
      if (existing) existing.qty++;
      else cart.push({ ...product, qty: 1, selectedSize: size, selectedColor: color });
    }
    saveCart();
    renderCart();
    closeDetail();
    openCheckout();
  });
}

function openSizeChart(name, data) {
  document.getElementById('sizeChartTitle').textContent = name + ' - Size Chart';
  const tbody = document.getElementById('sizeChartBody');
  const rows = data.split('|').filter(Boolean);
  tbody.innerHTML = rows.map(r => {
    const [size, length, width] = r.split(',').map(s => s.trim());
    return `<tr><td style="padding:10px 12px;border-bottom:1px solid #e0d5c5;font-weight:600" translate="no">${size}</td><td style="padding:10px 12px;border-bottom:1px solid #e0d5c5">${length}</td><td style="padding:10px 12px;border-bottom:1px solid #e0d5c5">${width}</td></tr>`;
  }).join('');
  document.getElementById('sizeChartModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  detailModal.classList.remove('show');
  document.body.style.overflow = '';
  detailProduct = null;
}

// ===== START =====
init();
