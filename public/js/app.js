/* =====================================================================
   NEU Events – thư viện front-end dùng chung
   - Gọi REST API (fetch), định dạng dữ liệu, icon, toast, hộp thoại
   - Dựng sidebar + header theo thiết kế và phân quyền theo vai trò
   ===================================================================== */
(function () {
  'use strict';

  // ---------------- Icon (SVG lấy từ bộ thiết kế) ----------------
  const P = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    ticket1: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>',
    xcircle: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a3.5 3.5 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    filetext: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    tick: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    swap: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
    key: '<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/>',
    filter: '<path d="M3 6h18M7 12h10M10 18h4"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  };
  const icon = (name, attrs = '') =>
    `<svg ${attrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  const starSvg = (on) => `<svg class="${on ? '' : 'off'}" viewBox="0 0 24 24" fill="currentColor"><path d="${'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'}"/></svg>`;
  const stars = (n) => `<span class="stars" title="${n}/5">${[1, 2, 3, 4, 5].map((i) => starSvg(i <= Math.round(n))).join('')}</span>`;

  // ---------------- Định dạng ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (s) => { const d = toDate(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
  const fmtShort = (s) => { const d = toDate(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : '—'; };
  const fmtTime = (s) => (s ? String(s).slice(11, 16) : '—');
  const fmtDateTime = (s) => (s ? `${fmtTime(s)} • ${fmtDate(s)}` : '—');
  const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const fmtLongDate = (s) => { const d = toDate(s); return d ? `${WD[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}` : ''; };
  const weekday = (s) => { const d = toDate(s); return d ? WD[d.getDay()] : ''; };
  const fmtRange = (a, b) => (a && b && a.slice(0, 10) === b.slice(0, 10) ? `${fmtDate(a)} • ${fmtTime(a)}–${fmtTime(b)}` : `${fmtDateTime(a)} → ${fmtDateTime(b)}`);
  const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN'));
  const fmtPct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d).replace('.', ',')}%`);
  const fmtMoney = (n) => (n ? `${fmtNum(n)} đồng` : 'Không sử dụng kinh phí');
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const initials = (name) => { const w = String(name || '?').trim().split(/\s+/); return (w.length > 1 ? w[w.length - 2][0] + w[w.length - 1][0] : w[0].slice(0, 2)).toUpperCase(); };
  function ago(s) {
    const d = toDate(s); if (!d) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'Vừa xong'; if (m < 60) return `${m} phút trước`;
    const h = Math.round(m / 60); if (h < 24) return `${h} giờ trước`;
    const dd = Math.round(h / 24); if (dd < 8) return `${dd} ngày trước`;
    return fmtDate(s);
  }
  const toInput = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');
  const param = (k) => new URLSearchParams(location.search).get(k);

  // ---------------- Nhãn trạng thái ----------------
  const STATUS = {
    draft: ['Nháp', 'gray'], pending: ['Chờ duyệt', 'amber'], approved: ['Đã duyệt', 'green'], rejected: ['Đã từ chối', 'red'], cancelled: ['Đã hủy', 'red'],
    upcoming: ['Sắp diễn ra', ''], ongoing: ['Đang diễn ra', 'green'], ended: ['Đã kết thúc', 'gray'],
    present: ['Đã tham dự', 'green'], absent: ['Vắng mặt', 'red'], pending_att: ['Chưa điểm danh', 'amber'],
  };
  const tag = (key, text) => { const [t, c] = STATUS[key] || [key, '']; return `<span class="st ${c}">${esc(text || t)}</span>`; };
  const phaseTag = (e) => (e.status === 'approved' ? tag(e.phase) : tag(e.status));
  const ROLE = { student: 'Sinh viên', organizer: 'Ban tổ chức', admin: 'Đơn vị quản lý' };
  const LEVEL = { truong: 'Cấp Trường', khoa: 'Cấp Khoa/Viện', clb: 'Cấp Chi đoàn/CLB' };

  // Ảnh bìa mặc định theo loại sự kiện
  const COVER = { 'Học thuật': 'academic', 'Nghề nghiệp': 'career', 'Cộng đồng': 'community', 'Văn hóa': 'culture' };
  // Ảnh thật (Unsplash – miễn phí, giấy phép Unsplash License) cho sự kiện chưa tải ảnh bìa riêng.
  // Ảnh tải trực tiếp từ images.unsplash.com nên cần có Internet; nếu không tải được sẽ tự lùi về ảnh SVG.
  const UNS = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;
  const PHOTO_BY_CODE = {
    'NEU-GREEN-2026': '1758599669406-d5179ccefcb9', 'NEU-LOGI-2026': '1494412519320-aa613dfb7738',
    'NEU-CV-2026': '1517048676732-d65bc937f952', 'NEU-WELCOME-2026': '1470229722913-7c0e2dbbafd3',
    'NEU-PY-2026': '1551288049-bebda4e38f71', 'NEU-FIN-2026': '1772690445981-78b22eacda4b',
    'NEU-BLOOD-2026': '1615461066159-fea0960485d5', 'NEU-PBI-2026': '1460925895917-afdab827c52f',
    'NEU-CUP-2026': '1431324155629-1a6deb1dec8d', 'NEU-ASEAN-2026': '1463592177119-bab2a00f3ccb',
    'NEU-OLP-2026': '1503428593586-e225b39bddfe', 'NEU-START-2026': '1505373877841-8d25f7d46678',
    'NEU-DIGI-2026': '1540575467063-178a50c2df87', 'NEU-YBIZ-2026': '1775163560631-6ff15eb2fa1f',
    'NEU-SLIDE-2026': '1598520106830-8c45c2035460', 'NEU-RUN-2026': '1452626038306-9aae5e071dd3',
    'NEU-AI-2026': '1758270703878-de80505b6714',
  };
  const PHOTO_BY_CAT = {
    'Học thuật': '1524178232363-1fb2b075b655', 'Nghề nghiệp': '1560439514-4e9645039924',
    'Cộng đồng': '1582213782179-e0d53f98f2ca', 'Văn hóa': '1533174072545-7a4b6ad7a6c3',
  };
  const svgCover = (e) => `/img/cover-${COVER[e.category_name] || 'academic'}.svg`;
  const coverOf = (e) => e.cover_image || UNS(PHOTO_BY_CODE[e.code] || PHOTO_BY_CAT[e.category_name] || PHOTO_BY_CAT['Học thuật']);
  // Dùng cho background-image: ảnh thật phía trên, ảnh SVG phía dưới làm dự phòng khi mất mạng
  const coverBg = (e) => `url('${coverOf(e)}'), url('${svgCover(e)}')`;

  // ---------------- Gọi API ----------------
  async function api(url, { method = 'GET', body, form } = {}) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (form) opt.body = form;
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opt); } catch { throw new Error('Không kết nối được máy chủ. Kiểm tra server đã chạy chưa (npm start).'); }
    let data = null;
    try { data = await res.json(); } catch { /* không phải JSON */ }
    if (res.status === 401 && !url.startsWith('/api/auth/login')) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    if (!res.ok) throw new Error((data && data.error) || `Lỗi ${res.status}`);
    return data;
  }

  // ---------------- Toast & hộp thoại ----------------
  function toast(msg, type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 5500 : 3500);
  }

  /** modal({ title, desc, html, okText, cancelText, danger, wide, onOk(root) -> giá trị | throw }) */
  function modal({ title, desc = '', html = '', okText = 'Xác nhận', cancelText = 'Hủy', danger = false, wide = false, onOk, hideOk = false }) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'modal-back';
      back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>${desc ? `<p class="desc">${desc}</p>` : ''}<div class="m-alert"></div>${html}
        <div class="row-actions"><button class="btn-outline" data-x>${esc(cancelText)}</button>${hideOk ? '' : `<button class="${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`}</div></div>`;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      back.addEventListener('click', (e) => { if (e.target === back) close(null); });
      back.querySelector('[data-x]').onclick = () => close(null);
      const ok = back.querySelector('[data-ok]');
      if (ok) ok.onclick = async () => {
        ok.disabled = true;
        try { const v = onOk ? await onOk(back) : true; close(v === undefined ? true : v); }
        catch (err) { back.querySelector('.m-alert').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; ok.disabled = false; }
      };
      const first = back.querySelector('input, textarea, select'); if (first) setTimeout(() => first.focus(), 30);
    });
  }
  const confirmBox = (title, desc, okText = 'Đồng ý', danger = false) => modal({ title, desc, okText, danger });
  /** Hỏi lý do (bắt buộc) – trả về chuỗi hoặc null */
  function askReason(title, desc, { okText = 'Xác nhận', danger = false, min = 3, placeholder = 'Nhập lý do...' } = {}) {
    return modal({
      title, desc, okText, danger,
      html: `<label class="label">Lý do <span class="req">*</span></label><textarea class="inp" id="m-reason" placeholder="${esc(placeholder)}"></textarea>`,
      onOk: (root) => { const v = root.querySelector('#m-reason').value.trim(); if (v.length < min) throw new Error(`Vui lòng nhập lý do (tối thiểu ${min} ký tự).`); return v; },
    });
  }

  const emptyState = (title, text = '', ic = 'calendar') => `<div class="empty">${icon(ic)}<strong>${esc(title)}</strong>${esc(text)}</div>`;
  const loadingHtml = '<div class="loading"><span class="spinner"></span></div>';

  // ---------------- Layout: sidebar + header ----------------
  const HOME = { student: '/events.html', organizer: '/manage-events.html', admin: '/moderation.html' };

  // Menu bên trái: chỉ hiện các mục tài khoản có quyền sử dụng
  function sidebarHtml(user, active, badges) {
    const r = user.role;
    const item = (key, href, label, ic) => {
      const b = badges[key] ? `<span class="count-badge">${badges[key]}</span>` : '';
      return `<a href="${href}" class="nav-item ${active === key ? 'active' : ''}">${icon(ic)}${label}${b}</a>`;
    };
    const manage = r === 'student' ? '' : `
      <nav class="nav nav-manage">
        ${item('manage', '/manage-events.html', 'Quản lý sự kiện', 'folder')}
        ${r === 'admin' ? item('moderation', '/moderation.html', 'Kiểm duyệt', 'shield') : ''}
        ${r === 'admin' ? item('points', '/points.html', 'Duyệt điểm Đoàn', 'gift') : ''}
        ${item('reports', '/reports.html', 'Báo cáo – thống kê', 'chart')}
        ${r === 'admin' ? item('accounts', '/accounts.html', 'Tài khoản đơn vị', 'users') : ''}
      </nav>`;
    return `
      <a href="${HOME[r]}" class="brand"><img class="brand-logo-img" src="/img/logo-neu.png" alt="Logo Trường Đại học Kinh tế Quốc dân"><div><div class="brand-name">NEU Events</div><div class="brand-sub">Đại học Kinh tế Quốc dân</div></div></a>
      <nav class="nav nav-main">
        ${item('events', '/events.html', 'Sự kiện', 'calendar')}
        ${r === 'student' ? item('registered', '/registered.html', 'Đã đăng ký', 'ticket') : ''}
        ${item('attendance', '/attendance.html', 'Điểm danh', 'scan')}
        ${item('reviews', '/reviews.html', 'Đánh giá', 'chat')}
      </nav>${manage}
      <div class="support">
        <div class="group-title">Cần hỗ trợ?</div>
        <a href="/guide.html" class="nav-item ${active === 'guide' ? 'active' : ''}">${icon('help')}Hướng dẫn sử dụng</a>
        <a href="mailto:events@neu.edu.vn" class="mail">events@neu.edu.vn</a>
      </div>
      <div class="logout"><a href="#" class="nav-item" data-logout>${icon('logout')}Đăng xuất</a></div>`;
  }

  // Tên hiển thị theo vai trò: sinh viên – họ tên; ban tổ chức – tên đơn vị; đơn vị quản lý – "Đơn vị quản lý"
  function displayOf(user) {
    if (user.role === 'student') return { name: user.full_name, sub: `MSSV: ${user.code}`, av: initials(user.full_name) };
    if (user.role === 'organizer') return { name: user.unit_short || user.unit_name || user.full_name, sub: 'Ban tổ chức', av: 'BTC', title: user.unit_name };
    return { name: 'Đơn vị quản lý', sub: user.unit_short || user.unit_name || '', av: 'QL' };
  }

  // ---------------- Học kỳ đang xem (chọn ở thanh trên cùng, lưu trên trình duyệt) ----------------
  const TERM_KEY = 'neu.term';
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } } };
  function pickTerm(terms, current) {
    const saved = store.get(TERM_KEY);
    return terms.find((t) => t.key === saved) || terms.find((t) => t.key === current.key) || current;
  }
  function setTerm(key) { store.set(TERM_KEY, key); }

  function headerHtml(user, term, terms, unread) {
    const d = displayOf(user);
    return `
      <button class="icon-btn menu-btn" id="menuBtn" aria-label="Mở menu">${icon('menu')}</button>
      <a href="${HOME[user.role]}" class="brand"><img class="brand-logo-img" src="/img/logo-neu.png" alt="Logo Trường Đại học Kinh tế Quốc dân"><div><div class="brand-name">NEU Events</div><div class="brand-sub">Đại học Kinh tế Quốc dân</div></div></a>
      <div class="header-right">
        <label class="term-wrap" title="Chọn học kỳ – năm học để xem dữ liệu">${icon('calendar')}
          <select class="term-select" id="termSel" aria-label="Học kỳ">${terms.map((t) => `<option value="${t.key}" ${t.key === term.key ? 'selected' : ''}>${esc(t.short)}</option>`).join('')}</select>
        </label>
        <button class="icon-btn bell" id="bellBtn" aria-label="Thông báo">${icon('bell')}${unread ? `<span class="dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
        <span class="divider"></span>
        <button class="user" id="userBtn" aria-label="Tài khoản" title="${esc(d.title || d.name)}"><span class="avatar">${esc(d.av)}</span><span class="user-info"><div class="user-name">${esc(d.name)}</div><div class="user-id">${esc(d.sub)}</div></span>${icon('chevron', 'stroke-width="2"')}</button>
      </div>`;
  }

  // Breadcrumb: "NEU Events" bấm để về trang chính; mục cuối (trang hiện tại) in đậm
  function fixCrumbs(user) {
    document.querySelectorAll('.crumbs').forEach((c) => {
      if (!c.querySelector('.crumb-home')) c.innerHTML = c.innerHTML.replace(/^\s*NEU Events/, `<a href="${HOME[user.role]}" class="crumb-home">NEU Events</a>`);
      c.querySelectorAll('b').forEach((b) => { if (b !== c.lastElementChild) b.outerHTML = b.innerHTML; });
    });
  }

  const FOOTER = `<span>© ${new Date().getFullYear()} Đại học Kinh tế Quốc dân. Cổng thông tin sự kiện.</span><nav><a href="/guide.html#quy-dinh">Quy định sử dụng</a><a href="mailto:events@neu.edu.vn">Liên hệ hỗ trợ</a></nav>`;

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* bỏ qua */ }
    location.href = '/login.html';
  }

  function bindHeader(user) {
    const body = document.body;
    const menuBtn = document.getElementById('menuBtn');
    const scrim = document.getElementById('scrim') || Object.assign(document.createElement('div'), { className: 'scrim', id: 'scrim' });
    if (!scrim.parentNode) body.appendChild(scrim);
    if (menuBtn) menuBtn.onclick = () => body.classList.add('nav-open');
    scrim.onclick = () => body.classList.remove('nav-open');
    document.querySelectorAll('[data-logout]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); logout(); }));
    document.querySelectorAll('[data-locked]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(a.dataset.locked); }));

    // Dropdown thông báo
    const notif = document.createElement('div'); notif.className = 'dropdown'; body.appendChild(notif);
    const menu = document.createElement('div'); menu.className = 'dropdown menu-list'; body.appendChild(menu);
    menu.innerHTML = `<div class="who"><b>${esc(displayOf(user).name)}</b>${esc(user.email)}</div>
      <a href="/profile.html">${icon('user')}Hồ sơ cá nhân</a>
      <a href="/profile.html#password">${icon('key')}Đổi mật khẩu</a>
      <a href="/guide.html">${icon('help')}Hướng dẫn sử dụng</a>
      <button data-logout2>${icon('logout')}Đăng xuất</button>`;
    menu.querySelector('[data-logout2]').onclick = logout;
    const closeAll = () => { notif.classList.remove('open'); menu.classList.remove('open'); };
    document.addEventListener('click', (e) => { if (!notif.contains(e.target) && !menu.contains(e.target) && !e.target.closest('#bellBtn,#userBtn')) closeAll(); });
    document.getElementById('userBtn').onclick = () => { notif.classList.remove('open'); menu.classList.toggle('open'); };
    document.getElementById('bellBtn').onclick = async () => {
      menu.classList.remove('open');
      if (notif.classList.toggle('open')) {
        notif.innerHTML = loadingHtml;
        try {
          const d = await api('/api/me/notifications');
          notif.innerHTML = `<div class="dd-head">Thông báo ${d.unread ? `<a class="link" id="readAll">Đánh dấu đã đọc</a>` : ''}</div>` +
            (d.items.length ? d.items.map((n) => `<a class="dd-item ${n.is_read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-id="${n.id}"><b>${esc(n.title)}</b>${esc(n.body)}<small>${ago(n.created_at)}</small></a>`).join('')
              : emptyState('Chưa có thông báo', '', 'bell'));
          const ra = notif.querySelector('#readAll');
          if (ra) ra.onclick = async () => { await api('/api/me/notifications/read-all', { method: 'POST' }); notif.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread')); const dot = document.querySelector('.bell .dot'); if (dot) dot.remove(); ra.remove(); };
          notif.querySelectorAll('.dd-item').forEach((a) => a.addEventListener('click', () => { navigator.sendBeacon && navigator.sendBeacon(`/api/me/notifications/${a.dataset.id}/read`); }));
        } catch (err) { notif.innerHTML = `<div class="dd-item">${esc(err.message)}</div>`; }
      }
    };
  }

  /**
   * Khởi tạo trang có layout. Trả về { user, term }.
   *   App.init({ page: 'events', roles: ['student','organizer','admin'] })
   */
  async function init({ page, roles } = {}) {
    let me;
    try { me = await api('/api/auth/me'); } catch (e) { if (!String(e.message).includes('hết hạn')) document.body.innerHTML = `<div style="padding:40px;font:14px Inter,sans-serif">${esc(e.message)}</div>`; throw e; }
    const { user, unread, badges = {} } = me;
    const terms = me.terms || [me.term];
    const term = pickTerm(terms, me.term);
    const side = document.querySelector('.sidebar') || document.body.insertBefore(Object.assign(document.createElement('aside'), { className: 'sidebar' }), document.body.firstChild);
    side.setAttribute('aria-label', 'Điều hướng chính');
    side.innerHTML = sidebarHtml(user, page, badges);
    const header = document.querySelector('.header');
    header.innerHTML = headerHtml(user, term, terms, unread);
    document.getElementById('termSel').addEventListener('change', (e) => { setTerm(e.target.value); location.reload(); });
    fixCrumbs(user);
    const footer = document.querySelector('.footer'); if (footer) footer.innerHTML = FOOTER;
    bindHeader(user);
    if (roles && !roles.includes(user.role)) {
      const c = document.querySelector('.container');
      c.innerHTML = `<div class="card">${emptyState('Bạn không có quyền truy cập trang này', `Trang dành cho: ${roles.map((x) => ROLE[x]).join(', ')}.`, 'lock')}<div style="text-align:center"><a class="btn-primary" href="${HOME[user.role]}">Về trang chính</a></div></div>`;
      throw new Error('forbidden');
    }
    App.term = term; App.terms = terms; App.currentTerm = me.term;
    return { user, term, terms };
  }

  // Tải file (Excel) – dùng thẻ <a> để giữ cookie đăng nhập
  function download(url) { const a = document.createElement('a'); a.href = url; document.body.appendChild(a); a.click(); a.remove(); }

  window.App = {
    api, init, toast, modal, setTerm, displayOf, fixCrumbs, confirmBox, askReason, download, logout, HOME, ROLE, LEVEL,
    icon, stars, esc, nl2br, fmtDate, fmtShort, fmtTime, fmtDateTime, fmtLongDate, weekday, fmtRange, fmtNum, fmtPct, fmtMoney, fmtSize,
    initials, ago, toInput, param, tag, phaseTag, coverOf, coverBg, emptyState, loadingHtml, toDate,
  };
})();
