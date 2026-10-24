// Trang Khám phá sự kiện (mọi vai trò)
// - Lọc theo trạng thái (tab), từ khóa, loại, đơn vị (gửi lên máy chủ)
// - Lọc nhanh theo thời gian / còn chỗ / chủ đề (chip, lọc tại trình duyệt)
// - Hai kiểu xem: Lưới và Theo ngày (timeline)
(async function () {
  const { api, esc, icon, fmtTime, fmtNum, toast, coverBg } = App;
  let user;
  try { ({ user } = await App.init({ page: 'events' })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let phase = App.param('phase') || '';
  let when = '';
  let all = [];
  let pool = [];      // mọi sự kiện (không theo bộ lọc) – dùng cho dải nổi bật, lịch tháng
  let day = '';       // ngày đang chọn trên lịch (YYYY-MM-DD)
  const VIEW_KEY = 'neu.events.view';
  let view = (() => { try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch { return 'grid'; } })();

  if (user.role !== 'student') $('headActions').innerHTML = `<a class="btn-primary" href="/event-form.html">${icon('plus')}Tạo sự kiện</a>`;
  else $('headActions').innerHTML = `<a class="btn-outline" href="/registered.html">${icon('ticket')}Sự kiện đã đăng ký</a>`;

  const meta = await api('/api/meta');
  $('category').insertAdjacentHTML('beforeend', meta.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));
  $('unit').insertAdjacentHTML('beforeend', meta.units.map((u) => `<option value="${u.id}">${esc(u.short_name || u.name)}</option>`).join(''));
  $('catChips').insertAdjacentHTML('beforeend', `<button class="chip on" data-cat="">Tất cả</button>` +
    meta.categories.map((c) => `<button class="chip" data-cat="${c.id}">${esc(c.name)}</button>`).join(''));
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.phase === phase));

  // ---------- Thời gian ----------
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function inWhen(e) {
    const now = new Date(); const today = startOfDay(now);
    const s = App.toDate(e.start_at); const en = App.toDate(e.end_at);
    const overlap = (a, b) => s < b && en >= a;
    switch (when) {
      case 'today': return overlap(today, addDays(today, 1));
      case 'week': return overlap(now, addDays(today, 8));
      case 'weekend': {
        const dow = today.getDay(); // 0 = CN
        const sat = dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow);
        return overlap(sat, addDays(sat, 2));
      }
      case 'month': return s.getMonth() === now.getMonth() && s.getFullYear() === now.getFullYear();
      case 'seats': return e.registration_open && e.seats_left > 0;
      default: return true;
    }
  }
  function relDay(d) {
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return 'Hôm nay'; if (diff === 1) return 'Ngày mai'; if (diff === -1) return 'Hôm qua';
    if (diff > 1 && diff < 7) return `${diff} ngày nữa`;
    return '';
  }

  // ---------- Tải dữ liệu ----------
  function skeleton() {
    const one = '<div class="skel"><i class="c"></i><div class="b"><i style="height:16px;width:80%"></i><i style="height:12px;width:60%"></i><i style="height:12px;width:50%"></i><i style="height:12px;width:70%"></i></div></div>';
    $('grid').className = 'ev-grid';
    $('grid').innerHTML = one.repeat(6);
  }

  let seq = 0;
  async function load() {
    const my = ++seq;
    if (day) { day = ''; Cal.draw(); }
    skeleton();
    const p = new URLSearchParams({ q: $('search').value.trim(), category: $('category').value, unit: $('unit').value, phase, term: App.term.key });
    let d;
    try { d = await api(`/api/events?${p}`); } catch (err) { $('grid').innerHTML = App.emptyState('Không tải được danh sách', err.message); return; }
    if (my !== seq) return; // đã có yêu cầu mới hơn
    all = d.events;
    render();
  }

  function cardStatus(e) {
    const r = e.my_registration;
    if (r && r.status === 'registered') {
      if (r.attendance === 'present') return '<span class="st green">Đã tham dự</span>';
      if (r.attendance === 'absent') return '<span class="st red">Vắng mặt</span>';
      return '<span class="st green">Đã đăng ký</span>';
    }
    if (e.phase === 'ended') return '<span class="st gray">Đã kết thúc</span>';
    if (e.phase === 'ongoing') return '<span class="st green">Đang diễn ra</span>';
    if (e.registration_open) return '<span class="st">Đang mở đăng ký</span>';
    if (e.seats_left <= 0) return '<span class="st amber">Đã đủ chỗ</span>';
    return '<span class="st gray">Hết hạn đăng ký</span>';
  }

  // Nhãn nổi trên ảnh bìa: đang diễn ra / sắp hết chỗ / đã đăng ký
  function flag(e) {
    const r = e.my_registration;
    if (e.phase === 'ongoing') return '<span class="ev-flag live">Đang diễn ra</span>';
    if (e.registration_open && e.seats_left > 0 && e.seats_left <= Math.max(5, Math.ceil(e.capacity * 0.15))) return `<span class="ev-flag">Sắp hết chỗ • còn ${fmtNum(e.seats_left)}</span>`;
    if (r && r.status === 'registered' && e.phase === 'upcoming') return '<span class="ev-flag mine">Bạn đã đăng ký</span>';
    return '';
  }

  function card(e) {
    const d = App.toDate(e.start_at);
    const pct = Math.min(100, Math.round((e.registered_count / e.capacity) * 100));
    const rel = e.phase === 'upcoming' ? relDay(d) : '';
    return `<a class="ev-card" href="/event-detail.html?id=${e.id}">
      <div class="cover-wrap"><div class="ev-cover" style="background-image:${coverBg(e)}">
        <div class="tags"><span class="st navy">${esc(e.category_name)}</span></div>
        <div class="date"><b>${String(d.getDate()).padStart(2, '0')}</b><small>Th${d.getMonth() + 1} • ${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]}</small></div>
      </div></div>${flag(e)}
      <div class="ev-body">
        ${rel ? `<div class="ev-when">${rel}</div>` : ''}
        <h3>${esc(e.title)}</h3>
        <div class="ev-meta">
          <div>${icon('clock')}<span>${fmtTime(e.start_at)}–${fmtTime(e.end_at)} • ${App.fmtDate(e.start_at)}</span></div>
          <div>${icon('pin')}<span>${esc(e.location)}</span></div>
          <div>${icon('building')}<span>${esc(e.unit_short || e.unit_name)}</span></div>
        </div>
        <div class="ev-foot">
          <div class="seats">${fmtNum(e.registered_count)}/${fmtNum(e.capacity)} đã đăng ký<div class="bar"><i style="width:${pct}%"></i></div></div>
          ${cardStatus(e)}
        </div>
      </div></a>`;
  }

  function timeline(list) {
    const groups = new Map();
    [...list].sort((a, b) => a.start_at.localeCompare(b.start_at)).forEach((e) => {
      const k = e.start_at.slice(0, 10); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e);
    });
    const t0 = new Date();
    const todayKey = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
    // Đưa nhóm ngày sắp tới lên trước, ngày đã qua xuống cuối
    const keys = [...groups.keys()];
    const future = keys.filter((k) => k >= todayKey); const past = keys.filter((k) => k < todayKey).reverse();
    return `<div class="tl">${[...future, ...past].map((k) => {
      const d = App.toDate(`${k} 00:00:00`); const rel = relDay(d);
      return `<div class="tl-day"><div class="tl-date"><b>${d.getDate()} tháng ${d.getMonth() + 1}</b><small>${App.weekday(k + ' 00:00:00')}${d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ''}</small>${rel ? `<div><span class="today">${rel}</span></div>` : ''}</div>
        <div class="tl-list">${groups.get(k).map((e) => `<a class="tl-item" href="/event-detail.html?id=${e.id}">
          <div class="thumb" style="background-image:${coverBg(e)}"></div>
          <div style="min-width:0"><div class="t">${fmtTime(e.start_at)} – ${fmtTime(e.end_at)}</div><h4>${esc(e.title)}</h4>
            <div class="m"><span>${icon('pin')}${esc(e.location)}</span><span>${icon('building')}${esc(e.unit_short || e.unit_name)}</span><span>${icon('users')}${fmtNum(e.registered_count)}/${fmtNum(e.capacity)}</span></div></div>
          <div>${cardStatus(e)}</div></a>`).join('')}</div></div>`;
    }).join('')}</div>`;
  }

  function render() {
    const list = day ? pool.filter((e) => onDay(e, day)) : all.filter(inWhen);
    const filtered = day || phase || when || $('search').value || $('category').value || $('unit').value;
    const pill = $('dayPill');
    pill.hidden = !day;
    if (day) pill.innerHTML = `${icon('calendar')}Sự kiện ngày ${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}<button aria-label="Bỏ chọn ngày">×</button>`;
    $('resetBtn').hidden = !filtered;
    $('count').textContent = day ? `${list.length} sự kiện trong ngày đã chọn` : `${list.length} sự kiện • ${App.term.label}`;
    document.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    const grid = $('grid');
    if (!list.length) {
      grid.className = 'ev-grid';
      grid.innerHTML = `<div class="card" style="grid-column:1/-1">${App.emptyState('Không có sự kiện phù hợp', 'Thử bỏ bớt bộ lọc hoặc tìm từ khóa khác.')}<div style="text-align:center;margin-top:-10px"><button class="btn-outline" id="emptyReset">Xóa bộ lọc</button></div></div>`;
      const r = $('emptyReset'); if (r) r.onclick = resetAll;
      return;
    }
    if (view === 'timeline') { grid.className = ''; grid.innerHTML = timeline(list); }
    else { grid.className = 'ev-grid'; grid.innerHTML = list.map(card).join(''); }
  }

  function syncCatChips() {
    document.querySelectorAll('#catChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.cat === $('category').value));
  }
  function resetAll(ev) {
    if (ev) ev.preventDefault();
    $('search').value = ''; $('category').value = ''; $('unit').value = ''; when = ''; phase = ''; day = ''; Cal.draw();
    document.querySelectorAll('#dateChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.when === ''));
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.phase === ''));
    history.replaceState(null, '', location.pathname);
    syncCatChips(); load();
  }

  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#tabs .tab.active').forEach((a) => a.classList.remove('active'));
    t.classList.add('active'); phase = t.dataset.phase;
    history.replaceState(null, '', phase ? `?phase=${phase}` : location.pathname);
    load();
  }));
  document.querySelectorAll('#dateChips .chip').forEach((c) => c.addEventListener('click', () => {
    when = c.dataset.when;
    document.querySelectorAll('#dateChips .chip').forEach((x) => x.classList.toggle('on', x === c));
    render();
  }));
  $('catChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    $('category').value = c.dataset.cat; syncCatChips(); load();
  });
  document.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view; try { localStorage.setItem(VIEW_KEY, view); } catch { /* bỏ qua */ }
    render();
  }));
  $('resetBtn').addEventListener('click', resetAll);
  let timer;
  $('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  $('category').addEventListener('change', () => { syncCatChips(); load(); });
  $('unit').addEventListener('change', load);

  // =====================================================================
  //  Dải nổi bật + Lịch tháng + Sự kiện sắp diễn ra
  // =====================================================================
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const isMine = (e) => (user.role === 'student'
    ? !!(e.my_registration && e.my_registration.status === 'registered')
    : user.role === 'organizer' ? e.unit_id === user.unit_id || e.created_by === user.id : false);
  // Sự kiện có diễn ra trong ngày k (tính cả sự kiện kéo dài nhiều ngày)
  function onDay(e, k) { return e.start_at.slice(0, 10) <= k && e.end_at.slice(0, 10) >= k; }
  const detailUrl = (e) => `/event-detail.html?id=${e.id}`;
  const whenText = (e) => {
    const s = App.toDate(e.start_at); const en = App.toDate(e.end_at);
    const same = e.start_at.slice(0, 10) === e.end_at.slice(0, 10);
    return same ? `${fmtTime(e.start_at)} – ${fmtTime(e.end_at)} • ${WD[s.getDay()]}, ${App.fmtDate(e.start_at)}`
      : `${fmtTime(e.start_at)} ${WD[s.getDay()]}, ${App.fmtDate(e.start_at)} đến ${WD[en.getDay()]}, ${App.fmtDate(e.end_at)}`;
  };
  function ribbon(e) {
    if (e.phase === 'ongoing') return '<span class="ribbon live">Đang diễn ra</span>';
    if (e.registration_open) return '<span class="ribbon open">Đang mở đăng ký</span>';
    return '<span class="ribbon soon">Sắp diễn ra</span>';
  }
  function countdown(e) {
    const ms = App.toDate(e.start_at) - new Date();
    if (ms <= 0) return '';
    const d = Math.floor(ms / 864e5); const h = Math.floor(ms / 36e5) % 24; const m = Math.floor(ms / 6e4) % 60;
    return `<div class="cdown"><span>Diễn ra sau</span><b>${d}<small>ngày</small></b><b>${h}<small>giờ</small></b><b>${m}<small>phút</small></b></div>`;
  }

  async function loadPool() {
    const d = await api('/api/events?term=all');
    pool = d.events;
    Slider.build();
    Cal.draw();
    buildUpcoming();
  }

  // ---------- 1. Slider sự kiện tiêu điểm ----------
  const Slider = (() => {
    let items = []; let i = 0; let timer;
    function pickItems() {
      const live = pool.filter((e) => e.phase === 'ongoing');
      const open = pool.filter((e) => e.phase === 'upcoming' && e.registration_open);
      const soon = pool.filter((e) => e.phase === 'upcoming' && !e.registration_open);
      // Ưu tiên sự kiện của chính người dùng đang diễn ra
      live.sort((a, b) => isMine(b) - isMine(a));
      const out = [...live, ...open, ...soon].slice(0, 6);
      return out;
    }
    function slide(e) {
      const mine = isMine(e);
      const checkin = user.role === 'student' && e.phase === 'ongoing' && mine;
      return `<article class="fs-slide" aria-roledescription="slide">
        <a class="fs-img" href="${detailUrl(e)}" style="background-image:${coverBg(e)}">${ribbon(e)}<span class="fs-cap">${esc(e.title)}</span></a>
        <div class="fs-info">
          <h2><a href="${detailUrl(e)}">${esc(e.title)}</a></h2>
          <ul class="fs-meta">
            <li>${icon('clock')}<b>Thời gian:</b><span>${whenText(e)}</span></li>
            <li>${icon('pin')}<b>Địa điểm:</b><span>${esc(e.location)}</span></li>
            <li>${icon('building')}<b>Đơn vị tổ chức:</b><span>${esc(e.unit_name || e.unit_short || '')}</span></li>
          </ul>
          ${e.summary ? `<p class="fs-sum">${esc(e.summary)}</p>` : ''}
          ${e.phase === 'upcoming' ? countdown(e) : '<div class="fs-line"></div>'}
          <div class="fs-foot">
            <span class="fs-tag">${esc(e.category_name)}</span>
            ${mine && user.role === 'student' ? '<span class="fs-mine">✓ Bạn đã đăng ký</span>' : ''}
            <a class="fs-btn" href="${checkin ? `/attendance.html?event=${e.id}` : detailUrl(e)}">${checkin ? 'Điểm danh ngay' : 'Xem chi tiết'}</a>
          </div>
        </div></article>`;
    }
    function go(n, user_ = false) {
      if (!items.length) return;
      i = (n + items.length) % items.length;
      $('slides').style.transform = `translateX(-${i * 100}%)`;
      document.querySelectorAll('#sDots button').forEach((b, k) => b.classList.toggle('on', k === i));
      if (user_) restart();
    }
    function restart() {
      clearInterval(timer);
      if (items.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(i + 1), 7000);
    }
    function build() {
      items = pickItems();
      if (!items.length) { $('slides').innerHTML = `<div class="fs-empty">${App.emptyState('Chưa có sự kiện sắp diễn ra', 'Hãy quay lại sau nhé.')}</div>`; return; }
      $('slides').innerHTML = items.map(slide).join('');
      $('sDots').innerHTML = items.length > 1 ? items.map((_, k) => `<button aria-label="Sự kiện ${k + 1}"></button>`).join('') : '';
      $('sPrev').hidden = $('sNext').hidden = items.length < 2;
      $('sDots').onclick = (ev) => { const b = ev.target.closest('button'); if (b) go([...$('sDots').children].indexOf(b), true); };
      go(0); restart();
    }
    $('sPrev').onclick = () => go(i - 1, true);
    $('sNext').onclick = () => go(i + 1, true);
    $('slider').addEventListener('mouseenter', () => clearInterval(timer));
    $('slider').addEventListener('mouseleave', restart);
    // Vuốt trên điện thoại
    let x0 = null;
    $('slider').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    $('slider').addEventListener('touchend', (e) => {
      if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1), true);
    });
    return { build };
  })();

  // ---------- 2. Lịch tháng ----------
  const Cal = (() => {
    const now = new Date();
    let y = now.getFullYear(); let m = now.getMonth();
    const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    if (user.role === 'organizer') $('mcMineLbl').textContent = 'Sự kiện của đơn vị bạn';
    if (user.role === 'admin') $('mcMineLbl').parentElement.hidden = true;
    function draw() {
      $('mcTitle').textContent = `${MONTHS[m]}, ${y}`;
      const first = new Date(y, m, 1);
      const lead = (first.getDay() + 6) % 7; // tuần bắt đầu từ Thứ Hai
      const start = new Date(y, m, 1 - lead);
      const todayK = keyOf(new Date());
      let html = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => `<span class="mc-wd">${d}</span>`).join('');
      for (let k = 0; k < 42; k++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
        if (k === 35 && d.getMonth() !== m) break; // bỏ hàng cuối nếu toàn ngày tháng sau
        const key = keyOf(d);
        const evs = pool.filter((e) => onDay(e, key));
        const mine = evs.some(isMine);
        const cls = ['mc-d', d.getMonth() !== m && 'out', key === todayK && 'today', evs.length && 'has', mine && 'mine', key === day && 'sel'].filter(Boolean).join(' ');
        const tip = evs.length ? `${evs.length} sự kiện: ${evs.map((e) => e.title).join('; ')}` : '';
        html += `<button class="${cls}" data-k="${key}" ${evs.length ? '' : 'tabindex="-1"'} title="${esc(tip)}"><span>${d.getDate()}</span></button>`;
      }
      $('mcGrid').innerHTML = html;
      peek();
    }
    // Danh sách nhỏ dưới lịch: sự kiện của tôi trong tháng
    function peek() {
      const mk = `${y}-${pad(m + 1)}`;
      const mine = pool.filter((e) => isMine(e) && (e.start_at.slice(0, 7) === mk || e.end_at.slice(0, 7) === mk))
        .sort((a, b) => a.start_at.localeCompare(b.start_at));
      if (user.role === 'admin' || !mine.length) { $('mcPeek').innerHTML = user.role === 'student' && pool.length ? '<p class="mc-none">Tháng này bạn chưa đăng ký sự kiện nào.</p>' : ''; return; }
      $('mcPeek').innerHTML = mine.slice(0, 3).map((e) => {
        const d = App.toDate(e.start_at);
        return `<a href="${detailUrl(e)}"><i>${pad(d.getDate())}<small>Th${d.getMonth() + 1}</small></i><span>${esc(e.title)}<small>${fmtTime(e.start_at)} • ${esc(e.location)}</small></span></a>`;
      }).join('') + (mine.length > 3 ? `<p class="mc-none">+${mine.length - 3} sự kiện khác</p>` : '');
    }
    $('mcPrev').onclick = () => { m--; if (m < 0) { m = 11; y--; } draw(); };
    $('mcNext').onclick = () => { m++; if (m > 11) { m = 0; y++; } draw(); };
    $('mcToday').onclick = () => { const t = new Date(); y = t.getFullYear(); m = t.getMonth(); draw(); };
    $('mcGrid').addEventListener('click', (ev) => {
      const b = ev.target.closest('.mc-d.has'); if (!b) return;
      day = day === b.dataset.k ? '' : b.dataset.k;
      draw(); render();
      if (day) $('allSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return { draw };
  })();

  $('dayPill').addEventListener('click', (e) => { if (e.target.closest('button')) { day = ''; Cal.draw(); render(); } });

  // ---------- 3. Sự kiện sắp diễn ra ----------
  function hcard(e) {
    const d = App.toDate(e.start_at);
    return `<article class="hcard">
      <a class="hc-img" href="${detailUrl(e)}" style="background-image:${coverBg(e)}">${ribbon(e)}
        <span class="hc-date"><b>${pad(d.getDate())}</b>Th${d.getMonth() + 1}</span></a>
      <div class="hc-body">
        <h3><a href="${detailUrl(e)}">${esc(e.title)}</a></h3>
        <div class="hc-meta">
          <div>${icon('clock')}<span>${whenText(e)}</span></div>
          <div>${icon('pin')}<span>${esc(e.location)}</span></div>
        </div>
        <div class="hc-foot"><span class="fs-tag">${esc(e.category_name)}</span>
          ${isMine(e) && user.role === 'student' ? '<span class="fs-mine">✓ Đã đăng ký</span>' : `<span class="hc-seats">Còn ${fmtNum(Math.max(0, e.seats_left))} chỗ</span>`}
          <a class="fs-btn sm" href="${detailUrl(e)}">Xem chi tiết</a></div>
      </div></article>`;
  }
  function buildUpcoming() {
    const list = pool.filter((e) => e.phase === 'upcoming').sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 10);
    $('upSec').hidden = !list.length;
    $('upRow').innerHTML = list.map(hcard).join('');
    const row = $('upRow');
    const step = () => (row.firstElementChild ? row.firstElementChild.offsetWidth + 18 : 300);
    const sync = () => { $('upPrev').disabled = row.scrollLeft < 5; $('upNext').disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 5; };
    $('upPrev').onclick = () => row.scrollBy({ left: -step(), behavior: 'smooth' });
    $('upNext').onclick = () => row.scrollBy({ left: step(), behavior: 'smooth' });
    row.addEventListener('scroll', sync, { passive: true }); sync();
  }

  load().catch((e) => toast(e.message, 'err'));
  loadPool().catch(() => {});
})();
