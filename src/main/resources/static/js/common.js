window.CafeApp = {
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  money(value) {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' ₫';
  },

  async api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) }
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data?.message || `Yêu cầu thất bại (${response.status})`);
    return data;
  },

  async requireRole(role) {
    const me = await this.api('/api/auth/me');
    if (me.role !== role && !(Array.isArray(role) && role.includes(me.role))) throw new Error('Bạn không có quyền truy cập trang này.');
    return me;
  },

  async logout() {
    await this.api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  },

  /* ==========================================================================
     TÌM KIẾM TIẾNG VIỆT THÔNG MINH (HỖ TRỢ KHÔNG DẤU, TELEX & VIẾT TẮT)
     ========================================================================== */
  removeVietnameseTones(str) {
    if (!str) return '';
    str = String(str).toLowerCase().trim();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    // Thay thế một số gõ Telex thông dụng: dd->d, aa->a, ee->e, oo->o, aw->a, ow->o, uw->u
    str = str.replace(/dd/g, 'd').replace(/aa/g, 'a').replace(/ee/g, 'e').replace(/oo/g, 'o');
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  slugify(str) {
    return this.removeVietnameseTones(str)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  stripTelexTones(word) {
    return word.replace(/[sfrxj]$/i, '');
  },

  matchSearch(targetText, query) {
    if (!query || !query.trim()) return true;
    const qClean = this.removeVietnameseTones(query);
    const tClean = this.removeVietnameseTones(targetText);

    // 1. Khớp chuỗi trực tiếp
    if (tClean.includes(qClean)) return true;

    // 2. Khớp khi bỏ khoảng trắng (vd: olong -> o long, ca phe -> caphe)
    const tNoSpace = tClean.replace(/\s+/g, '');
    const qNoSpace = qClean.replace(/\s+/g, '');
    if (tNoSpace.includes(qNoSpace)) return true;

    // 3. Khớp chữ cái đầu (Acronym, vd: bx -> Bạc xỉu, cpm -> Cà phê muối, cpsd -> Cà phê sữa đá)
    const targetWords = tClean.split(/\s+/).filter(Boolean);
    const initials = targetWords.map(w => w[0]).join('');
    if (initials.includes(qClean)) return true;

    // 4. Khớp từng từ (hỗ trợ Telex chưa hoàn chỉnh, vd: bas -> ba -> Bạc xỉu, cas -> Cà phê)
    const qWords = qClean.split(/\s+/).filter(Boolean);
    return qWords.every(qw => {
      if (targetWords.some(tw => tw.includes(qw) || tw.startsWith(qw))) return true;
      const stripped = this.stripTelexTones(qw);
      if (stripped.length >= 2 && targetWords.some(tw => tw.startsWith(stripped))) return true;
      return false;
    });
  },

  /* ==========================================================================
     KHO ẢNH ĐỒ UỐNG CHUẨN CAFE & QUẢN LÝ ẢNH MÓN
     ========================================================================== */
  FALLBACK_DRINK_IMG: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none"><rect width="160" height="160" rx="20" fill="%23f5ebe1"/><circle cx="80" cy="80" r="48" fill="%23e8d6c4"/><path d="M56 64h48v32a24 24 0 01-24 24 24 24 0 01-24-24V64z" fill="%233d2314"/><path d="M104 74h8a8 8 0 018 8 8 8 0 01-8 8h-8V74z" stroke="%233d2314" stroke-width="4"/><path d="M72 50c0-6 4-6 4-12M80 50c0-6 4-6 4-12M88 50c0-6 4-6 4-12" stroke="%23c29b7a" stroke-width="3" stroke-linecap="round"/></svg>',
  FALLBACK_SNACK_IMG: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none"><rect width="160" height="160" rx="20" fill="%23fdf5eb"/><circle cx="80" cy="80" r="48" fill="%23f0dfc8"/><path d="M52 90c0-16 12-28 28-28s28 12 28 28H52z" fill="%23d49354"/><circle cx="70" cy="80" r="3" fill="%233d2314"/><circle cx="90" cy="80" r="3" fill="%233d2314"/><circle cx="80" cy="72" r="3" fill="%233d2314"/></svg>',

  DEFAULT_DRINK_IMAGES: {
    'bac-xiu': '/images/drinks/bac-xiu.jpg?v=20261117_v15',
    'ca-phe-sua-da': '/images/drinks/ca-phe-sua-da.jpg?v=20261117_v15',
    'ca-phe-den-da': '/images/drinks/ca-phe-den-da.jpg?v=20261117_v15',
    'ca-phe-muoi': '/images/drinks/ca-phe-muoi.jpg?v=20261117_v15',
    'tra-sua': '/images/drinks/tra-sua.jpg?v=20261117_v15',
    'tra-sua-thai-xanh': '/images/drinks/tra-sua-thai-xanh.jpg?v=20261117_v15',
    'tra-sua-o-long-trung-nuong': '/images/drinks/tra-sua-o-long-trung-nuong.jpg?v=20261117_v15',
    'tra-sua-truyen-thong': '/images/drinks/tra-sua-truyen-thong.jpg?v=20261117_v15',
    'tra-sua-dua-nuong': '/images/drinks/tra-sua-dua-nuong.jpg?v=20261117_v15',
    'tra-dao': '/images/drinks/tra-dao.jpg?v=20261117_v15',
    'tra-luu': '/images/drinks/tra-luu.jpg?v=20261117_v15',
    'tra-mang-cau': '/images/drinks/tra-mang-cau.jpg?v=20261117_v15',
    'tra-nhiet-doi': '/images/drinks/tra-nhiet-doi.jpg?v=20261117_v15',
    'tra-da-me': '/images/drinks/tra-da-me.jpg?v=20261117_v15',
    'tra-tac': '/images/drinks/tra-tac.jpg?v=20261117_v15',
    'tra-oi-hong': '/images/drinks/tra-oi-hong.jpg?v=20261117_v15',
    'tra-dau-tam': '/images/drinks/tra-dau-tam.jpg?v=20261117_v15',
    'sua-chua-da-bao': '/images/drinks/sua-chua-da-bao.jpg?v=20261117_v15',
    'sua-bap': '/images/drinks/sua-bap.jpg?v=20261117_v15',
    'sua-dau-nanh': '/images/drinks/sua-dau-nanh.jpg?v=20261117_v15'
  },

  getItemImage(item) {
    if (!item) return this.FALLBACK_DRINK_IMG;
    const id = item.itemId;
    const name = item.itemName || '';
    const slug = this.slugify(name);

    // 1. Nếu item có image_url trả về từ server (đồng bộ mọi thiết bị máy tính + điện thoại)
    if (item.imageUrl || item.image_url) {
      return item.imageUrl || item.image_url;
    }
    // 2. Kiểm tra ảnh tùy chỉnh do Admin tải lên trong localStorage theo ID
    if (id) {
      const customById = localStorage.getItem('cafeqr_item_img_' + id);
      if (customById) return customById;
    }
    // 3. Kiểm tra ảnh tùy chỉnh theo slug tên món
    if (slug) {
      const customBySlug = localStorage.getItem('cafeqr_item_img_slug_' + slug);
      if (customBySlug) return customBySlug;
    }
    // 4. Kiểm tra ảnh mặc định cục bộ theo slug chính xác
    if (this.DEFAULT_DRINK_IMAGES && this.DEFAULT_DRINK_IMAGES[slug]) {
      return this.DEFAULT_DRINK_IMAGES[slug];
    }
    // 5. Kiểm tra nhóm đồ uống liên quan
    if (slug.includes('ca-phe') || slug.includes('bac-xiu')) {
      return this.DEFAULT_DRINK_IMAGES['ca-phe-sua-da'];
    }
    if (slug.includes('tra-sua')) {
      return this.DEFAULT_DRINK_IMAGES['tra-sua'];
    }
    if (slug.includes('tra')) {
      return this.DEFAULT_DRINK_IMAGES['tra-dao'];
    }
    if (slug.includes('sua')) {
      return this.DEFAULT_DRINK_IMAGES['sua-bap'];
    }
    if (item.categoryName === 'Snacks' || (item.categoryName && item.categoryName.toLowerCase().includes('snack')) || slug.includes('snack') || slug.includes('khoai') || slug.includes('banh') || slug.includes('heo-quay')) {
      return '/images/imgsFood/images.jpg?v=20261117_v15';
    }
    return this.FALLBACK_DRINK_IMG;
  },

  setItemImage(itemId, itemName, dataUrl) {
    if (itemId) {
      localStorage.setItem('cafeqr_item_img_' + itemId, dataUrl);
    }
    if (itemName) {
      const slug = this.slugify(itemName);
      localStorage.setItem('cafeqr_item_img_slug_' + slug, dataUrl);
    }
  },

  resetItemImage(itemId, itemName) {
    if (itemId) localStorage.removeItem('cafeqr_item_img_' + itemId);
    if (itemName) localStorage.removeItem('cafeqr_item_img_slug_' + this.slugify(itemName));
  },

  hasCustomImage(itemId, itemName) {
    if (itemId && localStorage.getItem('cafeqr_item_img_' + itemId)) return true;
    if (itemName && localStorage.getItem('cafeqr_item_img_slug_' + this.slugify(itemName))) return true;
    return false;
  },

  /**
   * Nén ảnh trực tiếp từ file (canvas) để giảm kích thước lưu trữ (15-25KB)
   */
  compressImage(file, maxWidth = 300, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Vui lòng chọn một file hình ảnh (PNG, JPG, WebP...).'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Đọc file thất bại.'));
      reader.readAsDataURL(file);
    });
  }
};

// ==========================================================================
// TỰ ĐỘNG KHỞI TẠO NÚT "CUỘN LÊN ĐẦU TRANG" (BACK TO TOP) CHO TOÀN BỘ WEBSITE
// ==========================================================================
function setupBackToTopButton() {
  let btn = document.getElementById('backToTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'backToTopBtn';
    btn.className = 'back-to-top-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', 'Cuộn lên đầu trang');
    btn.setAttribute('aria-label', 'Cuộn lên đầu trang');
    btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    document.body.appendChild(btn);
  }

  const getScroll = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

  const onScroll = () => {
    if (getScroll() > 60) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupBackToTopButton);
} else {
  setupBackToTopButton();
}
