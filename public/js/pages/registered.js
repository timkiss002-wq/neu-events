// Trang Sự kiện đã đăng ký (sinh viên)
(async function () {
  const { api, esc, icon, fmtDate, fmtTime, weekday, toast, confirmBox } = App;
  try { await App.init({ page: 'registered', roles: ['student'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let data = null, tab = 'all', term = App.term.key; // mặc định: học kỳ đang chọn ở thanh trên cùng

  async function load() {
    try { data = await api(`/api/me/registrations${term ? `?term=${encodeURIComponent(term)}` : ''}`); }
    catch (err) { $('rows').innerHTML = `<tr><td colspan="5">${App.emptyState('Không tải được dữ liệu', err.message)}</td></tr>`; return; }
    term = data.term;
    renderStats(); renderLive(); renderTerms(); renderRows();
  }

  function renderStats() {
    const s = data.stats; const t = data.terms.find((x) => x.key === data.term);
    $('sTotal').textContent = s.total; $('sTotalSub').textContent = term === 'all' ? 'Tất cả học kỳ' : `Trong ${t ? t.label.replace('Học kỳ', 'học kỳ') : ''}`;
    $('sUp').textContent = s.upcoming; $('sUpSub').textContent = s.attendance_open ? `${s.attendance_open} sự kiện đang mở điểm danh` : 'Không có phiên điểm danh đang mở';
    $('sAtt').textContent = s.attended;
    if ($('sAttSub')) $('sAttSub').textContent = `${s.completed} hoàn thành • ${s.points} điểm hoạt động (tổng tích lũy ${data.stats.points_all})`;
    $('sAbs').textContent = s.absent; $('sAbsSub').textContent = s.event_cancelled ? `${s.event_cancelled} sự kiện khác đã hủy` : 'Không có sự kiện bị hủy';
    const counts = { all: data.registrations.length, upcoming: s.upcoming, attended: s.attended, absent: s.absent, cancelled: s.cancelled };
    document.querySelectorAll('#tabs .tab').forEach((b) => {
      const label = { all: 'Tất cả', upcoming: 'Sắp / đang diễn ra', attended: 'Đã tham dự', absent: 'Vắng mặt', cancelled: 'Đã hủy' }[b.dataset.tab];
      b.textContent = `${label} (${counts[b.dataset.tab]})`;
    });
  }

  function renderLive() {
    const l = data.live; const box = $('live');
    if (!l) { box.hidden = true; return; }
    box.hidden = false;
    const today = new Date().toDateString() === App.toDate(l.start_at).toDateString();
    box.innerHTML = `<div>
        <div class="live-label">Đang diễn ra • ${today ? 'Hôm nay' : weekday(l.start_at)}, ${App.fmtShort(l.start_at)}</div>
        <h2>${esc(l.title)}</h2>
        <p>${fmtTime(l.start_at)}–${fmtTime(l.end_at)} • ${esc(l.location)} • Mã đăng ký: ${esc(l.code)}</p>
      </div>
      ${l.attendance === 'present'
        ? `<span class="btn-light" style="cursor:default">${icon('tick')}Đã điểm danh ${fmtTime(l.checked_in_at)}</span>`
        : `<a href="/attendance.html?event=${l.event_id}" class="btn-light">${icon('scan')}${l.attendance_open ? 'Điểm danh ngay' : 'Xem điểm danh'}</a>`}`;
  }

  function renderTerms() {
    const sel = $('term');
    sel.innerHTML = data.terms.map((t) => `<option value="${t.key}" ${t.key === data.term ? 'selected' : ''}>${esc(t.label)}</option>`).join('') +
      `<option value="all" ${data.term === 'all' ? 'selected' : ''}>Tất cả học kỳ</option>`;
  }

  const ATT = { 'Hoàn thành': 'green', 'Đã check-in': 'green', 'Vắng mặt': 'red', 'Chưa check-in': 'amber', 'Chưa diễn ra': 'gray' };

  function renderRows() {
    const kw = $('search').value.trim().toLowerCase();
    const list = data.registrations.filter((r) => (tab === 'all' || r.bucket === tab) &&
      (!kw || r.title.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw)));
    $('rows').innerHTML = list.length ? list.map((r) => {
      const regCls = r.status === 'cancelled' || r.event_status === 'cancelled' ? 'red' : '';
      const acts = [];
      if (r.bucket === 'upcoming' && r.phase === 'ongoing') acts.push(`<a class="link" href="/attendance.html?event=${r.event_id}">${r.attendance_open ? 'Check-in ngay' : 'Điểm danh'}</a>`);
      if (r.bucket === 'attended' && !r.checked_out_at && r.attendance_open && r.session_kind === 'checkout') acts.push(`<a class="link" href="/attendance.html?event=${r.event_id}">Check-out ngay</a>`);
      if (r.bucket === 'attended') acts.push(r.reviewed ? `<a class="link muted" href="/reviews.html?event=${r.event_id}">Đã đánh giá</a>` : `<a class="link" href="/reviews.html?event=${r.event_id}">Đánh giá</a>`);
      if (r.can_cancel) acts.push(`<a class="link danger" data-cancel="${r.event_id}" data-title="${esc(r.title)}">Hủy đăng ký</a>`);
      acts.push(`<a class="link muted" href="/event-detail.html?id=${r.event_id}">Chi tiết</a>`);
      return `<tr>
        <td><a class="cell-title" href="/event-detail.html?id=${r.event_id}">${esc(r.title)}</a><span class="cell-sub">Mã đăng ký: ${esc(r.code)} • ${esc(r.unit_short || '')}</span></td>
        <td class="when"><b>${fmtDate(r.start_at)}</b><small>${weekday(r.start_at)} • ${fmtTime(r.start_at)}–${fmtTime(r.end_at)}</small></td>
        <td><span class="st ${regCls}">${esc(r.registration_label)}</span></td>
        <td>${r.attendance_label ? `<span class="st ${ATT[r.attendance_label]}">${esc(r.attendance_label)}</span>` : '<span class="cell-sub">—</span>'}${r.points_awarded != null ? `<span class="st violet" style="margin-top:4px">+${r.points_awarded} điểm HĐ</span>` : ''}</td>
        <td><div class="cell-actions">${acts.join('')}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5">${App.emptyState('Không có sự kiện phù hợp', kw ? 'Thử từ khóa khác.' : 'Hãy khám phá và đăng ký sự kiện mới.', 'ticket')}</td></tr>`;
    $('count').textContent = tab === 'all' && !kw ? `Hiển thị tất cả ${list.length} sự kiện đã đăng ký` : `Hiển thị ${list.length} / ${data.registrations.length} sự kiện`;

    document.querySelectorAll('[data-cancel]').forEach((a) => a.addEventListener('click', async () => {
      if (!(await confirmBox('Hủy đăng ký?', `Bạn chắc chắn muốn hủy đăng ký <b>${esc(a.dataset.title)}</b>?`, 'Hủy đăng ký', true))) return;
      try { await api(`/api/events/${a.dataset.cancel}/unregister`, { method: 'POST' }); toast('Đã hủy đăng ký.', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    }));
  }

  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#tabs .tab.active').forEach((a) => a.classList.remove('active'));
    t.classList.add('active'); tab = t.dataset.tab; renderRows();
  }));
  $('search').addEventListener('input', renderRows);
  $('term').addEventListener('change', (e) => {
    term = e.target.value;
    if (term !== 'all') { App.setTerm(term); const h = document.getElementById('termSel'); if (h) h.value = term; } // đồng bộ với thanh trên cùng
    load();
  });

  load();
})();
