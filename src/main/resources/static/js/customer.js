let customerToken = null;
let customerTable = null;
let menuCategories = [];
let cartItems = [];
let allStoreToppings = [];
let currentCategoryFilter = 'ALL';
let searchKeyword = '';

function formatMoney(value) { return CafeApp.money(value); }

async function loadCustomerPage() {
  const params = new URLSearchParams(window.location.search);
  customerToken = params.get('token');
  const status = document.getElementById('tableStatus');
  const content = document.getElementById('menuContent');

  if (!customerToken) {
    if (status) status.innerHTML = '<span class="status-warning"><i class="fa-solid fa-triangle-exclamation"></i> Chưa xác định bàn</span>';
    content.innerHTML = `
      <div class="notice-card" style="padding: 40px 20px;">
        <i class="fa-solid fa-qrcode" style="font-size: 36px; margin-bottom: 12px; color: var(--coffee-accent); opacity: 0.8;"></i>
        <h3 style="font-size: 18px; margin-bottom: 6px; font-family: var(--font-display);">Vui lòng quét mã QR tại bàn</h3>
        <p class="muted">Mỗi bàn trong quán có một mã QR riêng. Quét mã tại bàn để mở thực đơn và gọi món đúng bàn của bạn.</p>
      </div>
    `;
    return;
  }

  try {
    const data = await CafeApp.api(`/api/public/menu?token=${encodeURIComponent(customerToken)}`);
    customerTable = data.table;
    menuCategories = data.categories || [];

    // Tải danh sách topping đang bán công khai từ server
    try {
      const publicToppings = await CafeApp.api('/api/public/toppings');
      if (Array.isArray(publicToppings) && publicToppings.length > 0) {
        allStoreToppings = publicToppings;
      }
    } catch (e) {
      // Fallback nếu API public toppings chưa khả dụng
    }

    if (!allStoreToppings.length) {
      const toppingMap = new Map();
      menuCategories.forEach(cat => {
        (cat.items || []).forEach(item => {
          (item.toppings || []).forEach(t => {
            const tid = t.toppingId || t.toppingid;
            const isAvail = (t.isAvailable !== undefined) ? t.isAvailable : ((t.isavailable !== undefined) ? t.isavailable : true);
            if (tid && !toppingMap.has(tid) && isAvail !== false && isAvail !== 'false' && isAvail !== 0) {
              toppingMap.set(tid, t);
            }
          });
        });
      });
      allStoreToppings = Array.from(toppingMap.values());
    }

    const tableText = `${customerTable.tableCode} · Bàn ${customerTable.tableNumber}`;
    if (status) {
      status.innerHTML = `<i class="fa-solid fa-chair"></i> Bạn đang đặt món tại: <b>${CafeApp.escape(tableText)}</b>`;
    }

    renderMenu(true);
  } catch (error) {
    if (status) status.innerHTML = '<span class="status-error"><i class="fa-solid fa-circle-xmark"></i> Không tìm thấy bàn</span>';
    content.innerHTML = `
      <div class="notice-card error-message" style="padding: 40px 20px;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; margin-bottom: 10px;"></i>
        <h3 style="margin-bottom: 6px;">${CafeApp.escape(error.message)}</h3>
        <p class="muted">Mã QR có thể không hợp lệ hoặc bàn đang tạm khóa. Vui lòng liên hệ nhân viên quán để được hỗ trợ.</p>
      </div>
    `;
  }
}

function getDrinkSubgroup(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('cà phê') || lower.includes('bạc xỉu')) return 'Cà phê';
  if (lower.includes('trà sữa')) return 'Trà sữa';
  if (lower.includes('trà ')) return 'Trà trái cây';
  return 'Khác';
}

function getCategoryIcon(subGroup) {
  const lower = (subGroup || '').toLowerCase();
  if (lower.includes('cà phê')) return 'fa-mug-hot';
  if (lower.includes('trà sữa')) return 'fa-whiskey-glass';
  if (lower.includes('trà')) return 'fa-lemon';
  if (lower.includes('snack') || lower.includes('bánh') || lower.includes('khoai')) return 'fa-cookie-bite';
  if (lower.includes('food') || lower.includes('ăn') || lower.includes('món')) return 'fa-utensils';
  if (lower.includes('khác')) return 'fa-glass-water';
  return 'fa-layer-group';
}

