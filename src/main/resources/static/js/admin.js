let selectedTableId = null;
let selectedTableNumber = null;
let cachedTables = [];
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

async function initAdmin() {
  try {
    const me = await CafeApp.requireRole('MANAGER');
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) adminNameEl.textContent = me.fullName;

    // Load only what is needed for the current page
    const tasks = [];
    if (document.getElementById('tableGrid')) {
      tasks.push(loadTables());
    }
    if (document.getElementById('adminOrdersList') || document.getElementById('tableGrid')) {
      tasks.push(loadOrders());
    }
    if (document.getElementById('itemCategory')) {
      tasks.push(loadCategories());
    }
    if (document.getElementById('menuManagement')) {
      tasks.push(loadMenu());
    }
    if (document.getElementById('toppingManagement')) {
      tasks.push(loadToppings());
    }
    if (document.getElementById('orderHistorySection')) {
      tasks.push(loadHistoryOrders());
    }
    if (document.getElementById('staffTableBody')) {
      tasks.push(loadStaffList());
    }

    await Promise.all(tasks);

    // Tự động kiểm tra đơn hàng mới mỗi 10 giây nếu ở trang đơn hàng
    if (document.getElementById('adminOrdersList')) {
      setInterval(loadOrders, 10000);
    }
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function loadTables() {
  cachedTables = await CafeApp.api('/api/admin/tables');
  renderTablesGrid();
  if (cachedTables.length && !selectedTableId) {
    selectTable(cachedTables[0].tableId, cachedTables[0].tableCode, `Bàn ${cachedTables[0].tableNumber}`, cachedTables[0].tableNumber);
  } else if (selectedTableId) {
    const selected = cachedTables.find(t => t.tableId === selectedTableId);
    if (selected) selectTable(selected.tableId, selected.tableCode, `Bàn ${selected.tableNumber}`, selected.tableNumber);
  }
}

function renderTablesGrid() {
  const grid = document.getElementById('tableGrid');
  if (!grid) return;
  grid.innerHTML = cachedTables.map(table => {
    // Kiểm tra xem bàn này có đơn nào chưa kết thúc không
    const activeOrder = allOrders.find(o => Number(o.tableNumber) === Number(table.tableNumber) && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
    const badgeHtml = activeOrder ? `<span class="table-order-badge" title="Đang có đơn: ${statusLabels[activeOrder.status] || activeOrder.status}"><i class="fa-solid fa-bell"></i> Có đơn</span>` : '';
    return `<button class="table-tile ${selectedTableId === table.tableId ? 'selected' : ''}" data-table-id="${table.tableId}" data-table-num="${table.tableNumber}">
      ${badgeHtml}
      <span class="table-tile-icon">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="7.5" fill="currentColor"/>
          <rect x="12" y="3" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="12" y="26" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="3" y="12" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
          <rect x="26" y="12" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
        </svg>
      </span>
      <strong>${CafeApp.escape(table.tableCode)}</strong><small>Bàn ${table.tableNumber}</small>
    </button>`;
  }).join('');

  grid.querySelectorAll('[data-table-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.tableId);
      const num = Number(button.dataset.tableNum);
      const code = button.querySelector('strong').textContent;
      const label = button.querySelector('small').textContent;
      selectTable(id, code, label, num);
    });
  });
}

let selectedTableObj = null;

function selectTable(id, code, label, tableNum) {
  selectedTableId = id;
  selectedTableObj = cachedTables.find(t => t.tableId === id) || null;
  selectedTableNumber = tableNum !== undefined ? tableNum : (selectedTableObj?.tableNumber || null);
  const title = document.getElementById('qrTableTitle');
  if (title) title.textContent = `${code} · ${label}`;
  const image = document.getElementById('qrPreview');
  if (image) {
    image.src = `/api/admin/tables/${id}/qr.png?ts=${Date.now()}`;
    image.classList.remove('hidden');
  }
  const placeholder = document.getElementById('qrPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');
  const download = document.getElementById('downloadQr');
  if (download) {
    download.href = `/api/admin/tables/${id}/qr.png?download=true`;
    download.classList.remove('disabled-link');
  }
  const printBtn = document.getElementById('printQr');
  if (printBtn) printBtn.disabled = false;
  document.querySelectorAll('.table-tile').forEach(button => button.classList.toggle('selected', Number(button.dataset.tableId) === id));

  renderTableOrderDetail();
}

