const statusLabels = {
  NEW: 'Mới', CONFIRMED: 'Đã xác nhận', PREPARING: 'Đang chuẩn bị',
  READY: 'Sẵn sàng', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy'
};
const nextStatuses = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [], CANCELLED: []
};

async function initStaff() {
  try {
    const me = await CafeApp.requireRole(['STAFF', 'MANAGER']);
    document.getElementById('staffName').textContent = me.fullName;
    await loadOrders();
  } catch (error) { window.location.href = '/login.html'; }
}

async function loadOrders() {
  const container = document.getElementById('ordersList');
  container.innerHTML = '<div class="loading-card">Đang tải đơn hàng...</div>';
  try {
    const orders = await CafeApp.api('/api/staff/orders');
    if (!orders.length) { container.innerHTML = '<div class="notice-card">Chưa có đơn hàng nào.</div>'; return; }
    container.innerHTML = orders.map(order => {
      const options = (nextStatuses[order.status] || []).map(s => `<option value="${s}">${statusLabels[s]}</option>`).join('');
      return `<article class="order-card">
        <div class="order-card-head"><div><span class="eyebrow">MÃ ĐƠN</span><h3>${CafeApp.escape(order.orderCode)}</h3></div><span class="status-badge status-${order.status.toLowerCase()}">${statusLabels[order.status] || order.status}</span></div>
        <div class="order-meta"><strong>Bàn ${order.tableNumber}</strong><span>${new Date(order.createdAt).toLocaleString('vi-VN')}</span></div>
        ${order.customerNote ? `<p class="order-note">Ghi chú: ${CafeApp.escape(order.customerNote)}</p>` : ''}
        <div class="order-items">${(order.items || []).map(item => `<div class="order-item-line"><div><strong>${CafeApp.escape(item.itemName)}</strong><small>${CafeApp.escape(item.variantName)} · SL ${item.quantity}</small>${(item.toppings || []).length ? `<small>Topping: ${item.toppings.map(t => CafeApp.escape(t.toppingName)).join(', ')}</small>` : ''}</div><span>${CafeApp.money(item.lineTotal)}</span></div>`).join('')}</div>
        <div class="order-total"><span>Tổng cộng</span><strong>${CafeApp.money(order.totalAmount)}</strong></div>
        ${options ? `<div class="status-update"><select id="status-${order.orderId}">${options}</select><button class="btn btn-primary btn-small update-status" data-order-id="${order.orderId}"><i class="fa-solid fa-check"></i> Cập nhật</button></div>` : '<p class="small-note">Đơn đã ở trạng thái kết thúc.</p>'}
      </article>`;
    }).join('');
    container.querySelectorAll('.update-status').forEach(button => button.addEventListener('click', () => updateStatus(Number(button.dataset.orderId))));
  } catch (error) { container.innerHTML = `<div class="notice-card error-message">${CafeApp.escape(error.message)}</div>`; }
}

async function updateStatus(orderId) {
  const status = document.getElementById(`status-${orderId}`).value;
  try {
    await CafeApp.api(`/api/staff/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadOrders();
  } catch (error) { alert(error.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  initStaff();
  document.getElementById('refreshOrders').addEventListener('click', loadOrders);
  document.getElementById('logoutBtn').addEventListener('click', () => CafeApp.logout());
});
