// ==========================================================================
// Cafe QR Ordering - Order Detail & Invoice Script (With Smart Fallback)
// ==========================================================================

const statusLabels = {
  NEW: 'Mới',
  CONFIRMED: 'Đã xác nhận',
  PREPARING: 'Đang làm',
  READY: 'Sẵn sàng',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy'
};

let currentOrderData = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await CafeApp.requireRole('MANAGER', 'STAFF');
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) adminNameEl.textContent = user.fullName || user.username;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => CafeApp.logout());

    const params = new URLSearchParams(window.location.search);
    const orderCode = params.get('orderCode') || params.get('code') || '';
    const orderId = params.get('orderId') || params.get('id') || '';

    if (!orderCode && !orderId) {
      showNotice('Không tìm thấy thông tin mã đơn hàng cần xem. Vui lòng quay lại danh sách.', 'warning');
      return;
    }

    await loadOrderDetail({ orderCode: orderCode.trim(), orderId: orderId.trim() });
  } catch (err) {
    console.error('Lỗi xác thực chi tiết đơn hàng:', err);
    window.location.href = '/login.html';
  }
});

function normalizeOrder(raw) {
  if (!raw) return null;
  const o = { ...raw };
  o.orderId = o.orderId || o.orderid || o.order_id;
  o.orderCode = o.orderCode || o.ordercode || o.order_code || '';
  o.tableNumber = o.tableNumber !== undefined ? o.tableNumber : (o.tablenumber !== undefined ? o.tablenumber : o.table_number);
  o.tableCode = o.tableCode || o.tablecode || o.table_code || (o.tableNumber ? `BAN${String(o.tableNumber).padStart(2, '0')}` : '');
  o.status = (o.status || 'NEW').toUpperCase();
  o.customerNote = o.customerNote || o.customernote || o.customer_note || '';
  o.totalAmount = Number(o.totalAmount || o.totalamount || o.total_amount || 0);
  o.createdAt = o.createdAt || o.createdat || o.created_at || new Date().toISOString();
  o.updatedAt = o.updatedAt || o.updatedat || o.updated_at || o.createdAt;
  o.staffName = o.staffName || o.staffname || o.staff_name || '';
  o.staffUsername = o.staffUsername || o.staffusername || o.staff_username || '';

  o.items = (o.items || []).map(item => {
    const it = { ...item };
    it.orderItemId = it.orderItemId || it.orderitemid || it.order_item_id;
    it.itemName = it.itemName || it.itemname || it.item_name || '';
    it.variantName = it.variantName || it.variantname || it.variant_name || 'Mặc định';
    it.baseUnitPrice = Number(it.baseUnitPrice || it.baseunitprice || it.base_unit_price || 0);
    it.toppingUnitTotal = Number(it.toppingUnitTotal || it.toppingunittotal || it.topping_unit_total || 0);
    it.quantity = Number(it.quantity || 1);
    it.lineTotal = Number(it.lineTotal || it.linetotal || it.line_total || ((it.baseUnitPrice + it.toppingUnitTotal) * it.quantity));
    it.toppings = (it.toppings || []).map(top => ({
      toppingName: top.toppingName || top.toppingname || top.topping_name || '',
      additionalPrice: Number(top.additionalPrice || top.additionalprice || top.additional_price || 0)
    }));
    return it;
  });

  return o;
}