function isFoodItem(item) {
  const cat = (item.categoryName || '').toLowerCase();
  const sub = (item.subGroup || '').toLowerCase();
  const name = (item.itemName || '').toLowerCase();
  return cat === 'snacks' || cat.includes('snack') || cat.includes('food') || cat.includes('món ăn') || cat.includes('đồ ăn') || cat.includes('bánh') ||
         sub === 'snacks' || sub.includes('snack') || sub.includes('food') || sub.includes('món ăn') || sub.includes('đồ ăn') || sub.includes('bánh') ||
         name.includes('snack') || name.includes('bánh') || name.includes('khoai tây') || name.includes('heo quay');
}

function getAllItemsList() {
  let list = [];
  menuCategories.forEach(cat => {
    const catName = (cat.categoryName || '').trim();
    (cat.items || []).forEach(item => {
      let sub = catName;
      if (catName.toLowerCase() === 'đồ uống') {
        sub = getDrinkSubgroup(item.itemName);
      }
      list.push({ ...item, categoryId: cat.categoryId, categoryName: sub, subGroup: sub });
    });
  });
  return list;
}

/**
 * Render thực đơn phong cách website quán cafe
 */
function renderMenu(fullReset = false) {
  const container = document.getElementById('menuContent');
  if (!menuCategories.length) {
    container.innerHTML = '<div class="notice-card">Quán hiện chưa có món nào trong thực đơn.</div>';
    return;
  }

  const allItemsList = getAllItemsList();

  // Tạo danh sách các tab linh hoạt theo toàn bộ danh mục thực tế
  const subGroupNames = [];
  allItemsList.forEach(item => {
    if (item.subGroup && !subGroupNames.includes(item.subGroup)) {
      subGroupNames.push(item.subGroup);
    }
  });

  const counts = { ALL: allItemsList.length };
  subGroupNames.forEach(sg => {
    counts[sg] = allItemsList.filter(i => i.subGroup === sg).length;
  });

  let displayedItems = allItemsList;
  if (currentCategoryFilter !== 'ALL') {
    displayedItems = displayedItems.filter(i => i.subGroup === currentCategoryFilter);
  }
  if (searchKeyword.trim()) {
    displayedItems = displayedItems.filter(i =>
      CafeApp.matchSearch(i.itemName, searchKeyword) ||
      (i.description && CafeApp.matchSearch(i.description, searchKeyword))
    );
  }

  const existingNav = document.getElementById('cafeMenuHeader');
  if (fullReset || !existingNav) {
    container.innerHTML = `
      <!-- THANH TÌM KIẾM & BỘ LỌC DANH MỤC CỬA HÀNG -->
      <div class="cafe-menu-header" id="cafeMenuHeader">
        <div class="menu-search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="menuSearchInput" placeholder="Tìm tên món (bạc xỉu, trà đào, cà phê muối...)" value="${CafeApp.escape(searchKeyword)}" autocomplete="off">
          <button type="button" id="clearSearchBtn" class="clear-search ${searchKeyword ? '' : 'hidden'}"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="menu-tabs" id="cafeTabsContainer">
          ${renderTabButtons(counts, subGroupNames)}
        </div>
      </div>

      <!-- DANH SÁCH MÓN ĂN (DANH SÁCH CÓ ẢNH ĐẸP MẮT) -->
      <div class="cafe-dish-stream" id="cafeDishStream">
        <div class="section-heading" style="margin-top: 14px;">
          <div>
            <p class="eyebrow">${currentCategoryFilter === 'ALL' ? 'THỰC ĐƠN QUÁN' : currentCategoryFilter.toUpperCase()}</p>
            <h2>${currentCategoryFilter === 'ALL' ? 'Menu hôm nay' : currentCategoryFilter}</h2>
          </div>
          <span class="muted">${displayedItems.length} món đang bán</span>
        </div>
        ${renderProductList(displayedItems)}
      </div>
    `;
    bindSearchEvents();
    bindProductEvents();
  } else {
    // Chỉ cập nhật danh sách món để không mất focus ô tìm kiếm
    const stream = document.getElementById('cafeDishStream');
    if (stream) {
      stream.innerHTML = `
        <div class="section-heading" style="margin-top: 14px;">
          <div>
            <p class="eyebrow">${currentCategoryFilter === 'ALL' ? 'THỰC ĐƠN QUÁN' : currentCategoryFilter.toUpperCase()}</p>
            <h2>${currentCategoryFilter === 'ALL' ? 'Menu hôm nay' : currentCategoryFilter}</h2>
          </div>
          <span class="muted">${displayedItems.length} món đang bán</span>
        </div>
        ${renderProductList(displayedItems)}
      `;
    }
    const tabsContainer = document.getElementById('cafeTabsContainer');
    if (tabsContainer) {
      tabsContainer.innerHTML = renderTabButtons(counts, subGroupNames);
      bindTabEvents();
    }
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
      if (searchKeyword) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    bindProductEvents();
  }
}

