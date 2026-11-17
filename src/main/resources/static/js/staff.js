let allOrders = [];
let currentFilter = 'ACTIVE';

const statusLabels = {
  NEW: 'Mới',
  CONFIRMED: 'Đã xác nhận',
  PREPARING: 'Đang chuẩn bị',
  READY: 'Sẵn sàng',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy'
};

const nextStatuses = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: []
};

async function initStaff() {
  try {
    const me = await CafeApp.requireRole(['STAFF', 'MANAGER']);
    const staffNameEl = document.getElementById('staffName');
    if (staffNameEl) staffNameEl.textContent = me.fullName;
    await loadOrders();
    // Tự động làm mới đơn hàng mỗi 8 giây
    setInterval(loadOrders, 8000);
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function loadOrders() {
  const container = document.getElementById('ordersList');
  if (!allOrders.length && container) {
    container.innerHTML = '<div class="loading-card"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải đơn hàng...</div>';
  }
  try {
    allOrders = await CafeApp.api('/api/staff/orders');
    updateOrderCounts();
    renderOrders();
  } catch (error) {
    if (container) {
      container.innerHTML = `<div class="notice-card error-message"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi tải đơn hàng: ${CafeApp.escape(error.message)}</div>`;
    }
  }
}

function updateOrderCounts() {
  const activeCount = allOrders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  const newCount = allOrders.filter(o => o.status === 'NEW').length;
  const prepCount = allOrders.filter(o => o.status === 'PREPARING' || o.status === 'CONFIRMED').length;
  const readyCount = allOrders.filter(o => o.status === 'READY').length;
  const allCount = allOrders.length;

  const setIfExists = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setIfExists('countActive', activeCount);
  setIfExists('countNew', newCount);
  setIfExists('countPreparing', prepCount);
  setIfExists('countReady', readyCount);
  setIfExists('countAll', allCount);
}

function renderOrders() {
  const container = document.getElementById('ordersList');
  if (!container) return;

  // Lọc theo currentFilter và sắp xếp theo hàng đợi thời gian thực (giống hệt bên trang Admin)
  let filtered = allOrders;
  if (currentFilter === 'ACTIVE') {
    // Thứ tự phục vụ: Đơn đặt trước làm trước (FIFO: Cũ nhất xếp đầu -> Đơn #1)
    filtered = allOrders
      .filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (currentFilter === 'NEW') {
    filtered = allOrders
      .filter(o => o.status === 'NEW')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (currentFilter === 'PREPARING') {
    filtered = allOrders
      .filter(o => o.status === 'PREPARING' || o.status === 'CONFIRMED')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (currentFilter === 'READY') {
    filtered = allOrders
      .filter(o => o.status === 'READY')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (currentFilter === 'COMPLETED') {
    filtered = allOrders
      .filter(o => o.status === 'COMPLETED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    filtered = [...allOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 36px 20px;">
      <i class="fa-solid fa-inbox" style="font-size: 28px; margin-bottom: 8px; opacity: 0.5;"></i>
      <p>Không có đơn hàng nào trong mục này.</p>
    </div>`;
    return;
  }

  container.innerHTML = filtered.map((order, idx) => {
    const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';
    const queueNumber = idx + 1;
    const isFirstActive = (currentFilter === 'ACTIVE' || currentFilter === 'NEW') && idx === 0;
    const options = (nextStatuses[order.status] || []).map(s => `<option value="${s}">${statusLabels[s] || s}</option>`).join('');

    let quickButtons = '';
    if (order.status === 'NEW') {
      quickButtons = `
        <button class="btn btn-primary btn-small list-quick-btn" data-order-id="${order.orderId}" data-current="${order.status}" data-target="CONFIRMED">
          <i class="fa-solid fa-check"></i> Xác nhận
        </button>
        <button class="btn btn-success btn-small list-quick-btn" data-order-id="${order.orderId}" data-current="${order.status}" data-target="COMPLETED" title="Hoàn thành đơn">
          <i class="fa-solid fa-circle-check"></i> Xong
        </button>
      `;
    } else if (order.status === 'CONFIRMED' || order.status === 'PREPARING' || order.status === 'READY') {
      quickButtons = `
        <button class="btn btn-success btn-small list-quick-btn" data-order-id="${order.orderId}" data-current="${order.status}" data-target="COMPLETED" title="Hoàn thành đơn">
          <i class="fa-solid fa-circle-check"></i> Xong
        </button>
      `;
    }

    return `
      <article class="order-card ${isFirstActive ? 'order-card-priority' : ''}">
        <div class="order-card-head">
          <div>
            <div class="order-queue-row">
              ${!isTerminal ? `
                <span class="order-queue-num ${isFirstActive ? 'first' : ''}">
                  <i class="fa-solid fa-bell-concierge"></i> ĐƠN #${queueNumber}
                </span>
              ` : ''}
              <span class="table-num-pill"><i class="fa-solid fa-chair"></i> Bàn ${order.tableNumber}</span>
            </div>
            <h3 style="margin-top: 6px;">${CafeApp.escape(order.orderCode)}</h3>
          </div>
          <span class="status-badge status-${order.status.toLowerCase()}">${statusLabels[order.status] || order.status}</span>
        </div>

        <div class="order-meta">
          <span><i class="fa-regular fa-clock"></i> ${new Date(order.createdAt).toLocaleTimeString('vi-VN')} · ${new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
          ${isFirstActive ? '<span class="priority-label"><i class="fa-solid fa-fire"></i> Đơn đầu tiên cần làm</span>' : ''}
        </div>

        ${order.customerNote ? `<p class="order-note"><i class="fa-solid fa-message"></i> ${CafeApp.escape(order.customerNote)}</p>` : ''}

        <div class="order-items">
          ${(order.items || []).map(item => `
            <div class="order-item-line">
              <div>
                <strong>${CafeApp.escape(item.itemName)}</strong>
                <small>${CafeApp.escape(item.variantName)} · SL: <b>${item.quantity}</b></small>
                ${(item.toppings || []).length ? `<small>+ Topping: ${item.toppings.map(t => CafeApp.escape(t.toppingName)).join(', ')}</small>` : ''}
              </div>
              <span>${CafeApp.money(item.lineTotal)}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-total" style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span>Tổng cộng: </span>
            <strong>${CafeApp.money(order.totalAmount)}</strong>
          </div>
          <a href="/order-detail.html?orderCode=${encodeURIComponent(order.orderCode)}" class="btn btn-outline btn-small" title="Xem chi tiết hóa đơn">
            <i class="fa-solid fa-file-invoice"></i> Chi tiết
          </a>
        </div>

        ${!isTerminal ? `
          <div class="status-update">
            ${quickButtons}
            ${options ? `
              <select id="status-${order.orderId}">
                ${options}
              </select>
              <button class="btn btn-secondary btn-small save-status-btn" data-order-id="${order.orderId}">
                Lưu
              </button>
            ` : ''}
          </div>
        ` : `
          <p class="small-note"><i class="fa-solid fa-check"></i> Đơn đã ở trạng thái kết thúc.</p>
        `}
      </article>
    `;
  }).join('');

  // Gắn sự kiện nút nhanh Xác nhận / Xong
  container.querySelectorAll('.list-quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = Number(btn.dataset.orderId);
      const target = btn.dataset.target;
      await updateOrderStatus(orderId, target);
    });
  });

  // Gắn sự kiện nút Lưu dropdown
  container.querySelectorAll('.save-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = Number(btn.dataset.orderId);
      const sel = document.getElementById(`status-${orderId}`);
      if (sel) {
        await updateOrderStatus(orderId, sel.value);
      }
    });
  });
}

async function updateOrderStatus(orderId, targetStatus) {
  try {
    await CafeApp.api(`/api/staff/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetStatus })
    });
    showStaffToast(`Đã chuyển đơn sang: ${statusLabels[targetStatus] || targetStatus}`);
    await loadOrders();
  } catch (error) {
    alert(error.message || 'Không thể cập nhật trạng thái đơn hàng.');
  }
}

function showStaffToast(msg) {
  let toast = document.getElementById('staffToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'staffToast';
    toast.className = 'admin-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${CafeApp.escape(msg)}`;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  initStaff();

  const refreshBtn = document.getElementById('refreshOrders');
  if (refreshBtn) refreshBtn.addEventListener('click', loadOrders);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => CafeApp.logout());

  // Gắn sự kiện cho các nút lọc trạng thái
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderOrders();
    });
  });
});