function openLargeQrModal() {
  if (!selectedTableId) return;
  const table = selectedTableObj || cachedTables.find(t => t.tableId === selectedTableId);
  const modal = document.getElementById('qrModal');
  if (!modal) return;

  const tableNum = table ? table.tableNumber : (selectedTableNumber || '1');
  const tableCode = table ? table.tableCode : `BAN${String(tableNum).padStart(2, '0')}`;

  const titleEl = document.getElementById('modalQrTitle');
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-qrcode"></i> Mã QR Bàn ${tableNum} (${tableCode})`;

  const imgEl = document.getElementById('modalQrImage');
  if (imgEl) imgEl.src = `/api/admin/tables/${selectedTableId}/qr.png?ts=${Date.now()}`;

  const downloadEl = document.getElementById('modalDownloadLink');
  if (downloadEl) {
    downloadEl.href = `/api/admin/tables/${selectedTableId}/qr.png?download=true`;
    downloadEl.download = `${tableCode}-QR.png`;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeLargeQrModal() {
  const modal = document.getElementById('qrModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function loadOrders() {
  try {
    allOrders = await CafeApp.api('/api/staff/orders');
    updateOrderCounts();
    renderTablesGrid();
    renderTableOrderDetail();
    renderAdminOrdersList();
  } catch (error) {
    console.error('Không thể tải đơn hàng:', error);
    const container = document.getElementById('adminOrdersList');
    if (container) {
      container.innerHTML = `<div class="notice-card error-message" style="grid-column: 1 / -1; padding: 24px;">
        <i class="fa-solid fa-triangle-exclamation"></i> Không thể tải danh sách đơn hàng: ${CafeApp.escape(error.message)}
        <br><button class="btn btn-small btn-secondary" style="margin-top: 10px;" onclick="loadOrders()"><i class="fa-solid fa-arrows-rotate"></i> Thử lại</button>
      </div>`;
    }
    const orderBox = document.getElementById('tableOrderContent');
    if (orderBox && (!allOrders || !allOrders.length)) {
      orderBox.innerHTML = `<div class="notice-card error-message" style="padding: 14px;">
        <i class="fa-solid fa-triangle-exclamation"></i> Chưa tải được đơn: ${CafeApp.escape(error.message)}
      </div>`;
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

function renderTableOrderDetail() {
  const container = document.getElementById('tableOrderContent');
  const badge = document.getElementById('tableOrderBadge');
  if (!container || selectedTableNumber === null) return;

  // Lấy các đơn của bàn này
  const tableOrders = allOrders.filter(o => Number(o.tableNumber) === Number(selectedTableNumber));
  // Ưu tiên đơn đang phục vụ
  const activeOrder = tableOrders.find(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const currentOrder = activeOrder || tableOrders[0];

  if (!currentOrder) {
    if (badge) badge.classList.add('hidden');
    container.innerHTML = `<div class="empty-table-state">
      <i class="fa-solid fa-chair"></i>
      <p><strong>Bàn trống / Chưa có đơn nào</strong></p>
      <small class="muted">Khi khách quét mã QR và đặt món, thông tin đơn hàng và món đặt sẽ xuất hiện ngay tại đây.</small>
    </div>`;
    return;
  }

  if (badge) {
    badge.className = `status-badge status-${currentOrder.status.toLowerCase()}`;
    badge.textContent = statusLabels[currentOrder.status] || currentOrder.status;
    badge.classList.remove('hidden');
  }

  const isTerminal = currentOrder.status === 'COMPLETED' || currentOrder.status === 'CANCELLED';
  const options = (nextStatuses[currentOrder.status] || []).map(s => `<option value="${s}">${statusLabels[s] || s}</option>`).join('');

  // Tạo các nút hành động nhanh
  let quickActionHtml = '';
  if (currentOrder.status === 'NEW') {
    quickActionHtml = `
      <button class="btn btn-primary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="CONFIRMED">
        <i class="fa-solid fa-check"></i> Xác nhận đơn
      </button>
      <button class="btn btn-secondary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="COMPLETED" title="Đánh dấu hoàn thành toàn bộ đơn">
        <i class="fa-solid fa-circle-check"></i> Hoàn thành ngay
      </button>
      <button class="btn btn-outline-danger btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="CANCELLED">
        <i class="fa-solid fa-xmark"></i> Hủy đơn
      </button>
    `;
  } else if (currentOrder.status === 'CONFIRMED') {
    quickActionHtml = `
      <button class="btn btn-primary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="PREPARING">
        <i class="fa-solid fa-mug-hot"></i> Bắt đầu làm
      </button>
      <button class="btn btn-secondary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="COMPLETED">
        <i class="fa-solid fa-circle-check"></i> Hoàn thành ngay
      </button>
      <button class="btn btn-outline-danger btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="CANCELLED">
        <i class="fa-solid fa-xmark"></i> Hủy
      </button>
    `;
  } else if (currentOrder.status === 'PREPARING') {
    quickActionHtml = `
      <button class="btn btn-primary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="READY">
        <i class="fa-solid fa-bell"></i> Sẵn sàng phục vụ
      </button>
      <button class="btn btn-secondary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="COMPLETED">
        <i class="fa-solid fa-circle-check"></i> Hoàn thành ngay
      </button>
    `;
  } else if (currentOrder.status === 'READY') {
    quickActionHtml = `
      <button class="btn btn-primary btn-small quick-action-btn" data-order-id="${currentOrder.orderId}" data-target="COMPLETED">
        <i class="fa-solid fa-circle-check"></i> Hoàn thành đơn
      </button>
    `;
  }

  container.innerHTML = `
    <div class="table-order-header">
      <div>
        <strong>Đơn: ${CafeApp.escape(currentOrder.orderCode)}</strong>
        <small class="muted"><i class="fa-regular fa-clock"></i> ${new Date(currentOrder.createdAt).toLocaleTimeString('vi-VN')} · ${new Date(currentOrder.createdAt).toLocaleDateString('vi-VN')}</small>
      </div>
      <span class="status-badge status-${currentOrder.status.toLowerCase()}">${statusLabels[currentOrder.status] || currentOrder.status}</span>
    </div>

    ${currentOrder.customerNote ? `<div class="order-note"><i class="fa-solid fa-message"></i> Ghi chú của khách: <em>${CafeApp.escape(currentOrder.customerNote)}</em></div>` : ''}

    <div class="table-order-items">
      ${(currentOrder.items || []).map(item => `
        <div class="table-item-row">
          <div class="item-name-col">
            <strong>${CafeApp.escape(item.itemName)}</strong>
            <small>${CafeApp.escape(item.variantName)} · Số lượng: <b>${item.quantity}</b></small>
            ${(item.toppings || []).length ? `<small class="toppings-text">+ Topping: ${item.toppings.map(t => CafeApp.escape(t.toppingName)).join(', ')}</small>` : ''}
          </div>
          <span class="item-price-col">${CafeApp.money(item.lineTotal)}</span>
        </div>
      `).join('')}
    </div>

    <div class="table-order-total">
      <span>Tổng thanh toán:</span>
      <strong>${CafeApp.money(currentOrder.totalAmount)}</strong>
    </div>

    ${!isTerminal ? `
      <div class="table-order-actions">
        <p class="field-label" style="margin: 0 0 6px;"><i class="fa-solid fa-sliders"></i> Cập nhật trạng thái đơn:</p>
        <div class="quick-action-row">${quickActionHtml}</div>
        ${options ? `
          <div class="manual-status-row" style="margin-top: 8px;">
            <select id="tableManualStatus-${currentOrder.orderId}">
              ${options}
            </select>
            <button class="btn btn-secondary btn-small save-manual-status" data-order-id="${currentOrder.orderId}">
              <i class="fa-solid fa-floppy-disk"></i> Lưu
            </button>
          </div>
        ` : ''}
      </div>
    ` : `
      <p class="small-note text-center" style="margin-top: 10px; color: var(--status-ready);">
        <i class="fa-solid fa-circle-check"></i> Đơn hàng này đã kết thúc (${statusLabels[currentOrder.status] || currentOrder.status}).
      </p>
    `}
  `;

  // Gắn sự kiện cho các nút hành động nhanh
  container.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = Number(btn.dataset.orderId);
      const target = btn.dataset.target;
      await changeOrderStatus(orderId, currentOrder.status, target);
    });
  });

  // Gắn sự kiện cho dropdown thủ công
  const manualBtn = container.querySelector('.save-manual-status');
  if (manualBtn) {
    manualBtn.addEventListener('click', async () => {
      const orderId = Number(manualBtn.dataset.orderId);
      const sel = document.getElementById(`tableManualStatus-${orderId}`);
      if (sel) {
        await changeOrderStatus(orderId, currentOrder.status, sel.value);
      }
    });
  }
}

function renderAdminOrdersList() {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  // Lọc theo currentFilter và sắp xếp theo hàng đợi thời gian
  let filtered = allOrders;
  if (currentFilter === 'ACTIVE') {
    // Thứ tự phục vụ: Đơn đặt trước làm trước (FIFO: Cũ nhất xếp đầu)
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
          <i class="fa-solid fa-circle-check"></i> Xong (Hoàn thành)
        </button>
      `;
    }

    return `<article class="order-card ${isFirstActive ? 'order-card-priority' : ''}">
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
            <select id="listStatus-${order.orderId}">
              ${options}
            </select>
            <button class="btn btn-secondary btn-small list-save-status" data-order-id="${order.orderId}" data-current="${order.status}">
              Lưu
            </button>
          ` : ''}
        </div>
      ` : `
        <p class="small-note"><i class="fa-solid fa-check"></i> Đơn đã ở trạng thái kết thúc.</p>
      `}
    </article>`;
  }).join('');

  // Gắn sự kiện các nút trong danh sách đơn
  container.querySelectorAll('.list-quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = Number(btn.dataset.orderId);
      const current = btn.dataset.current;
      const target = btn.dataset.target;
      await changeOrderStatus(orderId, current, target);
    });
  });

  container.querySelectorAll('.list-save-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = Number(btn.dataset.orderId);
      const current = btn.dataset.current;
      const sel = document.getElementById(`listStatus-${orderId}`);
      if (sel) {
        await changeOrderStatus(orderId, current, sel.value);
      }
    });
  });
}

/**
 * Chuyển trạng thái đơn hàng và tự động cập nhật hàng đợi & lịch sử
 */
async function changeOrderStatus(orderId, currentStatus, targetStatus) {
  try {
    await CafeApp.api(`/api/staff/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetStatus })
    });
    showAdminToast(`Đã chuyển đơn sang: ${statusLabels[targetStatus] || targetStatus}`);
    await loadOrders();
    if (typeof loadHistoryOrders === 'function') {
      await loadHistoryOrders();
    }
  } catch (error) {
    alert(error.message || 'Không thể cập nhật trạng thái đơn hàng.');
  }
}

