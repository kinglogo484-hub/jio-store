// ===== STATE =====
let isLoggedIn = false;
let currentTab = 'dashboard';

// ===== DOM =====
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const pageTitle = document.getElementById('pageTitle');
const topbarDate = document.getElementById('topbarDate');

// ===== API =====
const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

// ===== AUTH =====
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  try {
    const res = await API.post('/api/login', {
      username: document.getElementById('loginUser').value,
      password: document.getElementById('loginPass').value
    });
    if (res.success) {
      isLoggedIn = true;
      loginScreen.style.display = 'none';
      adminApp.style.display = 'flex';
      initAdmin();
    }
  } catch (err) {
    loginError.textContent = 'Invalid username or password';
  }
});

logoutBtn.addEventListener('click', () => {
  isLoggedIn = false;
  adminApp.style.display = 'none';
  loginScreen.style.display = 'flex';
  loginForm.reset();
});

// ===== MENU TOGGLE =====
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// ===== INIT =====
async function initAdmin() {
  topbarDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  setupNavigation();
  await loadDashboard();
}

// ===== NAVIGATION =====
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const tab = item.dataset.tab;
      switchTab(tab);
      if (window.innerWidth <= 768) sidebar.classList.remove('open');
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  pageTitle.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);

  switch (tab) {
    case 'dashboard': loadDashboard(); break;
    case 'products': loadProducts(); break;
    case 'orders': loadOrders(); break;
    case 'payments': loadPayments(); break;
    case 'shipping': loadShippingRates(); break;
    case 'settings': loadSettings(); break;
  }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const stats = await API.get('/api/stats');
    document.getElementById('statOrders').textContent = stats.totalOrders;
    document.getElementById('statPending').textContent = stats.pendingOrders;
    document.getElementById('statCompleted').textContent = stats.completedOrders;
    document.getElementById('statRevenue').textContent = `EGP ${Number(stats.totalRevenue).toFixed(2)}`;
    document.getElementById('statProducts').textContent = stats.totalProducts;
    document.getElementById('statCustomers').textContent = stats.totalCustomers;

    const orders = await API.get('/api/orders');
    const tbody = document.querySelector('#recentOrdersTable tbody');
    tbody.innerHTML = orders.slice(0, 10).map(o => `
      <tr>
        <td>#${o.id}</td>
        <td>${o.customer_name}</td>
        <td>EGP ${Number(o.total).toFixed(2)}</td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

// ===== PRODUCTS =====
async function loadProducts() {
  try {
    const products = await API.get('/api/products');
    const tbody = document.querySelector('#productsTable tbody');
    tbody.innerHTML = products.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td><strong>${p.name}</strong>${p.image ? `<br><span style="font-size:10px;color:rgba(61,43,31,0.3)">img</span>` : ''}</td>
        <td>${p.category}</td>
        <td>EGP ${Number(p.price).toFixed(2)}</td>
        <td>
          <button class="action-btn" onclick="editProduct(${p.id})">Edit</button>
          <button class="action-btn danger" onclick="deleteProduct(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

// Product Modal
const productModal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');
const productModalTitle = document.getElementById('productModalTitle');
const productModalClose = document.getElementById('productModalClose');

document.getElementById('addProductBtn').addEventListener('click', () => {
  productForm.reset();
  document.getElementById('productId').value = '';
  document.getElementById('currentImage').textContent = '';
  productModalTitle.textContent = 'Add Product';
  // Remove custom tags
  document.querySelectorAll('#sizeSelector .tag-option').forEach(el => {
    if (!['S','M','L','XL','2XL','3XL','One Size'].includes(el.querySelector('input')?.value || '')) el.remove();
  });
  document.querySelectorAll('#colorSelector .tag-option').forEach(el => {
    if (!['Black','White','Grey','Navy','Red','Blue','Green','Beige','Cream','Brown','Olive','Khaki','Pink','Purple','Orange','Yellow'].includes(el.querySelector('input')?.value || '')) el.remove();
  });
  productModal.classList.add('show');
});

productModalClose.addEventListener('click', () => productModal.classList.remove('show'));
productModal.addEventListener('click', e => { if (e.target === productModal) productModal.classList.remove('show'); });

productForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const fd = new FormData();
  fd.append('name', document.getElementById('prodName').value);
  fd.append('description', document.getElementById('prodDesc').value);
  fd.append('price', document.getElementById('prodPrice').value);
  fd.append('category', document.getElementById('prodCategory').value);
  const sizes = [...document.querySelectorAll('#sizeSelector input:checked')].map(c => c.value).join(', ');
  const colors = [...document.querySelectorAll('#colorSelector input:checked')].map(c => c.value).join(', ');
  fd.append('sizes', sizes);
  fd.append('colors', colors);
  const fileInput = document.getElementById('prodImage');
  if (fileInput.files.length > 0) {
    fd.append('image', fileInput.files[0]);
  } else if (id) {
    fd.append('keepImage', 'true');
  }
  try {
    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, body: fd });
    if (!r.ok) throw new Error(await r.text());
    productModal.classList.remove('show');
    loadProducts();
  } catch (e) { alert('Error saving product'); }
});

window.editProduct = async function(id) {
  try {
    const p = await API.get(`/api/products/${id}`);
    document.getElementById('productId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodDesc').value = p.description;
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodCategory').value = p.category;
    // Check the correct sizes/colors
    const sizeVals = (p.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
    const sizeInputs = document.querySelectorAll('#sizeSelector input');
    sizeInputs.forEach(c => c.checked = sizeVals.includes(c.value));
    sizeVals.forEach(v => {
      if (![...sizeInputs].some(c => c.value === v)) {
        const label = document.createElement('label');
        label.className = 'tag-option';
        label.setAttribute('translate', 'no');
        label.innerHTML = `<input type="checkbox" value="${v.replace(/"/g, '&quot;')}" checked> ${v} <span onclick="this.parentElement.remove()" style="margin-left:4px;cursor:pointer;opacity:0.4">&times;</span>`;
        document.getElementById('sizeSelector').appendChild(label);
      }
    });
    const colorVals = (p.colors || '').split(',').map(c => c.trim()).filter(Boolean);
    const colorInputs = document.querySelectorAll('#colorSelector input');
    colorInputs.forEach(c => c.checked = colorVals.includes(c.value));
    colorVals.forEach(v => {
      if (![...colorInputs].some(c => c.value === v)) {
        const label = document.createElement('label');
        label.className = 'tag-option';
        label.setAttribute('translate', 'no');
        label.innerHTML = `<input type="checkbox" value="${v.replace(/"/g, '&quot;')}" checked> ${v} <span onclick="this.parentElement.remove()" style="margin-left:4px;cursor:pointer;opacity:0.4">&times;</span>`;
        document.getElementById('colorSelector').appendChild(label);
      }
    });
    document.getElementById('prodImage').value = '';
    document.getElementById('currentImage').innerHTML = p.image ? `Current: <a href="${p.image}" target="_blank" style="color:#6b4423">${p.image}</a>` : 'No image';
    productModalTitle.textContent = 'Edit Product';
    productModal.classList.add('show');
  } catch (e) { alert('Error loading product'); }
};