function renderTabButtons(counts, subGroupNames = []) {
  let html = `
    <button type="button" class="menu-tab-btn ${currentCategoryFilter === 'ALL' ? 'active' : ''}" data-sub="ALL">
      Tất cả <span class="tab-count">${counts.ALL || 0}</span>
    </button>
  `;

  subGroupNames.forEach(sg => {
    const icon = getCategoryIcon(sg);
    const count = counts[sg] || 0;
    if (count > 0) {
      html += `
        <button type="button" class="menu-tab-btn ${currentCategoryFilter === sg ? 'active' : ''}" data-sub="${CafeApp.escape(sg)}">
          <i class="fa-solid ${icon}"></i> ${CafeApp.escape(sg)} <span class="tab-count">${count}</span>
        </button>
      `;
    }
  });
  return html;
}

function renderProductList(items) {
  if (!items.length) {
    return `
      <div class="empty-state" style="padding: 40px 16px; margin: 16px 0;">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 30px; opacity: 0.4; margin-bottom: 10px;"></i>
        <h4 style="font-size: 16px; margin-bottom: 4px;">Không tìm thấy món nào</h4>
        <p class="muted">Không có món nào phù hợp với từ khóa "<b>${CafeApp.escape(searchKeyword)}</b>".</p>
      </div>
    `;
  }
  return `<div class="cafe-dish-list">${items.map(item => renderDishRow(item)).join('')}</div>`;
}

/**
 * Render từng món theo dạng hàng ngang với ảnh vuông bo góc đẹp mắt (khách rất ưng ý)
 */