async function loadOrderDetail({ orderCode, orderId }) {
  const container = document.getElementById('orderDetailContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-card" style="padding: 40px; text-align: center;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 28px; margin-bottom: 12px; color: var(--coffee-primary);"></i>
      <p class="muted">Đang tải chi tiết đơn hàng...</p>
    </div>
  `;

  let foundOrder = null;

  // 1. Thử gọi API chi tiết đơn hàng riêng (/api/staff/orders/detail)
  try {
    const qs = orderId ? `orderId=${encodeURIComponent(orderId)}` : `orderCode=${encodeURIComponent(orderCode)}`;
    foundOrder = await CafeApp.api(`/api/staff/orders/detail?${qs}`);
  } catch (err1) {
    console.warn('API /api/staff/orders/detail chưa có hoặc gặp lỗi, đang kích hoạt chế độ Fallback...', err1);
  }

  // 2. Fallback 1: Tìm trong danh sách đơn hàng gần đây (/api/staff/orders)
  if (!foundOrder) {
    try {
      const recentList = await CafeApp.api('/api/staff/orders');
      if (Array.isArray(recentList)) {
        foundOrder = recentList.find(o => {
          const c = o.orderCode || o.ordercode || o.order_code;
          const i = o.orderId || o.orderid || o.order_id;
          if (orderCode && c && c.trim().toUpperCase() === orderCode.trim().toUpperCase()) return true;
          if (orderId && i && Number(i) === Number(orderId)) return true;
          return false;
        });
      }
    } catch (err2) {
      console.warn('Fallback /api/staff/orders không thành công:', err2);
    }
  }

  // 3. Fallback 2: Tìm trong lịch sử theo ngày (/api/staff/orders/history?date=YYYY-MM-DD)
  if (!foundOrder && orderCode) {
    try {
      // Mã đơn có dạng CF-BAN01-20261115-5A324EF5 -> lấy ngày 2026-11-15
      const match = orderCode.match(/(20\d{2})(\d{2})(\d{2})/);
      let queryDate = new Date().toISOString().split('T')[0];
      if (match) {
        queryDate = `${match[1]}-${match[2]}-${match[3]}`;
      }
      const historyData = await CafeApp.api(`/api/staff/orders/history?date=${queryDate}`);
      if (historyData && Array.isArray(historyData.orders)) {
        foundOrder = historyData.orders.find(o => {
          const c = o.orderCode || o.ordercode || o.order_code;
          return c && c.trim().toUpperCase() === orderCode.trim().toUpperCase();
        });
      }
    } catch (err3) {
      console.warn('Fallback /api/staff/orders/history không thành công:', err3);
    }
  }

  // Nếu vẫn không tìm thấy
  if (!foundOrder) {
    showNotice(`Không tìm thấy đơn hàng "${orderCode || orderId}". Vui lòng kiểm tra lại mã đơn hoặc ngày đặt hàng.`, 'warning');
    return;
  }

  currentOrderData = normalizeOrder(foundOrder);
  renderOrderDetail(currentOrderData);
}

function showNotice(msg, type = 'error') {
  const container = document.getElementById('orderDetailContainer');
  if (!container) return;
  const isErr = type === 'error';
  container.innerHTML = `
    <div class="notice-card ${isErr ? 'error-message' : 'warning-message'}" style="padding: 30px; text-align: center; max-width: 600px; margin: 20px auto;">
      <i class="fa-solid ${isErr ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}" style="font-size: 32px; margin-bottom: 12px; color: ${isErr ? '#dc2626' : '#d97706'};"></i>
      <h3 style="margin-bottom: 8px;">${isErr ? 'Lỗi tải đơn hàng' : 'Thông báo'}</h3>
      <p class="muted" style="margin-bottom: 20px; font-size: 14px;">${CafeApp.escape(msg)}</p>
      <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
        <a href="/history.html" class="btn btn-secondary"><i class="fa-solid fa-arrow-left"></i> Quay lại Lịch sử</a>
        <a href="/admin.html" class="btn btn-primary"><i class="fa-solid fa-cubes"></i> Trang Đơn hàng</a>
      </div>
    </div>
  `;
}

function renderOrderDetail(order) {
  const container = document.getElementById('orderDetailContainer');
  if (!container) return;

  const statusText = statusLabels[order.status] || order.status;
  const createdTime = new Date(order.createdAt).toLocaleString('vi-VN');
  const updatedTime = order.updatedAt ? new Date(order.updatedAt).toLocaleString('vi-VN') : createdTime;
  const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  // Tính tổng giá trị gốc & topping
  let baseSum = 0;
  let toppingSum = 0;
  (order.items || []).forEach(item => {
    baseSum += Number(item.baseUnitPrice || 0) * Number(item.quantity || 1);
    toppingSum += Number(item.toppingUnitTotal || 0) * Number(item.quantity || 1);
  });

  const nextOptions = {
    NEW: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
    CONFIRMED: ['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
    PREPARING: ['READY', 'COMPLETED', 'CANCELLED'],
    READY: ['COMPLETED', 'CANCELLED']
  };
  const availableNext = nextOptions[order.status] || [];

  container.innerHTML = `
    <article class="order-invoice-card">
      <!-- HEADER PHIẾU HÓA ĐƠN -->
      <div class="invoice-header">
                <div class="invoice-brand">
          <div class="brand-mark" style="width: auto; height: 44px; border-radius: 8px; overflow: hidden; padding: 0; border: 1px solid #d9c3ad; background: #2b170e;">
            <img src="/images/logo.png?v=20261117_v12" alt="QR Cà Phê Tây Nguyên" class="brand-logo-img" style="height: 44px; width: auto; max-width: 140px; object-fit: contain; display: block; border-radius: 8px;">
          </div>
          <div>
            <h2 class="invoice-brand-title">QR CÀ PHÊ TÂY NGUYÊN</h2>
            <p class="muted" style="margin: 0; font-size: 13px;">Phiếu thanh toán & Chi tiết đặt món tại bàn</p>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="status-badge status-${order.status.toLowerCase()}" style="font-size: 13.5px; padding: 6px 14px;">
            ● ${statusText}
          </span>
        </div>
      </div>

      <!-- METADATA ĐƠN HÀNG -->
      <div class="invoice-meta-grid">
        <div class="invoice-meta-item">
          <span class="invoice-meta-label">MÃ ĐƠN HÀNG</span>
          <span class="invoice-meta-value" style="font-family: monospace; font-size: 13.5px; word-break: break-all;">
            ${CafeApp.escape(order.orderCode)}
            <button type="button" class="btn btn-small btn-outline no-print" onclick="copyOrderCode('${CafeApp.escape(order.orderCode)}')" title="Sao chép mã đơn" style="padding: 2px 7px; margin-left: 4px; font-size: 11px;">
              <i class="fa-regular fa-copy"></i>
            </button>
          </span>
        </div>
        <div class="invoice-meta-item">
          <span class="invoice-meta-label">VỊ TRÍ BÀN</span>
          <span class="invoice-meta-value">
            <span class="table-num-pill" style="font-size: 13.5px; padding: 4px 12px;">
              <i class="fa-solid fa-chair"></i> Bàn ${order.tableNumber}
            </span>
            <small class="muted" style="margin-left: 4px;">(${order.tableCode})</small>
          </span>
        </div>
        <div class="invoice-meta-item">
          <span class="invoice-meta-label">THỜI GIAN ĐẶT</span>
          <span class="invoice-meta-value"><i class="fa-regular fa-clock"></i> ${createdTime}</span>
        </div>
        <div class="invoice-meta-item">
          <span class="invoice-meta-label">NHÂN VIÊN XỬ LÝ</span>
          <span class="invoice-meta-value">
            <i class="fa-solid fa-user-check"></i> ${order.staffName ? CafeApp.escape(order.staffName) : '<span class="muted">Tự động / Chưa phân công</span>'}
          </span>
        </div>
      </div>

      <!-- GHI CHÚ KHÁCH HÀNG (NẾU CÓ) -->
      ${order.customerNote ? `
        <div class="invoice-note-box">
          <i class="fa-solid fa-message" style="margin-top: 2px;"></i>
          <div>
            <strong>Ghi chú của khách hàng:</strong>
            <p style="margin: 3px 0 0 0;">${CafeApp.escape(order.customerNote)}</p>
          </div>
        </div>
      ` : ''}

      <!-- BẢNG CHI TIẾT MÓN ĂN & TOPPING -->
      <table class="invoice-items-table">
        <thead>
          <tr>
            <th style="width: 45px;">STT</th>
            <th>Tên món & Lựa chọn</th>
            <th style="width: 120px; text-align: right;">Đơn giá</th>
            <th style="width: 70px; text-align: center;">SL</th>
            <th style="width: 130px; text-align: right;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map((item, idx) => {
            const hasToppings = (item.toppings || []).length > 0;
            return `
              <tr>
                <td style="font-weight: 700; color: #8c7362;">#${idx + 1}</td>
                <td>
                  <strong style="color: var(--coffee-darkest); font-size: 14.5px;">${CafeApp.escape(item.itemName)}</strong>
                  <span class="muted" style="font-size: 12.5px;">(${CafeApp.escape(item.variantName)})</span>
                  ${hasToppings ? `
                    <div style="margin-top: 6px;">
                      ${item.toppings.map(t => `
                        <span class="invoice-topping-tag">
                          + ${CafeApp.escape(t.toppingName)} <small>(+${CafeApp.money(t.additionalPrice)})</small>
                        </span>
                      `).join('')}
                    </div>
                  ` : ''}
                </td>
                <td style="text-align: right;">
                  <div>${CafeApp.money(item.baseUnitPrice)}</div>
                  ${item.toppingUnitTotal > 0 ? `
                    <small class="muted">+${CafeApp.money(item.toppingUnitTotal)} top</small>
                  ` : ''}
                </td>
                <td style="text-align: center; font-weight: 700; font-size: 15px;">
                  x${item.quantity}
                </td>
                <td style="text-align: right; font-weight: 700; color: var(--coffee-darkest); font-size: 14.5px;">
                  ${CafeApp.money(item.lineTotal)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- TỔNG KẾT THANH TOÁN -->
      <div class="invoice-totals">
        <div class="invoice-total-row">
          <span>Tiền món gốc:</span>
          <strong>${CafeApp.money(baseSum)}</strong>
        </div>
        ${toppingSum > 0 ? `
          <div class="invoice-total-row">
            <span>Tổng phụ thu Topping:</span>
            <strong>+${CafeApp.money(toppingSum)}</strong>
          </div>
        ` : ''}
        <div class="invoice-total-row grand-total">
          <span>TỔNG CỘNG:</span>
          <span style="color: #b45309;">${CafeApp.money(order.totalAmount)}</span>
        </div>
      </div>

      <!-- FOOTER THAO TÁC / IN PHIẾU -->
      <div class="invoice-actions-footer no-print">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${!isTerminal && availableNext.length ? `
            <span style="font-size: 13px; font-weight: 600; color: var(--coffee-darkest);">Chuyển trạng thái:</span>
            <select id="detailStatusSelect" style="padding: 6px 10px; border-radius: 6px; font-size: 13px; border: 1px solid var(--border-line);">
              ${availableNext.map(st => `<option value="${st}">${statusLabels[st] || st}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-small" id="btnUpdateStatus">
              <i class="fa-solid fa-check"></i> Cập nhật
            </button>
          ` : `
            <span class="small-note"><i class="fa-solid fa-circle-check"></i> Đơn hàng đã hoàn thành / kết thúc.</span>
          `}
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn btn-primary btn-small" onclick="window.print()">
            <i class="fa-solid fa-print"></i> In hóa đơn
          </button>
          <a href="/history.html" class="btn btn-secondary btn-small">
            <i class="fa-solid fa-arrow-left"></i> Lịch sử đơn
          </a>
        </div>
      </div>
    </article>
  `;

  const btnUpdate = document.getElementById('btnUpdateStatus');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', async () => {
      const select = document.getElementById('detailStatusSelect');
      const targetStatus = select ? select.value : null;
      if (!targetStatus) return;

      try {
        await CafeApp.api(`/api/staff/orders/${order.orderId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: targetStatus })
        });
        alert(`Đã cập nhật trạng thái đơn sang: ${statusLabels[targetStatus] || targetStatus}`);
        await loadOrderDetail({ orderId: order.orderId, orderCode: order.orderCode });
      } catch (e) {
        alert(e.message || 'Không thể cập nhật trạng thái.');
      }
    });
  }
}

function copyOrderCode(code) {
  if (!navigator.clipboard) {
    const input = document.createElement('input');
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  } else {
    navigator.clipboard.writeText(code);
  }
  alert(`Đã sao chép mã đơn: ${code}`);
}
