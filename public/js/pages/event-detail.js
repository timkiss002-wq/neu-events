// Trang Chi tiết sự kiện: hiển thị thông tin, đăng ký / hủy đăng ký, lối tắt cho BTC
(async function () {
  const { api, esc, nl2br, icon, fmtDate, fmtTime, fmtDateTime, fmtLongDate, fmtRange, fmtNum, fmtSize, initials, tag, stars, toast, confirmBox, askReason, coverOf, ROLE } = App;
  let user;
  try { ({ user } = await App.init({ page: 'events' })); } catch { return; }
  const id = Number(App.param('id'));
  const $ = (s) => document.getElementById(s);

  async function load() {
    let ev;
    try { ({ event: ev } = await api(`/api/events/${id}`)); }
    catch (err) {
      document.querySelector('.container').innerHTML = `<div class="card">${App.emptyState('Không tìm thấy sự kiện', err.message)}<div style="text-align:center"><a class="btn-primary" href="/events.html">Về danh sách sự kiện</a></div></div>`;
      return;
    }
    render(ev);
  }

  const paragraphs = (t) => (t || '').split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const bullets = (t) => { const items = (t || '').split(/\n+/).filter(Boolean); return items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''; };

  function render(ev) {
    document.title = `${ev.title} – NEU Events`;
    $('crumbTitle').textContent = ev.title;
    $('summary').textContent = ev.summary || ev.slogan || '';
    $('banner').style.setProperty('--banner-image', `url('${coverOf(ev)}')`);
    // Nhãn trạng thái của sự kiện (sắp diễn ra / đang diễn ra / đã kết thúc / đã hủy) thay cho "Đã duyệt"
    const PH = { upcoming: ['Sắp diễn ra', ''], ongoing: ['Đang diễn ra', 'ok'], ended: ['Đã kết thúc', ''], cancelled: ['Đã hủy', 'bad'], pending: ['Chờ duyệt', ''], draft: ['Nháp', ''], rejected: ['Đã từ chối', 'bad'] };
    const [phLabel, phCls] = PH[ev.status === 'approved' ? ev.phase : ev.status] || ['', ''];
    const statusTag = `<span class="tag ${phCls === 'ok' ? 'ok' : ''}" ${phCls === 'bad' ? 'style="background:#fde7e7;color:#c23a3a"' : ''}>${esc(phLabel)}</span>`;
    const levelTag = ev.points ? `<span class="tag">${esc(App.LEVEL[ev.level] || '')} • ${ev.points} điểm HĐ</span>` : '';
    $('tags').innerHTML = `<span class="tag">${esc(ev.category_name)}</span>${statusTag}${levelTag}`;
    $('title').textContent = ev.title;
    $('slogan').textContent = ev.slogan || ev.unit_name;

    // ----- Về sự kiện -----
    $('about').innerHTML = paragraphs(ev.description) + (ev.benefits ? `<p style="margin-top:12px"><b>Quyền lợi khi tham gia</b></p>${bullets(ev.benefits)}` : '');
    $('tiles').innerHTML = `
      <div class="tile"><small>Quy mô</small><b>${fmtNum(ev.capacity)} người</b></div>
      <div class="tile"><small>Phí tham gia</small><b>${esc(ev.fee || 'Miễn phí')}</b></div>
      <div class="tile"><small>Mã sự kiện</small><b>${esc(ev.code)}</b></div>`;

    // ----- Chương trình -----
    $('agendaDate').textContent = fmtLongDate(ev.start_at);
    $('agenda').innerHTML = ev.agenda.length ? ev.agenda.map((a) => `<div class="agenda-row"><div class="t">${esc(a.time_label)}</div><div><b>${esc(a.title)}</b>${a.description ? `<span>${esc(a.description)}</span>` : ''}</div></div>`).join('')
      : '<div class="hint">Ban tổ chức chưa cập nhật chương trình chi tiết.</div>';

    // ----- Chuẩn bị & tài liệu -----
    $('prep').innerHTML = bullets(ev.preparation) || '<p>Không yêu cầu chuẩn bị đặc biệt.</p>';
    $('files').innerHTML = ev.files.map((f) => `<a class="file" href="/api/events/files/${f.id}/download">
        <div>${icon('file')}<div style="min-width:0"><b>${esc(f.original_name)}</b><small>${fmtSize(f.size)} • tải lên ${fmtDate(f.uploaded_at)}</small></div></div>${icon('download')}</a>`).join('');

    // ----- Đánh giá -----
    if (ev.review_count || ev.my_review) {
      $('reviewCard').hidden = false;
      $('reviewSummary').innerHTML = `<div class="rv-sum"><strong>${ev.avg_rating ? String(ev.avg_rating).replace('.', ',') : '—'}</strong><div>${stars(ev.avg_rating || 0)}<small>${fmtNum(ev.review_count)} lượt đánh giá từ sinh viên đã tham dự</small></div></div>` +
        (ev.my_review ? `<div class="my-review"><b>Đánh giá của bạn:</b> ${stars(ev.my_review.rating)}<br>${esc(ev.my_review.comment || '')}</div>` : '');
    }

    // ----- Cột phải: tham gia -----
    const at = new Date();
    const deadlinePassed = new Date(ev.reg_deadline.replace(' ', 'T')) <= at;
    let st, cls;
    if (ev.status === 'cancelled') { st = 'Sự kiện đã bị hủy'; cls = 'red'; }
    else if (ev.status !== 'approved') { st = { draft: 'Hồ sơ nháp', pending: 'Đang chờ kiểm duyệt', rejected: 'Hồ sơ bị từ chối' }[ev.status]; cls = 'amber'; }
    else if (ev.phase === 'ended' && ev.attendance_open) { st = 'Đã kết thúc • Đang mở check-out'; cls = 'green'; }
    else if (ev.phase === 'ended') { st = 'Sự kiện đã kết thúc'; cls = 'gray'; }
    else if (ev.phase === 'ongoing') { st = ev.attendance_open ? 'Đang diễn ra • Mở điểm danh' : 'Đang diễn ra'; cls = 'green'; }
    else if (ev.registration_open) { st = 'Đang mở đăng ký'; cls = ''; }
    else if (ev.seats_left <= 0) { st = 'Đã đủ số lượng'; cls = 'amber'; }
    else { st = 'Đã hết hạn đăng ký'; cls = 'gray'; }
    $('joinStatus').textContent = st; $('joinStatus').className = `status ${cls}`;

    $('sideFields').innerHTML = `
      <div class="field"><div class="ic">${icon('calendar')}</div><div><small>Thời gian</small><b>${fmtRange(ev.start_at, ev.end_at)}</b><span>${fmtLongDate(ev.start_at)}</span></div></div>
      <div class="field"><div class="ic">${icon('pin')}</div><div><small>Địa điểm</small><b>${esc(ev.location)}</b><span>Đại học Kinh tế Quốc dân, 207 Giải Phóng</span></div></div>
      <div class="field"><div class="ic">${icon('clock')}</div><div><small>Hạn đăng ký</small><b>${fmtDateTime(ev.reg_deadline)}</b>${deadlinePassed ? '<span>Đã hết hạn</span>' : ''}</div></div>
      <div class="field"><div class="ic">${icon('users')}</div><div><small>Đối tượng</small><b>Sinh viên NEU</b><span>${esc(ev.fee || 'Miễn phí')}</span></div></div>`;

    const pct = Math.min(100, Math.round((ev.registered_count / ev.capacity) * 100));
    $('seatLine').innerHTML = `<span>Đã đăng ký <b>${fmtNum(ev.registered_count)}/${fmtNum(ev.capacity)}</b></span><span>Còn ${fmtNum(ev.seats_left)} chỗ</span>`;
    $('progressBar').style.width = `${pct}%`;

    renderActions(ev, deadlinePassed);
    renderOrganizer(ev);
    renderManager(ev);
    renderExtras(ev);

    $('noticeText').innerHTML = ev.status === 'cancelled'
      ? `<strong>Lý do hủy</strong><p>${esc(ev.cancel_reason || 'Ban tổ chức chưa cung cấp lý do.')} Lượt đăng ký của sự kiện bị hủy không tính là vắng mặt.</p>`
      : `<strong>Lưu ý khi tham gia</strong><p>Bạn có thể hủy đăng ký trước hạn ${fmtDateTime(ev.reg_deadline)}. Check-in khi đến và check-out khi kết thúc bằng mã hoặc QR tại địa điểm; chỉ sinh viên hoàn thành cả check-in và check-out mới được ghi nhận điểm hoạt động${ev.points ? ` (${ev.points} điểm)` : ''}.</p>`;
  }

  function renderActions(ev, deadlinePassed) {
    const box = $('joinActions'); const note = $('joinNote');
    const reg = ev.my_registration;
    const btn = (cls, ic, label, act) => `<button class="${cls}" data-act="${act}">${icon(ic)}${label}</button>`;
    note.innerHTML = '';
    if (user.role !== 'student') {
      box.innerHTML = `<button class="btn-primary" disabled>${icon('ticket1')}Đăng ký tham gia</button>`;
      note.textContent = `Bạn đang đăng nhập với vai trò ${ROLE[user.role]}. Chỉ tài khoản sinh viên được đăng ký tham gia.`;
      return;
    }
    const registered = reg && reg.status === 'registered';
    if (ev.status === 'cancelled') { box.innerHTML = ''; note.innerHTML = registered ? `Mã đăng ký <b>${esc(reg.code)}</b> được tự động hủy do sự kiện bị hủy.` : ''; return; }
    if (registered) {
      const parts = [];
      if (reg.attendance === 'present') {
        parts.push(reg.checked_out_at
          ? `<div class="st green" style="justify-content:center;height:38px">${icon('tick')}Hoàn thành (check-in ${fmtTime(reg.checked_in_at)} • check-out ${fmtTime(reg.checked_out_at)})</div>`
          : `<div class="st green" style="justify-content:center;height:38px">${icon('tick')}Đã check-in lúc ${fmtTime(reg.checked_in_at)}</div>`);
        if (!reg.checked_out_at && ev.attendance_open) parts.push(`<a class="btn-primary" href="/attendance.html?event=${ev.id}">${icon('scan')}Check-out</a>`);
        if (reg.points_awarded != null) parts.push(`<div class="st violet" style="justify-content:center;height:38px">${icon('gift')}Đã cộng ${reg.points_awarded} điểm hoạt động</div>`);
        if (ev.phase !== 'upcoming') parts.push(`<a class="btn-outline" href="/reviews.html?event=${ev.id}">${icon('chat')}${ev.my_review ? 'Sửa đánh giá' : 'Đánh giá sự kiện'}</a>`);
      } else if (reg.attendance === 'absent') {
        parts.push('<div class="st red" style="justify-content:center;height:34px">Bạn được ghi nhận vắng mặt</div>');
      } else if (ev.phase === 'ongoing' || ev.attendance_open) {
        parts.push(`<a class="btn-primary" href="/attendance.html?event=${ev.id}">${icon('scan')}Check-in ngay</a>`);
      } else {
        parts.push(`<div class="st" style="justify-content:center;height:34px">${icon('tick')}Bạn đã đăng ký sự kiện</div>`);
      }
      if (ev.phase === 'upcoming' && !deadlinePassed) parts.push(btn('btn-danger', 'x', 'Hủy đăng ký', 'unregister'));
      box.innerHTML = parts.join('');
      note.innerHTML = `Mã đăng ký: <b>${esc(reg.code)}</b> • Đăng ký lúc ${fmtDateTime(reg.registered_at)}.`;
    } else if (ev.registration_open) {
      box.innerHTML = btn('btn-primary', 'ticket1', reg ? 'Đăng ký lại' : 'Đăng ký tham gia', 'register');
      note.textContent = 'Mã đăng ký sẽ được tạo ngay sau khi đăng ký thành công.';
    } else {
      box.innerHTML = `<button class="btn-primary" disabled>${icon('ticket1')}Đăng ký tham gia</button>`;
      note.textContent = ev.phase === 'ended' ? 'Sự kiện đã kết thúc.' : ev.seats_left <= 0 ? 'Sự kiện đã đủ số lượng đăng ký.' : 'Đã hết hạn đăng ký.';
    }
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, ev, b)));
  }

  async function act(action, ev, b) {
    if (action === 'register') {
      b.disabled = true;
      try {
        const r = await api(`/api/events/${ev.id}/register`, { method: 'POST' });
        load();
        App.modal({
          title: 'Đăng ký thành công', cancelText: 'Đóng', okText: 'Thêm vào Google Calendar',
          html: `<div class="success-pop"><div class="tick">${icon('tick')}</div><div>Bạn đã giữ chỗ tại <b>${esc(ev.title)}</b>.</div><div class="code">${esc(r.code)}</div><p class="hint" style="margin-top:6px">Mã đăng ký cũng có trong mục <a class="link" href="/registered.html">Đã đăng ký</a>. ${fmtRange(ev.start_at, ev.end_at)} • ${esc(ev.location)}</p></div>`,
          onOk: () => { window.open(gcalUrl(ev), '_blank', 'noopener'); return true; },
        });
      }
      catch (err) { toast(err.message, 'err'); b.disabled = false; }
    }
    if (action === 'unregister') {
      if (!(await confirmBox('Hủy đăng ký?', `Bạn sẽ không còn giữ chỗ tại <b>${esc(ev.title)}</b>. Bạn có thể đăng ký lại nếu còn chỗ và chưa hết hạn.`, 'Hủy đăng ký', true))) return;
      try { await api(`/api/events/${ev.id}/unregister`, { method: 'POST' }); toast('Đã hủy đăng ký.', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    }
  }

  function renderOrganizer(ev) {
    $('organizer').innerHTML = `
      <div class="org"><div class="org-logo">${esc(initials(ev.unit_short || ev.unit_name))}</div><div><b>${esc(ev.unit_name)}</b><small>Đơn vị tổ chức</small></div></div>
      <div class="contact-list">
        <div>${icon('user')}<span>${esc(ev.contact_name || '—')}</span></div>
        ${ev.contact_phone ? `<div>${icon('phone')}<span>${esc(ev.contact_phone)}</span></div>` : ''}
        ${ev.contact_email ? `<div>${icon('mail')}<a class="link" href="mailto:${esc(ev.contact_email)}">${esc(ev.contact_email)}</a></div>` : ''}
      </div>`;
  }

  function renderManager(ev) {
    if (!ev.can_manage) { $('managerBar').innerHTML = ''; return; }
    const acts = [];
    if (['draft', 'rejected'].includes(ev.status)) acts.push(`<a class="btn-outline btn-sm" href="/event-form.html?id=${ev.id}">${icon('edit')}Chỉnh sửa</a>`);
    if (ev.status === 'approved') acts.push(`<a class="btn-outline btn-sm" href="/attendance.html?event=${ev.id}">${icon('scan')}Điểm danh</a>`);
    if (ev.review_count) acts.push(`<a class="btn-outline btn-sm" href="/reviews.html?event=${ev.id}">${icon('chat')}Đánh giá</a>`);
    if (user.role === 'admin' && ev.status === 'pending') acts.push(`<a class="btn-primary btn-sm" href="/moderation.html?id=${ev.id}">${icon('shield')}Kiểm duyệt</a>`);
    if (ev.status === 'approved' && ev.phase !== 'ended') acts.push(`<button class="btn-danger btn-sm" id="cancelEv">${icon('x')}Hủy sự kiện</button>`);
    $('managerBar').innerHTML = `<div class="mbar"><span>Bạn đang xem với quyền quản lý • ${tag(ev.status)} ${ev.status === 'approved' ? tag(ev.phase) : ''}</span><div class="acts">${acts.join('')}</div></div>`;
    const c = $('cancelEv');
    if (c) c.onclick = async () => {
      const reason = await askReason('Hủy sự kiện', `Tất cả ${fmtNum(ev.registered_count)} sinh viên đã đăng ký sẽ nhận thông báo kèm lý do.`, { okText: 'Hủy sự kiện', danger: true, min: 5 });
      if (!reason) return;
      try { await api(`/api/events/${ev.id}/cancel`, { method: 'POST', body: { reason } }); toast('Đã hủy sự kiện và thông báo tới sinh viên.', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    };
  }


  // ---------- Thêm vào lịch, chỉ đường, đếm ngược, thanh hành động nổi ----------
  const stamp = (s) => String(s).replace(/[-: ]/g, '').slice(0, 15).padEnd(15, '0').replace(/^(\d{8})(\d{6}).*$/, '$1T$2');
  const placeOf = (ev) => `${ev.location}, Đại học Kinh tế Quốc dân, 207 Giải Phóng, Hà Nội`;
  function gcalUrl(ev) {
    const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${stamp(ev.start_at)}/${stamp(ev.end_at)}`, ctz: 'Asia/Ho_Chi_Minh', details: `${ev.summary || ''}\n${location.href}`, location: placeOf(ev) });
    return `https://calendar.google.com/calendar/render?${p}`;
  }
  function downloadIcs(ev) {
    const escIcs = (t) => String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NEU Events//VI', 'BEGIN:VEVENT', `UID:neu-event-${ev.id}@neu-events`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;TZID=Asia/Ho_Chi_Minh:${stamp(ev.start_at)}`, `DTEND;TZID=Asia/Ho_Chi_Minh:${stamp(ev.end_at)}`,
      `SUMMARY:${escIcs(ev.title)}`, `LOCATION:${escIcs(placeOf(ev))}`, `DESCRIPTION:${escIcs((ev.summary || '') + '\n' + location.href)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Sự kiện sắp bắt đầu', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${ev.code || 'su-kien'}.ics`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function countdownText(ev) {
    const now = Date.now(); const s = App.toDate(ev.start_at).getTime(); const e = App.toDate(ev.end_at).getTime();
    const span = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60;
      return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${mm} phút` : `${mm} phút`; };
    if (ev.status !== 'approved') return null;
    if (now < s) return { live: false, text: `Bắt đầu sau ${span(s - now)}` };
    if (now < e) return { live: true, text: `Đang diễn ra • còn ${span(e - now)}` };
    return null;
  }
  let cdTimer;
  function renderExtras(ev) {
    // Đếm ngược + lối tắt ngay dưới trạng thái
    let box = $('extras');
    if (!box) { box = document.createElement('div'); box.id = 'extras'; $('joinStatus').insertAdjacentElement('afterend', box); }
    const tick = () => { const c = countdownText(ev); const el = box.querySelector('.countdown');
      if (!c) { if (el) el.remove(); return; }
      const html = `${icon('clock')}${esc(c.text)}`;
      if (el) { el.innerHTML = html; el.classList.toggle('live', c.live); } else box.insertAdjacentHTML('afterbegin', `<div class="countdown ${c.live ? 'live' : ''}">${html}</div>`); };
    box.innerHTML = '';
    tick(); clearInterval(cdTimer); cdTimer = setInterval(tick, 30000);
    const showCal = ev.status === 'approved' && ev.phase !== 'ended';
    box.insertAdjacentHTML('beforeend', `<div class="quick-links">
      ${showCal ? `<button type="button" id="calBtn">${icon('calendar')}Thêm vào lịch</button>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeOf(ev))}" target="_blank" rel="noopener" ${showCal ? '' : 'style="grid-column:1/-1"'}>${icon('pin')}Chỉ đường</a></div>`);
    const cb = $('calBtn');
    if (cb) cb.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cal-menu').forEach((m) => m.remove());
      const m = document.createElement('div'); m.className = 'cal-menu';
      m.innerHTML = `<a href="${gcalUrl(ev)}" target="_blank" rel="noopener">${icon('calendar')}Google Calendar</a><a href="#" data-ics>${icon('download')}Tải tệp .ics (Outlook, Apple)</a>`;
      document.body.appendChild(m);
      const r = cb.getBoundingClientRect(); m.style.left = `${Math.min(r.left + scrollX, innerWidth - 240)}px`; m.style.top = `${r.bottom + scrollY + 6}px`;
      m.querySelector('[data-ics]').onclick = (x) => { x.preventDefault(); downloadIcs(ev); m.remove(); };
      setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
    };

    // Thanh hành động nổi: hiện khi khung "Tham gia sự kiện" khuất khỏi màn hình
    let bar = $('actionBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'actionBar'; bar.className = 'action-bar'; document.body.appendChild(bar); }
    const main = $('joinActions').querySelector('.btn-primary:not([disabled]), a.btn-primary');
    bar.innerHTML = `<div class="in"><div class="info"><b>${esc(ev.title)}</b><small>${fmtRange(ev.start_at, ev.end_at)} • ${esc(ev.location)}</small></div>
      <div class="acts"><span class="status ${$('joinStatus').className.replace('status', '').trim()}" style="margin:0">${esc($('joinStatus').textContent)}</span>${main ? `<button class="btn-primary" id="barMain">${main.innerHTML}</button>` : ''}</div></div>`;
    const bm = $('barMain'); if (bm) bm.onclick = () => main.click();
    const card = $('joinActions').closest('.card');
    if (window.__joinObs) window.__joinObs.disconnect();
    window.__joinObs = new IntersectionObserver(([en]) => bar.classList.toggle('show', !en.isIntersecting && en.boundingClientRect.top < 0), { threshold: 0 });
    window.__joinObs.observe(card);
  }

  $('shareBtn').addEventListener('click', async () => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: document.title, url: location.href }); return; } catch { /* người dùng hủy */ } }
    try { await navigator.clipboard.writeText(location.href); toast('Đã sao chép liên kết sự kiện.', 'ok'); }
    catch { App.modal({ title: 'Liên kết sự kiện', html: `<input class="inp" value="${esc(location.href)}" readonly onclick="this.select()">`, hideOk: true, cancelText: 'Đóng' }); }
  });

  load();
})();