function renderDishRow(item) {
  const variants = item.variants || [];
  // Lấy danh sách topping cho món: ưu tiên item.toppings hoặc fallback toàn bộ topping quán đang bán
  const isFood = isFoodItem(item);
  // Đồ ăn / Snacks TUYỆT ĐỐI KHÔNG có topping
  const rawToppings = (!isFood && item.toppings && item.toppings.length > 0) ? item.toppings : (isFood ? [] : allStoreToppings);
  const availableToppings = isFood ? [] : rawToppings.filter(t => {
    const isAvail = (t.isAvailable !== undefined) ? t.isAvailable : ((t.isavailable !== undefined) ? t.isavailable : true);
    return isAvail !== false && isAvail !== 'false' && isAvail !== 0;
  });

  const imgSrc = CafeApp.getItemImage(item);
  const inCartCount = cartItems.filter(c => c.itemId === item.itemId).reduce((sum, c) => sum + c.quantity, 0);

  const minPrice = variants.length ? Math.min(...variants.map(v => v.price)) : 0;
  const maxPrice = variants.length ? Math.max(...variants.map(v => v.price)) : 0;
  const priceDisplay = variants.length ? (minPrice === maxPrice ? formatMoney(minPrice) : `${formatMoney(minPrice)} - ${formatMoney(maxPrice)}`) : 'Liên hệ';

  return `
    <article class="cafe-dish-card" data-item-id="${item.itemId}">
      <div class="dish-card-main">
        <!-- Cột ảnh món ăn có bo góc & badge giỏ hàng -->
        <div class="dish-photo-wrap">
          <img src="${imgSrc}" alt="${CafeApp.escape(item.itemName)}" class="dish-photo-img" loading="lazy" onerror="this.src=CafeApp.FALLBACK_DRINK_IMG">
          ${inCartCount > 0 ? `<div class="dish-cart-badge"><i class="fa-solid fa-check"></i> ${inCartCount}</div>` : ''}
        </div>

        <!-- Cột thông tin món -->
        <div class="dish-info-wrap">
          <span class="dish-sub-tag">${CafeApp.escape(item.subGroup || 'Menu')}</span>
          <h3 class="dish-name">${CafeApp.escape(item.itemName)}</h3>
          ${item.description ? `<p class="dish-desc">${CafeApp.escape(item.description)}</p>` : '<p class="dish-desc muted">Hương vị thơm ngon đặc trưng được pha chế theo công thức riêng của quán.</p>'}
          <div class="dish-price">${priceDisplay}</div>
        </div>

        <!-- Cột nút chọn nhanh Size & Topping -->
        <div class="dish-actions-wrap">
          <div class="size-pill-group">
            ${variants.map(v => {
              const vid = v.variantId || v.variantid;
              const vname = v.variantName || v.variantname;
              return `
                <button type="button" class="btn-cafe-size-add"
                  data-item-id="${item.itemId}"
                  data-item-name="${CafeApp.escape(item.itemName)}"
                  data-variant-id="${vid}"
                  data-variant-name="${CafeApp.escape(vname)}"
                  data-price="${v.price}"
                  title="Thêm Size ${CafeApp.escape(vname)}">
                  <span class="size-label">${CafeApp.escape(vname)}</span>
                  <span class="size-cost">${formatMoney(v.price)}</span>
                  <i class="fa-solid fa-plus size-icon"></i>
                </button>
              `;
            }).join('')}
          </div>

          ${availableToppings.length ? `
            <button type="button" class="btn-toggle-topping" data-item-id="${item.itemId}">
              <i class="fa-solid fa-circle-plus"></i> <span class="toggle-text">Chọn Topping (${availableToppings.length})</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Khay chọn topping mở rộng (nếu có) -->
      ${availableToppings.length ? `
        <div class="topping-drawer hidden" id="topping-drawer-${item.itemId}">
          <div class="topping-drawer-header">
            <span><i class="fa-solid fa-cookie-bite"></i> Topping ăn kèm (${availableToppings.length}):</span>
            <small class="muted">Tích chọn topping & bấm nút thêm vào giỏ bên dưới</small>
          </div>
          <div class="topping-pill-list">
            ${availableToppings.map(t => {
              const tid = t.toppingId || t.toppingid;
              const tname = t.toppingName || t.toppingname;
              const tprice = Number(t.additionalPrice || t.additionalprice || 0);
              return `
                <label class="topping-pill" data-item-id="${item.itemId}" data-topping-id="${tid}">
                  <input type="checkbox" class="compact-topping-checkbox" value="${tid}" data-name="${CafeApp.escape(tname)}" data-price="${tprice}">
                  <span class="topping-pill-title">${CafeApp.escape(tname)}</span>
                  <small class="topping-pill-price">+${formatMoney(tprice)}</small>
                </label>
              `;
            }).join('')}
          </div>

          <!-- KHUNG CHỌN SIZE & XÁC NHẬN THÊM VÀO GIỎ NGAY TRONG KHAY TOPPING -->
          <div class="topping-drawer-footer" id="drawer-footer-${item.itemId}">
            <div class="drawer-size-row">
              <span class="drawer-size-title">Chọn Size:</span>
              <div class="drawer-size-pill-group">
                ${variants.map((v, vidx) => {
                  const vid = v.variantId || v.variantid;
                  const vname = v.variantName || v.variantname;
                  return `
                    <label class="drawer-size-pill ${vidx === 0 ? 'selected' : ''}">
                      <input type="radio" name="drawer-size-${item.itemId}" class="drawer-size-radio" value="${vid}" data-name="${CafeApp.escape(vname)}" data-base-price="${v.price}" ${vidx === 0 ? 'checked' : ''}>
                      <span class="ds-name">Size ${CafeApp.escape(vname)}</span>
                      <span class="ds-price">${formatMoney(v.price)}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="drawer-actions-row">
              <button type="button" class="btn-drawer-add-cart" data-item-id="${item.itemId}" data-item-name="${CafeApp.escape(item.itemName)}">
                <i class="fa-solid fa-cart-plus"></i> <span class="btn-drawer-text">Thêm vào giỏ · ${formatMoney(variants[0]?.price || 0)}</span>
              </button>
              <button type="button" class="btn-drawer-update-cart hidden" data-item-id="${item.itemId}" data-item-name="${CafeApp.escape(item.itemName)}" title="Cập nhật topping cho ly đang có trong giỏ hàng">
                <i class="fa-solid fa-arrows-rotate"></i> <span class="btn-update-text">Cập nhật ly trong giỏ</span>
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

function bindSearchEvents() {
  const input = document.getElementById('menuSearchInput');
  if (input) {
    input.addEventListener('input', (e) => {
      searchKeyword = e.target.value;
      renderMenu(false);
    });
  }
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchKeyword = '';
      if (input) {
        input.value = '';
        input.focus();
      }
      renderMenu(false);
    });
  }
  bindTabEvents();
}