window.deleteProduct = async function(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await API.del(`/api/products/${id}`);
    loadProducts();
  } catch (e) { alert('Error deleting product'); }
};

// ===== ORDERS =====
let allOrders = [];

async function loadOrders(filter = 'all') {
  try {
    const url = filter === 'all' ? '/api/orders' : `/api/orders?status=${filter}`;
    allOrders = await API.get(url);
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = allOrders.map(o => {
      const addrParts = o.customer_address ? o.customer_address.split(' - ') : [];
      const governorate = addrParts.length > 1 ? addrParts[0] : '';
      const address = addrParts.length > 1 ? addrParts.slice(1).join(' - ') : (o.customer_address || '');
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
      const itemsSummary = items.map(i => `${i.name}${i.size ? ' ('+i.size+')' : ''}${i.color ? ' - '+i.color : ''} x${i.qty}`).join(', ');
      return `
      <tr>
        <td>#${o.id}</td>
        <td><strong>${o.customer_name}</strong></td>
        <td>${o.customer_phone}</td>
        <td>${governorate || '-'}</td>
        <td>${address || '-'}</td>
        <td style="max-width:200px;white-space:normal;word-break:break-word" translate="no">${itemsSummary || '-'}</td>
        <td>EGP ${Number(o.total).toFixed(2)}</td>
        <td>${o.payment_method || '-'}</td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
        <td>
          <button class="action-btn" onclick="viewOrder(${o.id})">View</button>
          ${o.status === 'pending' ? `<button class="action-btn" onclick="completeOrder(${o.id})">Complete</button>` : ''}
          ${o.status !== 'cancelled' ? `<button class="action-btn danger" onclick="cancelOrder(${o.id})">Cancel</button>` : ''}
          <button class="action-btn danger" onclick="deleteOrder(${o.id})">Delete</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { console.error(e); }
}

document.querySelectorAll('.order-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.order-filters .filter-btn.active').classList.remove('active');
    btn.classList.add('active');
    loadOrders(btn.dataset.status);
  });
});

window.viewOrder = async function(id) {
  try {
    const o = await API.get(`/api/orders/${id}`);
    const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
    const modal = document.getElementById('orderModal');
    const addrParts = o.customer_address ? o.customer_address.split(' - ') : [];
    const governorate = addrParts.length > 1 ? addrParts[0] : '';
    const address = addrParts.length > 1 ? addrParts.slice(1).join(' - ') : (o.customer_address || '');
    document.getElementById('orderDetail').innerHTML = `
      <div class="order-detail-section">
        <div class="label">Order ID</div>
        <div class="value">#${o.id}</div>
      </div>
      <div class="order-detail-section">
        <div class="label">Customer</div>
        <div class="value">${o.customer_name}</div>
      </div>
      <div class="order-detail-section">
        <div class="label">Phone</div>
        <div class="value">${o.customer_phone}</div>
      </div>
      ${governorate ? `<div class="order-detail-section"><div class="label">Governorate</div><div class="value">${governorate}</div></div>` : ''}
      ${address ? `<div class="order-detail-section"><div class="label">Address</div><div class="value">${address}</div></div>` : ''}
      <div class="order-detail-section">
        <div class="label">Payment Method</div>
        <div class="value">${o.payment_method || '-'}</div>
      </div>
      <div class="order-detail-section">
        <div class="label">Status</div>
        <div class="value"><span class="status-badge status-${o.status}">${o.status}</span></div>
      </div>
      <div class="order-detail-section">
        <div class="label">Items</div>
        <table class="order-items-table">
          <thead><tr><th>Item</th><th>Size</th><th>Color</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${items.map(i => `<tr><td>${i.name}</td><td>${i.size || '-'}</td><td>${i.color || '-'}</td><td>${i.qty}</td><td>EGP ${Number(i.price).toFixed(2)}</td><td>EGP ${(i.price * i.qty).toFixed(2)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="order-detail-section">
        <div class="label">Shipping</div>
        <div class="value">EGP ${Number(o.shipping_fee).toFixed(2)}</div>
      </div>
      <div class="order-detail-section">
        <div class="label" style="font-size:14px;font-weight:700;color:#3d2b1f">Total</div>
        <div class="value" style="font-size:20px;font-weight:800">EGP ${Number(o.total).toFixed(2)}</div>
      </div>
      ${o.notes ? `<div class="order-detail-section"><div class="label">Notes</div><div class="value">${o.notes}</div></div>` : ''}
      <div class="order-detail-section">
        <div class="label">Date</div>
        <div class="value">${new Date(o.created_at).toLocaleString()}</div>
      </div>
    `;
    modal.classList.add('show');
  } catch (e) { alert('Error loading order'); }
};

document.getElementById('orderModalClose').addEventListener('click', () => {
  document.getElementById('orderModal').classList.remove('show');
});
document.getElementById('orderModal').addEventListener('click', e => {
  if (e.target === document.getElementById('orderModal')) {
    document.getElementById('orderModal').classList.remove('show');
  }
});

window.completeOrder = async function(id) {
  if (!confirm('Mark this order as completed?')) return;
  try {
    await API.put(`/api/orders/${id}`, { status: 'completed' });
    loadOrders(document.querySelector('.order-filters .filter-btn.active')?.dataset?.status || 'all');
    loadDashboard();
  } catch (e) { alert('Error updating order'); }
};

window.cancelOrder = async function(id) {
  if (!confirm('Cancel this order?')) return;
  try {
    await API.put(`/api/orders/${id}`, { status: 'cancelled' });
    loadOrders(document.querySelector('.order-filters .filter-btn.active')?.dataset?.status || 'all');
    loadDashboard();
  } catch (e) { alert('Error updating order'); }
};

window.deleteOrder = async function(id) {
  if (!confirm('Delete this order permanently?')) return;
  try {
    await API.del(`/api/orders/${id}`);
    loadOrders(document.querySelector('.order-filters .filter-btn.active')?.dataset?.status || 'all');
    loadDashboard();
  } catch (e) { alert('Error deleting order'); }
};

// ===== PAYMENTS =====
async function loadPayments() {
  try {
    const payments = await API.get('/api/payments');
    const tbody = document.querySelector('#paymentsTable tbody');
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td><strong>${p.method}</strong></td>
        <td>${p.number}</td>
        <td>${p.holder_name || '-'}</td>
        <td>${p.is_active ? 'Yes' : 'No'}</td>
        <td>
          <button class="action-btn" onclick="editPayment(${p.id})">Edit</button>
          <button class="action-btn" onclick="togglePayment(${p.id}, ${p.is_active})">${p.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="action-btn danger" onclick="deletePayment(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

const paymentModal = document.getElementById('paymentModal');
const paymentForm = document.getElementById('paymentForm');
const paymentModalTitle = document.getElementById('paymentModalTitle');
const paymentModalClose = document.getElementById('paymentModalClose');

document.getElementById('addPaymentBtn').addEventListener('click', () => {
  paymentForm.reset();
  document.getElementById('paymentId').value = '';
  paymentModalTitle.textContent = 'Add Payment Method';
  paymentModal.classList.add('show');
});

paymentModalClose.addEventListener('click', () => paymentModal.classList.remove('show'));
paymentModal.addEventListener('click', e => { if (e.target === paymentModal) paymentModal.classList.remove('show'); });

paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('paymentId').value;
  const data = {
    method: document.getElementById('payMethod').value,
    number: document.getElementById('payNumber').value,
    holder_name: document.getElementById('payHolder').value
  };
  try {
    if (id) {
      await API.put(`/api/payments/${id}`, data);
    } else {
      await API.post('/api/payments', data);
    }
    paymentModal.classList.remove('show');
    loadPayments();
  } catch (e) { alert('Error saving payment method'); }
});

window.editPayment = async function(id) {
  try {
    const payments = await API.get('/api/payments');
    const p = payments.find(x => x.id === id);
    if (!p) return;
    document.getElementById('paymentId').value = p.id;
    document.getElementById('payMethod').value = p.method;
    document.getElementById('payNumber').value = p.number;
    document.getElementById('payHolder').value = p.holder_name || '';
    paymentModalTitle.textContent = 'Edit Payment Method';
    paymentModal.classList.add('show');
  } catch (e) { alert('Error loading payment'); }
};

window.togglePayment = async function(id, current) {
  try {
    await API.put(`/api/payments/${id}`, { is_active: !current });
    loadPayments();
  } catch (e) { alert('Error toggling payment'); }
};

window.deletePayment = async function(id) {
  if (!confirm('Delete this payment method?')) return;
  try {
    await API.del(`/api/payments/${id}`);
    loadPayments();
  } catch (e) { alert('Error deleting payment'); }
};

// ===== SHIPPING RATES =====
async function loadShippingRates() {
  try {
    const rates = await API.get('/api/shipping-rates');
    const tbody = document.querySelector('#shippingTable tbody');
    tbody.innerHTML = rates.map(r => `
      <tr>
        <td>#${r.id}</td>
        <td><strong>${r.governorate}</strong></td>
        <td>EGP ${Number(r.fee).toFixed(2)}</td>
        <td>
          <button class="action-btn" onclick="editShipping(${r.id})">Edit</button>
          <button class="action-btn danger" onclick="deleteShipping(${r.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error(e); }
}

const shippingModal = document.getElementById('shippingModal');
const shippingForm = document.getElementById('shippingForm');
const shippingModalTitle = document.getElementById('shippingModalTitle');
const shippingModalClose = document.getElementById('shippingModalClose');

document.getElementById('addShippingBtn').addEventListener('click', () => {
  shippingForm.reset();
  document.getElementById('shippingId').value = '';
  shippingModalTitle.textContent = 'Add Governorate';
  shippingModal.classList.add('show');
});

shippingModalClose.addEventListener('click', () => shippingModal.classList.remove('show'));
shippingModal.addEventListener('click', e => { if (e.target === shippingModal) shippingModal.classList.remove('show'); });

shippingForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('shippingId').value;
  const data = {
    governorate: document.getElementById('shipGov').value,
    fee: parseFloat(document.getElementById('shipFee').value)
  };
  try {
    if (id) {
      await API.put(`/api/shipping-rates/${id}`, data);
    } else {
      await API.post('/api/shipping-rates', data);
    }
    shippingModal.classList.remove('show');
    loadShippingRates();
  } catch (e) { alert('Error saving shipping rate'); }
});

window.editShipping = async function(id) {
  try {
    const rates = await API.get('/api/shipping-rates');
    const r = rates.find(x => x.id === id);
    if (!r) return;
    document.getElementById('shippingId').value = r.id;
    document.getElementById('shipGov').value = r.governorate;
    document.getElementById('shipFee').value = r.fee;
    shippingModalTitle.textContent = 'Edit Governorate';
    shippingModal.classList.add('show');
  } catch (e) { alert('Error loading shipping rate'); }
};

window.deleteShipping = async function(id) {
  if (!confirm('Delete this shipping rate?')) return;
  try {
    await API.del(`/api/shipping-rates/${id}`);
    loadShippingRates();
  } catch (e) { alert('Error deleting shipping rate'); }
};

// ===== SETTINGS =====
async function loadSettings() {
  try {
    const s = await API.get('/api/settings');
    document.getElementById('set_store_name').value = s.store_name || '';
    document.getElementById('set_currency').value = s.currency || '';
    document.getElementById('set_shipping_fee').value = s.shipping_fee || '';
    document.getElementById('set_min_order_amount').value = s.min_order_amount || '';
    document.getElementById('set_max_order_amount').value = s.max_order_amount || '';
    document.getElementById('set_phone').value = s.phone || '';
  } catch (e) { console.error(e); }
}

document.getElementById('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await API.put('/api/settings', {
      store_name: document.getElementById('set_store_name').value,
      currency: document.getElementById('set_currency').value,
      shipping_fee: document.getElementById('set_shipping_fee').value,
      min_order_amount: document.getElementById('set_min_order_amount').value,
      max_order_amount: document.getElementById('set_max_order_amount').value,
      phone: document.getElementById('set_phone').value
    });
    alert('Settings saved successfully!');
  } catch (e) { alert('Error saving settings'); }
});

// ===== CUSTOM SIZES & COLORS =====
function addTag(type) {
  const input = document.getElementById(type === 'size' ? 'newSize' : 'newColor');
  const selector = document.getElementById(type === 'size' ? 'sizeSelector' : 'colorSelector');
  const val = input.value.trim();
  if (!val) return;
  const existing = [...selector.querySelectorAll('input')].some(c => c.value.toLowerCase() === val.toLowerCase());
  if (existing) { alert('Already exists'); return; }
  const label = document.createElement('label');
  label.className = 'tag-option';
  label.setAttribute('translate', 'no');
  label.innerHTML = `<input type="checkbox" value="${val.replace(/"/g, '&quot;')}" checked> ${val} <span onclick="this.parentElement.remove()" style="margin-left:4px;cursor:pointer;opacity:0.4">&times;</span>`;
  selector.appendChild(label);
  input.value = '';
  input.focus();
}

document.getElementById('newSize').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag('size'); } });
document.getElementById('newColor').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag('color'); } });