let currentHistoryDate = new Date().toISOString().split('T')[0];

async function loadHistoryOrders(targetDate) {
  if (targetDate) currentHistoryDate = targetDate;
  const dateInput = document.getElementById('historyDateInput');
  if (dateInput) {
    if (targetDate) dateInput.value = targetDate;
    else if (!dateInput.value) dateInput.value = currentHistoryDate;
    else currentHistoryDate = dateInput.value;
  }

  const container = document.getElementById('historyOrdersContainer');
  if (container) {
    container.innerHTML = '<div class="loading-card"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử đơn...</div>';
  }

  try {
    const data = await CafeApp.api(`/api/staff/orders/history?date=${encodeURIComponent(currentHistoryDate)}`);

    const totalEl = document.getElementById('histTotalOrders');
    const compEl = document.getElementById('histCompletedOrders');
    const revEl = document.getElementById('histTotalRevenue');

    if (totalEl) totalEl.textContent = `${data.totalOrders || 0} đơn`;
    if (compEl) compEl.textContent = `${data.completedOrders || 0} đơn`;
    if (revEl) revEl.textContent = CafeApp.money(data.totalRevenue || 0);

    if (!container) return;

    const orders = data.orders || [];
    if (!orders.length) {
      const parts = currentHistoryDate.split('-');
      const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <i class="fa-regular fa-calendar-xmark" style="font-size: 32px; opacity: 0.4; margin-bottom: 8px;"></i>
          <p>Không có đơn hàng nào trong ngày <b>${formattedDate}</b>.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <p class="small-note" style="margin-bottom: 12px;">
        <i class="fa-solid fa-circle-info"></i> Bấm vào dòng bất kỳ hoặc nút <strong>Chi tiết</strong> để mở trang hóa đơn đầy đủ và in phiếu đơn hàng.
      </p>
      <div class="history-table-wrapper">
        <table class="history-table">
          <thead>
            <tr>
              <th style="width: 50px;">STT</th>
              <th style="width: 150px;">Mã đơn</th>
              <th style="width: 80px;">Bàn</th>
              <th style="width: 90px;">Giờ đặt</th>
              <th>Chi tiết món & Topping</th>
              <th style="width: 120px; text-align: right;">Tổng tiền</th>
              <th style="width: 110px; text-align: center;">Trạng thái</th>
              <th style="width: 95px; text-align: center;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o, idx) => {
              const statusText = statusLabels[o.status] || o.status;
              const timeStr = new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const detailUrl = `/order-detail.html?orderCode=${encodeURIComponent(o.orderCode)}`;
              return `
                <tr class="clickable-order-row" onclick="window.location.href='${detailUrl}'" title="Xem chi tiết đơn ${CafeApp.escape(o.orderCode)}">
                  <td class="hist-stt">#${idx + 1}</td>
                  <td class="hist-code">
                    <a href="${detailUrl}" class="order-link" onclick="event.stopPropagation()">
                      <strong>${CafeApp.escape(o.orderCode)}</strong>
                    </a>
                  </td>
                  <td class="hist-table"><span class="table-num-pill"><i class="fa-solid fa-chair"></i> Bàn ${o.tableNumber}</span></td>
                  <td class="hist-time"><i class="fa-regular fa-clock"></i> ${timeStr}</td>
                  <td class="hist-items">
                    <div class="hist-items-list">
                      ${(o.items || []).map(item => `
                        <div class="hist-item-row">
                          <span class="hir-name">${CafeApp.escape(item.itemName)} (${CafeApp.escape(item.variantName)}) x <b>${item.quantity}</b></span>
                          ${(item.toppings || []).length ? `
                            <span class="hir-toppings">+ Topping: ${item.toppings.map(t => CafeApp.escape(t.toppingName)).join(', ')}</span>
                          ` : ''}
                        </div>
                      `).join('')}
                    </div>
                    ${o.customerNote ? `<small class="hist-note"><i class="fa-solid fa-message"></i> ${CafeApp.escape(o.customerNote)}</small>` : ''}
                  </td>
                  <td class="hist-price" style="text-align: right;"><b>${CafeApp.money(o.totalAmount)}</b></td>
                  <td class="hist-status" style="text-align: center;">
                    <span class="status-badge status-${o.status.toLowerCase()}">${statusText}</span>
                  </td>
                  <td class="hist-actions" style="text-align: center;" onclick="event.stopPropagation()">
                    <a href="${detailUrl}" class="btn btn-small btn-secondary" title="Xem chi tiết">
                      <i class="fa-solid fa-eye"></i> Chi tiết
                    </a>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    if (container) {
      container.innerHTML = `<div class="notice-card error-message"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi tải lịch sử: ${CafeApp.escape(error.message)}</div>`;
    }
  }
}

async function loadCategories(selectedId = null) {
  const select = document.getElementById('itemCategory');
  if (!select) return;
  const categories = await CafeApp.api('/api/admin/categories');
  select.innerHTML = categories.map(c => `<option value="${c.categoryId}">${CafeApp.escape(c.categoryName)}</option>`).join('');
  if (selectedId) {
    select.value = selectedId;
  }
}

let cachedAdminCategories = [];
let adminSearchKeyword = '';

function showAdminToast(msg) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'admin-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${CafeApp.escape(msg)}`;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

async function loadMenu() {
  cachedAdminCategories = await CafeApp.api('/api/admin/menu');
  renderAdminMenu();
}

function renderAdminMenu() {
  const container = document.getElementById('menuManagement');
  if (!container) return;
  if (!cachedAdminCategories.length) {
    container.innerHTML = '<p class="empty-category">Menu chưa có danh mục nào.</p>';
    return;
  }

  // Lọc theo từ khóa tìm kiếm (nếu có)
  const kw = adminSearchKeyword.trim();
  const filteredCategories = cachedAdminCategories.map(cat => {
    let items = cat.items || [];
    if (kw) {
      items = items.filter(item => 
        CafeApp.matchSearch(item.itemName, kw) || 
        (item.description && CafeApp.matchSearch(item.description, kw))
      );
    }
    return { ...cat, items };
  }).filter(cat => !kw || cat.items.length > 0);

  if (!filteredCategories.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 28px 16px;">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 24px; opacity: 0.5; margin-bottom: 8px;"></i>
        <p>Không tìm thấy món nào phù hợp với từ khóa "${CafeApp.escape(kw)}".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredCategories.map(category => `
    <div class="management-category">
      <h3>${CafeApp.escape(category.categoryName)} <small class="muted" style="font-size: 13px; font-weight: normal;">(${category.items.length} món)</small></h3>
      ${category.items.length ? category.items.map(item => {
        const imgSrc = CafeApp.getItemImage(item);
        const hasCustom = CafeApp.hasCustomImage(item.itemId, item.itemName);
        return `
          <article class="manage-item" data-item-id="${item.itemId}">
            <div class="manage-item-top">
              <!-- Cột ảnh đại diện & Tải ảnh -->
              <div class="manage-item-photo-col">
                <div class="manage-item-thumb-box">
                  <img src="${imgSrc}" alt="${CafeApp.escape(item.itemName)}" class="manage-item-thumb" id="manage-thumb-${item.itemId}" onerror="this.src=CafeApp.FALLBACK_DRINK_IMG">
                  ${hasCustom ? '<span class="custom-badge" title="Ảnh do bạn tự tải lên"><i class="fa-solid fa-check"></i></span>' : ''}
                </div>
                <div class="photo-action-buttons">
                  <label class="btn btn-small btn-secondary btn-upload-photo" title="Tải ảnh mới từ máy">
                    <i class="fa-solid fa-camera"></i> Đổi ảnh
                    <input type="file" class="manage-file-input" data-item-id="${item.itemId}" data-item-name="${CafeApp.escape(item.itemName)}" accept="image/*" style="display:none">
                  </label>
                  ${hasCustom ? `
                    <button type="button" class="btn btn-small btn-outline btn-reset-photo" data-item-id="${item.itemId}" data-item-name="${CafeApp.escape(item.itemName)}" title="Khôi phục ảnh gốc">
                      <i class="fa-solid fa-rotate-left"></i> Gốc
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Cột thông tin món & giá -->
              <div class="manage-item-content">
                <div class="manage-item-header">
                  <div>
                    <strong>${CafeApp.escape(item.itemName)}</strong>
                    <small>${CafeApp.escape(item.description || '')}</small>
                  </div>
                  <label class="switch-label">
                    <input type="checkbox" class="item-active" data-item-id="${item.itemId}" ${item.isAvailable ? 'checked' : ''}> Đang bán
                  </label>
                </div>
                
                <div class="product-edit-fields">
                  <input id="item-name-${item.itemId}" maxlength="150" value="${CafeApp.escape(item.itemName)}" aria-label="Tên món" placeholder="Tên món">
                  <input id="item-desc-${item.itemId}" maxlength="500" value="${CafeApp.escape(item.description || '')}" aria-label="Mô tả món" placeholder="Mô tả món">
                  <button class="btn btn-small btn-secondary save-item" data-id="${item.itemId}"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
                </div>

                <div class="variant-edit-list">
                  ${(item.variants || []).map(v => `
                    <div class="variant-edit-row">
                      <span>${CafeApp.escape(v.variantName)}</span>
                      <input type="number" min="0" step="any" value="${v.price}" id="variant-price-${v.variantId}">
                      <label><input type="checkbox" id="variant-active-${v.variantId}" ${v.isAvailable ? 'checked' : ''}> Bán</label>
                      <button class="btn btn-small btn-secondary save-variant" data-id="${v.variantId}"><i class="fa-solid fa-check"></i> Lưu giá</button>
                    </div>
                  `).join('')}
                </div>

                ${(item.toppings || []).length ? `<div class="item-topping-tags">Topping liên kết: ${(item.toppings || []).map(t => CafeApp.escape(t.toppingName)).join(', ')}</div>` : ''}
              </div>
            </div>
          </article>
        `;
      }).join('') : '<p class="empty-category">Chưa có món trong danh mục này.</p>'}
    </div>
  `).join('');

  // Gắn sự kiện sửa thông tin & giá
  container.querySelectorAll('.save-variant').forEach(button => button.addEventListener('click', () => saveVariant(Number(button.dataset.id))));
  container.querySelectorAll('.save-item').forEach(button => button.addEventListener('click', () => saveItem(Number(button.dataset.id))));
  container.querySelectorAll('.item-active').forEach(input => input.addEventListener('change', () => saveItemAvailability(Number(input.dataset.itemId), input.checked)));

  // Gắn sự kiện Tải ảnh món (Đồng bộ cả localStorage và Database để hiện trên điện thoại)
  container.querySelectorAll('.manage-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const itemId = Number(input.dataset.itemId);
      const itemName = input.dataset.itemName;
      try {
        const compressed = await CafeApp.compressImage(file, 300, 0.82);
        CafeApp.setItemImage(itemId, itemName, compressed);
        // Lưu vào Database để mọi thiết bị (kể cả điện thoại) đều thấy ảnh mới ngay lập tức
        try {
          await CafeApp.api(`/api/admin/menu-items/${itemId}/image`, {
            method: 'PUT',
            body: { imageUrl: compressed }
          });
        } catch (apiErr) {
          console.warn('Lưu ảnh vào database thất bại, dùng tạm localStorage:', apiErr);
        }
        showAdminToast(`Đã lưu ảnh mới cho món: ${itemName}`);
        renderAdminMenu();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // Gắn sự kiện Khôi phục ảnh gốc
  container.querySelectorAll('.btn-reset-photo').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = Number(btn.dataset.itemId);
      const itemName = btn.dataset.itemName;
      CafeApp.resetItemImage(itemId, itemName);
      try {
        await CafeApp.api(`/api/admin/menu-items/${itemId}/image`, {
          method: 'PUT',
          body: { imageUrl: '' }
        });
      } catch (apiErr) {
        console.warn('Xóa ảnh trên server thất bại:', apiErr);
      }
      showAdminToast(`Đã khôi phục ảnh mặc định cho: ${itemName}`);
      renderAdminMenu();
    });
  });
}

async function saveItem(id) {
  const itemName = document.getElementById(`item-name-${id}`).value.trim();
  const description = document.getElementById(`item-desc-${id}`).value.trim();
  try {
    await CafeApp.api(`/api/admin/menu-items/${id}`, {
      method: 'PUT', body: JSON.stringify({ itemName, description })
    });
    alert('Đã cập nhật thông tin món.');
    await loadMenu();
  } catch (error) { alert(error.message); }
}

async function saveVariant(id) {
  const price = Number(document.getElementById(`variant-price-${id}`).value);
  const available = document.getElementById(`variant-active-${id}`).checked;
  try {
    await CafeApp.api(`/api/admin/variants/${id}`, { method: 'PUT', body: JSON.stringify({ price, available }) });
    alert('Đã cập nhật giá và trạng thái.');
    await loadMenu();
  } catch (error) { alert(error.message); }
}

async function saveItemAvailability(id, available) {
  try {
    await CafeApp.api(`/api/admin/items/${id}/availability`, { method: 'PUT', body: JSON.stringify({ available }) });
  } catch (error) { alert(error.message); await loadMenu(); }
}

async function loadToppings() {
  const container = document.getElementById('toppingManagement');
  if (!container) return;
  const toppings = await CafeApp.api('/api/admin/toppings');
  if (!toppings.length) {
    container.innerHTML = '<p class="empty-category">Quán chưa có topping nào. Bạn hãy thêm topping mới ở form phía trên.</p>';
    return;
  }
  container.innerHTML = toppings.map(t => `<div class="topping-edit-row">
    <strong>${CafeApp.escape(t.toppingName)}</strong>
    <label>Phụ thu (VNĐ)<input type="number" min="0" step="500" id="topping-price-${t.toppingId}" value="${t.additionalPrice}"></label>
    <label class="switch-label"><input type="checkbox" id="topping-active-${t.toppingId}" ${t.isAvailable ? 'checked' : ''}> Đang bán</label>
    <div style="display: flex; gap: 6px;">
      <button class="btn btn-small btn-secondary save-topping" data-id="${t.toppingId}"><i class="fa-solid fa-check"></i> Lưu</button>
      <button class="btn btn-small btn-outline delete-topping" data-id="${t.toppingId}" data-name="${CafeApp.escape(t.toppingName)}" title="Xóa topping"><i class="fa-solid fa-trash-can"></i></button>
    </div>
  </div>`).join('');
  container.querySelectorAll('.save-topping').forEach(button => button.addEventListener('click', () => saveTopping(Number(button.dataset.id))));
  container.querySelectorAll('.delete-topping').forEach(button => button.addEventListener('click', () => deleteTopping(Number(button.dataset.id), button.dataset.name)));
}

async function loadStaffList() {
  const container = document.getElementById('staffTableBody');
  if (!container) return;
  try {
    const list = await CafeApp.api('/api/admin/staff');
    if (!list.length) {
      container.innerHTML = '<tr><td colspan="5" class="muted" style="text-align: center; padding: 24px;">Chưa có tài khoản nào.</td></tr>';
      return;
    }
    container.innerHTML = list.map((u, idx) => `
      <tr>
        <td><b>#${idx + 1}</b></td>
        <td><strong>${CafeApp.escape(u.fullName)}</strong></td>
        <td><code>${CafeApp.escape(u.username)}</code></td>
        <td><span class="role-badge role-${u.role.toLowerCase()}">${u.role}</span></td>
        <td>
          <label class="switch-label">
            <input type="checkbox" class="toggle-user-active" data-id="${u.userId}" ${u.isActive ? 'checked' : ''} ${u.role === 'MANAGER' ? 'disabled' : ''}>
            ${u.isActive ? '<span style="color:#16a34a; font-weight:600;">Đang hoạt động</span>' : '<span style="color:#dc2626; font-weight:600;">Đã khóa</span>'}
          </label>
        </td>
      </tr>
    `).join('');

    container.querySelectorAll('.toggle-user-active').forEach(cb => {
      cb.addEventListener('change', async () => {
        const userId = Number(cb.dataset.id);
        const isActive = cb.checked;
        try {
          await CafeApp.api(`/api/admin/staff/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
          });
          showAdminToast(`Đã ${isActive ? 'mở khóa' : 'khóa'} tài khoản.`);
          await loadStaffList();
        } catch (e) {
          alert(e.message);
          cb.checked = !isActive;
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<tr><td colspan="5" class="error-message">${CafeApp.escape(err.message)}</td></tr>`;
  }
}

async function saveTopping(id) {
  const additionalPrice = Number(document.getElementById(`topping-price-${id}`).value);
  const available = document.getElementById(`topping-active-${id}`).checked;
  try {
    await CafeApp.api(`/api/admin/toppings/${id}`, { method: 'PUT', body: JSON.stringify({ additionalPrice, available }) });
    showAdminToast('Đã cập nhật topping thành công.');
    await loadToppings();
  } catch (error) { alert(error.message); }
}

async function deleteTopping(id, name) {
  if (!confirm(`Bạn có chắc chắn muốn xóa topping "${name}"?`)) return;
  try {
    await CafeApp.api(`/api/admin/toppings/${id}`, { method: 'DELETE' });
    showAdminToast(`Đã xóa topping: ${name}`);
    await loadToppings();
    await loadMenu();
  } catch (error) { alert(error.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdmin();
  document.getElementById('refreshTables')?.addEventListener('click', () => {
    loadTables();
    loadOrders();
  });
  const refreshOrdersBtn = document.getElementById('refreshOrdersAdmin');
  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', loadOrders);
  }
  document.getElementById('refreshMenu')?.addEventListener('click', loadMenu);
  document.getElementById('refreshToppings')?.addEventListener('click', loadToppings);
  document.getElementById('printQr')?.addEventListener('click', () => {
    if (!selectedTableId) return;
    const url = `/api/admin/tables/${selectedTableId}/qr.png`;
    const w = window.open('', '_blank', 'width=600,height=650');
    if (!w) { alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép Popup.'); return; }
    w.document.write(`<html><head><title>In QR</title></head><body style="font-family:Arial;text-align:center;padding:30px"><img src="${url}" style="width:360px;height:360px"><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', () => CafeApp.logout());

  // Lọc tab đơn hàng
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderAdminOrdersList();
    });
  });

  // Tìm kiếm trong menu quản lý
  const adminSearchInput = document.getElementById('adminMenuSearch');
  const clearAdminSearchBtn = document.getElementById('clearAdminSearch');
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
      adminSearchKeyword = e.target.value;
      if (clearAdminSearchBtn) {
        if (adminSearchKeyword) clearAdminSearchBtn.classList.remove('hidden');
        else clearAdminSearchBtn.classList.add('hidden');
      }
      renderAdminMenu();
    });
  }
  if (clearAdminSearchBtn) {
    clearAdminSearchBtn.addEventListener('click', () => {
      adminSearchKeyword = '';
      if (adminSearchInput) {
        adminSearchInput.value = '';
        adminSearchInput.focus();
      }
      clearAdminSearchBtn.classList.add('hidden');
      renderAdminMenu();
    });
  }

  // Upload & preview ảnh khi thêm món mới
  let newItemImageDataUrl = null;
  const itemImageFileInput = document.getElementById('itemImageFile');
  const clearNewItemImgBtn = document.getElementById('clearNewItemImg');
  const previewImg = document.getElementById('newItemImgPreview');
  const placeholder = document.getElementById('newItemImgPlaceholder');

  if (itemImageFileInput) {
    itemImageFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        newItemImageDataUrl = await CafeApp.compressImage(file, 300, 0.82);
        if (previewImg) {
          previewImg.src = newItemImageDataUrl;
          previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (clearNewItemImgBtn) clearNewItemImgBtn.classList.remove('hidden');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (clearNewItemImgBtn) {
    clearNewItemImgBtn.addEventListener('click', () => {
      newItemImageDataUrl = null;
      if (itemImageFileInput) itemImageFileInput.value = '';
      if (previewImg) {
        previewImg.src = '';
        previewImg.classList.add('hidden');
      }
      if (placeholder) placeholder.classList.remove('hidden');
      clearNewItemImgBtn.classList.add('hidden');
    });
  }

  const staffForm = document.getElementById('staffForm');
  if (staffForm) {
    staffForm.addEventListener('submit', async event => {
      event.preventDefault();
      const message = document.getElementById('staffMessage');
      try {
        await CafeApp.api('/api/admin/staff', { method: 'POST', body: JSON.stringify({
          fullName: document.getElementById('staffFullName').value.trim(),
          username: document.getElementById('staffUsername').value.trim(),
          password: document.getElementById('staffPassword').value
        })});
        message.textContent = 'Tạo Staff thành công.'; message.className = 'form-message success-message'; event.target.reset();
        await loadStaffList();
      } catch (error) { message.textContent = error.message; message.className = 'form-message error-message'; }
    });
  }

  const itemForm = document.getElementById('itemForm');
  if (itemForm) {
    const quickAddCatBtn = document.getElementById('btnQuickAddCategory');
    const newCatInput = document.getElementById('newCategoryInput');
    if (quickAddCatBtn) {
      quickAddCatBtn.addEventListener('click', async () => {
        let name = newCatInput ? newCatInput.value.trim() : '';
        if (!name) {
          name = prompt('Nhập tên danh mục mới muốn tạo (ví dụ: Món ăn, Bánh ngọt, Đồ ăn vặt, Trà đặc biệt...):');
          if (name) name = name.trim();
        }
        if (!name) {
          if (newCatInput) newCatInput.focus();
          return;
        }
        try {
          const res = await CafeApp.api('/api/admin/categories', {
            method: 'POST',
            body: { categoryName: name }
          });
          showAdminToast(`Đã thêm danh mục mới: ${name}`);
          if (newCatInput) newCatInput.value = '';
          await loadCategories(res.categoryId);
        } catch (err) {
          alert(err.message || 'Lỗi khi tạo danh mục.');
        }
      });
    }

    if (newCatInput && quickAddCatBtn) {
      newCatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          quickAddCatBtn.click();
        }
      });
    }

    itemForm.addEventListener('submit', async event => {
      event.preventDefault();
      const message = document.getElementById('itemMessage');
      const itemName = document.getElementById('itemName').value.trim();
      try {
        const res = await CafeApp.api('/api/admin/menu-items', { method: 'POST', body: JSON.stringify({
          categoryId: Number(document.getElementById('itemCategory').value),
          itemName: itemName,
          description: document.getElementById('itemDescription').value.trim(),
          variantName: document.getElementById('variantName').value.trim(),
          price: Number(document.getElementById('variantPrice').value),
          available: true,
          imageUrl: newItemImageDataUrl || null
        })});
        if (newItemImageDataUrl && res && res.itemId) {
          CafeApp.setItemImage(res.itemId, itemName, newItemImageDataUrl);
        }
        message.textContent = 'Đã thêm món mới và giá thành công.'; 
        message.className = 'form-message success-message'; 
        event.target.reset();
        const vNameInput = document.getElementById('variantName');
        if (vNameInput) vNameInput.value = 'Phần';

        // Reset preview ảnh
        newItemImageDataUrl = null;
        if (previewImg) {
          previewImg.src = '';
          previewImg.classList.add('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
        if (clearNewItemImgBtn) clearNewItemImgBtn.classList.add('hidden');

        showAdminToast(`Đã thêm món: ${itemName}`);
        await loadCategories(); 
        await loadMenu();
      } catch (error) { message.textContent = error.message; message.className = 'form-message error-message'; }
    });
  }

  const toppingForm = document.getElementById('toppingForm');
  if (toppingForm) {
    toppingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('toppingFormMessage');
      const toppingName = document.getElementById('newToppingName').value.trim();
      const additionalPrice = Number(document.getElementById('newToppingPrice').value);
      const available = document.getElementById('newToppingActive').checked;
      try {
        await CafeApp.api('/api/admin/toppings', {
          method: 'POST',
          body: JSON.stringify({ toppingName, additionalPrice, available })
        });
        msg.textContent = `Đã thêm topping "${toppingName}" thành công!`;
        msg.className = 'form-message success-message';
        document.getElementById('newToppingName').value = '';
        showAdminToast(`Đã thêm topping: ${toppingName}`);
        await loadToppings();
        await loadMenu();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'form-message error-message';
      }
    });
  }

  // Sự kiện bộ lọc lịch sử đơn theo ngày
  const histDateInput = document.getElementById('historyDateInput');
  if (histDateInput) {
    histDateInput.value = currentHistoryDate;
    histDateInput.addEventListener('change', (e) => {
      if (e.target.value) loadHistoryOrders(e.target.value);
    });
  }
  const btnHistToday = document.getElementById('btnHistoryToday');
  if (btnHistToday) {
    btnHistToday.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      loadHistoryOrders(today);
    });
  }
  const btnHistYesterday = document.getElementById('btnHistoryYesterday');
  if (btnHistYesterday) {
    btnHistYesterday.addEventListener('click', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      loadHistoryOrders(yesterday);
    });
  }
  const btnRefreshHist = document.getElementById('btnRefreshHistory');
  if (btnRefreshHist) {
    btnRefreshHist.addEventListener('click', () => {
      loadHistoryOrders();
    });
  }

  // Sự kiện xem và phóng to mã QR của bàn
  document.getElementById('qrPreviewWrap')?.addEventListener('click', openLargeQrModal);
  document.getElementById('modalCloseX')?.addEventListener('click', closeLargeQrModal);
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeLargeQrModal);
  document.getElementById('qrModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'qrModal') closeLargeQrModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLargeQrModal();
  });
  document.getElementById('modalPrintBtn')?.addEventListener('click', () => {
    if (!selectedTableId) return;
    const url = `/api/admin/tables/${selectedTableId}/qr.png`;
    const w = window.open('', '_blank', 'width=600,height=650');
    if (!w) { alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép Popup.'); return; }
    w.document.write(`<html><head><title>In QR</title></head><body style="font-family:Arial;text-align:center;padding:30px"><img src="${url}" style="width:360px;height:360px"><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  });
});