function bindTabEvents() {
  document.querySelectorAll('.menu-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategoryFilter = btn.dataset.sub;
      renderMenu(false);
    });
  });
}

function updateDishCardState(card) {
  if (!card) return;
  const itemId = Number(card.dataset.itemId);

  // 1. Danh sách topping đã tick trên thẻ này
  const checkedBoxes = [...card.querySelectorAll('.compact-topping-checkbox:checked')];
  const toppingIds = checkedBoxes.map(cb => Number(cb.value)).sort((a, b) => a - b);
  const toppingNames = checkedBoxes.map(cb => cb.dataset.name);
  const toppingCost = checkedBoxes.reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
  const allToppingCount = card.querySelectorAll('.compact-topping-checkbox').length;

  // 2. Size đang chọn trong drawer
  const selectedRadio = card.querySelector(`.drawer-size-radio:checked`) || card.querySelector(`.drawer-size-radio`);
  const basePrice = selectedRadio ? Number(selectedRadio.dataset.basePrice) : 0;
  const variantName = selectedRadio ? selectedRadio.dataset.name : '';
  const variantId = selectedRadio ? Number(selectedRadio.value) : 0;
  const totalWithTopping = basePrice + toppingCost;

  // Cập nhật kiểu dáng cho các radio size trong drawer
  card.querySelectorAll('.drawer-size-pill').forEach(pill => {
    const radio = pill.querySelector('.drawer-size-radio');
    if (radio && radio.checked) pill.classList.add('selected');
    else pill.classList.remove('selected');
  });

  // 3. Cập nhật nhãn nút Chọn Topping bên ngoài
  const toggleBtn = card.querySelector('.btn-toggle-topping');
  if (toggleBtn) {
    if (checkedBoxes.length > 0) {
      toggleBtn.classList.add('has-selected');
      toggleBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span class="toggle-text">Đã chọn ${checkedBoxes.length} topping (+${formatMoney(toppingCost)})</span>`;
    } else {
      toggleBtn.classList.remove('has-selected');
      toggleBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i> <span class="toggle-text">Chọn Topping (${allToppingCount})</span>`;
    }
  }

  // 4. Cập nhật các nút Size nhanh ở trên đầu thẻ món: giá hiển thị = giá Size + giá Topping (nếu có tick)
  card.querySelectorAll('.btn-cafe-size-add').forEach(btn => {
    const vPrice = Number(btn.dataset.price);
    const sizeCostEl = btn.querySelector('.size-cost');
    if (sizeCostEl) {
      if (toppingCost > 0) {
        sizeCostEl.textContent = formatMoney(vPrice + toppingCost);
      } else {
        sizeCostEl.textContent = formatMoney(vPrice);
      }
    }
  });

  // 5. Cập nhật nhãn nút Thêm vào giỏ hàng ngay bên trong drawer
  const drawerAddBtn = card.querySelector('.btn-drawer-add-cart');
  if (drawerAddBtn) {
    const btnText = drawerAddBtn.querySelector('.btn-drawer-text');
    if (btnText) {
      if (toppingNames.length > 0) {
        btnText.textContent = `Thêm vào giỏ: Size ${variantName} + ${toppingNames.length} Topping · ${formatMoney(totalWithTopping)}`;
      } else {
        btnText.textContent = `Thêm vào giỏ: Size ${variantName} · ${formatMoney(totalWithTopping)}`;
      }
    }
  }

  // 6. Kiểm tra xem món này đã có trong giỏ hàng chưa để hiển thị nút Cập nhật
  const existingInCart = cartItems.find(c => c.itemId === itemId && c.variantId === variantId);
  const drawerUpdateBtn = card.querySelector('.btn-drawer-update-cart');
  if (drawerUpdateBtn) {
    if (existingInCart) {
      drawerUpdateBtn.classList.remove('hidden');
      const updateText = drawerUpdateBtn.querySelector('.btn-update-text');
      if (updateText) {
        updateText.textContent = `Cập nhật ly trong giỏ (${formatMoney(totalWithTopping)})`;
      }
    } else {
      drawerUpdateBtn.classList.add('hidden');
    }
  }
}

function bindProductEvents() {
  // 1. Bấm nút Size nhanh ở hàng trên
  document.querySelectorAll('.btn-cafe-size-add').forEach(btn => {
    btn.onclick = () => {
      const card = btn.closest('.cafe-dish-card');
      const itemId = Number(btn.dataset.itemId);
      const itemName = btn.dataset.itemName;
      const variantId = Number(btn.dataset.variantId);
      const variantName = btn.dataset.variantName;
      const basePrice = Number(btn.dataset.price);

      // Lấy topping đã tick (nếu có)
      const toppingCheckboxes = card ? [...card.querySelectorAll('.compact-topping-checkbox:checked')] : [];
      const toppingIds = toppingCheckboxes.map(cb => Number(cb.value)).sort((a, b) => a - b);
      const toppingNames = toppingCheckboxes.map(cb => cb.dataset.name);
      const toppingCost = toppingCheckboxes.reduce((sum, cb) => sum + Number(cb.dataset.price), 0);

      addProductToCartDirect(itemId, itemName, variantId, variantName, basePrice, toppingIds, toppingNames, toppingCost);

      btn.classList.add('btn-clicked');
      setTimeout(() => btn.classList.remove('btn-clicked'), 250);
    };
  });

  // 2. Mở/Đóng drawer topping
  document.querySelectorAll('.btn-toggle-topping').forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.itemId;
      const drawer = document.getElementById(`topping-drawer-${itemId}`);
      const card = btn.closest('.cafe-dish-card');
      if (drawer) {
        const isHidden = drawer.classList.contains('hidden');
        drawer.classList.toggle('hidden');
        btn.classList.toggle('active', isHidden);
        if (isHidden && card) updateDishCardState(card);
      }
    };
  });

  // 3. Xử lý khi tick chọn topping
  document.querySelectorAll('.compact-topping-checkbox').forEach(cb => {
    cb.onchange = () => {
      const pill = cb.closest('.topping-pill');
      if (pill) {
        if (cb.checked) pill.classList.add('selected');
        else pill.classList.remove('selected');
      }
      const card = cb.closest('.cafe-dish-card');
      if (card) updateDishCardState(card);
    };
  });

  // 4. Xử lý khi đổi Size trong drawer
  document.querySelectorAll('.drawer-size-radio').forEach(radio => {
    radio.onchange = () => {
      const card = radio.closest('.cafe-dish-card');
      if (card) updateDishCardState(card);
    };
  });

  // 5. Nút "Thêm vào giỏ" ngay bên trong Drawer Topping
  document.querySelectorAll('.btn-drawer-add-cart').forEach(btn => {
    btn.onclick = () => {
      const card = btn.closest('.cafe-dish-card');
      if (!card) return;
      const itemId = Number(btn.dataset.itemId);
      const itemName = btn.dataset.itemName;
      const selectedRadio = card.querySelector('.drawer-size-radio:checked');
      if (!selectedRadio) return;
      const variantId = Number(selectedRadio.value);
      const variantName = selectedRadio.dataset.name;
      const basePrice = Number(selectedRadio.dataset.basePrice);

      const checkedBoxes = [...card.querySelectorAll('.compact-topping-checkbox:checked')];
      const toppingIds = checkedBoxes.map(cb => Number(cb.value)).sort((a, b) => a - b);
      const toppingNames = checkedBoxes.map(cb => cb.dataset.name);
      const toppingCost = checkedBoxes.reduce((sum, cb) => sum + Number(cb.dataset.price), 0);

      addProductToCartDirect(itemId, itemName, variantId, variantName, basePrice, toppingIds, toppingNames, toppingCost);

      btn.classList.add('btn-clicked');
      setTimeout(() => btn.classList.remove('btn-clicked'), 250);

      const drawer = card.querySelector('.topping-drawer');
      if (drawer) drawer.classList.add('hidden');
      const toggleBtn = card.querySelector('.btn-toggle-topping');
      if (toggleBtn) toggleBtn.classList.remove('active');
    };
  });

  // 6. Nút "Cập nhật ly trong giỏ" nếu khách đã lỡ thêm món trước rồi mới chọn Topping
  document.querySelectorAll('.btn-drawer-update-cart').forEach(btn => {
    btn.onclick = () => {
      const card = btn.closest('.cafe-dish-card');
      if (!card) return;
      const itemId = Number(btn.dataset.itemId);
      const selectedRadio = card.querySelector('.drawer-size-radio:checked');
      if (!selectedRadio) return;
      const variantId = Number(selectedRadio.value);

      const checkedBoxes = [...card.querySelectorAll('.compact-topping-checkbox:checked')];
      const toppingIds = checkedBoxes.map(cb => Number(cb.value)).sort((a, b) => a - b);
      const toppingNames = checkedBoxes.map(cb => cb.dataset.name);
      const toppingCost = checkedBoxes.reduce((sum, cb) => sum + Number(cb.dataset.price), 0);

      // Tìm món trùng itemId & variantId trong giỏ
      const existing = cartItems.find(c => c.itemId === itemId && c.variantId === variantId);
      if (existing) {
        existing.toppingIds = toppingIds;
        existing.toppingNames = toppingNames;
        existing.toppingCost = toppingCost;
        existing.key = `${variantId}:${toppingIds.join(',')}`;
        renderCart();
      }

      const drawer = card.querySelector('.topping-drawer');
      if (drawer) drawer.classList.add('hidden');
      const toggleBtn = card.querySelector('.btn-toggle-topping');
      if (toggleBtn) toggleBtn.classList.remove('active');
    };
  });

  // Khởi tạo trạng thái ban đầu cho toàn bộ thẻ món
  document.querySelectorAll('.cafe-dish-card').forEach(card => updateDishCardState(card));
}

function addProductToCartDirect(itemId, itemName, variantId, variantName, basePrice, toppingIds = [], toppingNames = [], toppingCost = 0) {
  const key = `${variantId}:${toppingIds.join(',')}`;
  const existing = cartItems.find(item => item.key === key);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + 1);
  } else {
    cartItems.push({
      key,
      itemId,
      itemName,
      variantId,
      variantName,
      basePrice,
      toppingIds,
      toppingNames,
      toppingCost,
      quantity: 1
    });
  }
  renderCart();

  const countBadge = document.getElementById('cartCount');
  if (countBadge) {
    countBadge.classList.add('badge-bounce');
    setTimeout(() => countBadge.classList.remove('badge-bounce'), 300);
  }

  const floatingBtn = document.getElementById('floatingCartBtn');
  if (floatingBtn) {
    floatingBtn.classList.remove('bounce');
    void floatingBtn.offsetWidth;
    floatingBtn.classList.add('bounce');
  }
}

function updateDishCartBadges() {
  document.querySelectorAll('.cafe-dish-card').forEach(card => {
    const itemId = Number(card.dataset.itemId);
    const count = cartItems.filter(c => c.itemId === itemId).reduce((sum, c) => sum + c.quantity, 0);
    const photoWrap = card.querySelector('.dish-photo-wrap');
    if (photoWrap) {
      let badge = photoWrap.querySelector('.dish-cart-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'dish-cart-badge';
          photoWrap.appendChild(badge);
        }
        badge.innerHTML = `<i class="fa-solid fa-check"></i> ${count}`;
      } else if (badge) {
        badge.remove();
      }
    }
    updateDishCardState(card);
  });
}

function renderCart() {
  const list = document.getElementById('cartList');
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartItems.reduce((sum, item) => sum + (item.basePrice + item.toppingCost) * item.quantity, 0);

  const cartCountEl = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const placeOrderBtn = document.getElementById('placeOrder');

  if (cartCountEl) cartCountEl.textContent = count;
  if (cartTotalEl) cartTotalEl.textContent = formatMoney(total);
  if (placeOrderBtn) placeOrderBtn.disabled = !cartItems.length || !customerToken;

  const floatingBadge = document.getElementById('floatingCartBadge');
  if (floatingBadge) floatingBadge.textContent = count;
  const floatingBtn = document.getElementById('floatingCartBtn');
  if (floatingBtn) {
    if (count > 0) {
      floatingBtn.classList.add('has-items');
    } else {
      floatingBtn.classList.remove('has-items');
    }
  }

  updateDishCartBadges();

  if (!cartItems.length) {
    if (list) list.innerHTML = '<p class="empty-state">Bạn chưa chọn món nào.</p>';
    return;
  }

  if (list) {
    list.innerHTML = cartItems.map((item, index) => {
      const linePrice = (item.basePrice + item.toppingCost) * item.quantity;
      return `
        <div class="cart-line">
          <div class="cart-line-header">
            <strong class="cart-item-title">${CafeApp.escape(item.itemName)}</strong>
            <span class="cart-line-price">${formatMoney(linePrice)}</span>
          </div>
          <div class="cart-line-meta">
            <span class="cart-pill-size">Size ${CafeApp.escape(item.variantName)}</span>
            ${item.toppingNames && item.toppingNames.length ? `
              <div class="cart-toppings-badge-list">
                ${item.toppingNames.map(name => `<span class="cart-topping-badge"><i class="fa-solid fa-cookie-bite"></i> +${CafeApp.escape(name)}</span>`).join('')}
              </div>
            ` : '<span class="cart-no-topping-text muted">(Không topping)</span>'}
          </div>
          <div class="cart-line-footer">
            <div class="quantity-controls">
              <button type="button" data-action="minus" data-index="${index}" title="Giảm số lượng">−</button>
              <span class="qty-display">${item.quantity}</span>
              <button type="button" data-action="plus" data-index="${index}" title="Tăng số lượng">+</button>
            </div>
            <button type="button" class="remove-btn" data-action="remove" data-index="${index}">
              <i class="fa-solid fa-trash-can"></i> Xóa
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('button[data-action]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const action = button.dataset.action;
      if (action === 'plus') cartItems[index].quantity = Math.min(20, cartItems[index].quantity + 1);
      if (action === 'minus') cartItems[index].quantity -= 1;
      if (action === 'remove' || cartItems[index].quantity <= 0) cartItems.splice(index, 1);
      renderCart();
    }));
  }
}

async function submitOrder() {
  if (!customerToken || !cartItems.length) return;
  const button = document.getElementById('placeOrder');
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi đơn...';

  try {
    const result = await CafeApp.api('/api/public/orders', {
      method: 'POST',
      body: JSON.stringify({
        qrToken: customerToken,
        customerNote: document.getElementById('customerNote').value.trim(),
        items: cartItems.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity,
          toppingIds: item.toppingIds
        }))
      })
    });

    const box = document.getElementById('orderResult');
    if (box) {
      box.classList.remove('hidden');
      box.innerHTML = `
        <div class="success-banner">
          <strong><i class="fa-solid fa-circle-check"></i> Đặt món thành công!</strong><br>
          Mã đơn: <b>${CafeApp.escape(result.orderCode)}</b><br>
          Bàn phục vụ: <b>${CafeApp.escape(result.tableNumber)}</b><br>
          Tổng thanh toán: <b>${formatMoney(result.totalAmount)}</b><br>
          <span class="muted"><i class="fa-solid fa-bell"></i> Quán đã nhận đơn và đang chuẩn bị đồ uống cho bạn.</span>
        </div>
      `;
    }

    cartItems = [];
    if (document.getElementById('customerNote')) document.getElementById('customerNote').value = '';
    renderCart();

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = !cartItems.length;
    button.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi đơn hàng';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCustomerPage();
  renderCart();
  const placeOrderBtn = document.getElementById('placeOrder');
  if (placeOrderBtn) placeOrderBtn.addEventListener('click', submitOrder);

  const floatingBtn = document.getElementById('floatingCartBtn');
  if (floatingBtn) {
    floatingBtn.addEventListener('click', () => {
      const cartPanel = document.querySelector('.cart-panel') || document.getElementById('cartList');
      if (cartPanel) {
        cartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
});
