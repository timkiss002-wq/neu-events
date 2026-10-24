// Trang Duyệt điểm hoạt động (Đơn vị quản lý): duyệt danh sách sinh viên hoàn thành do BTC gửi về
(async function () {
  const { api, esc, icon, fmtDate, fmtTime, fmtDateTime, fmtNum, toast, modal, askReason, LEVEL } = App;
  try { await App.init({ page: 'points', roles: ['admin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const ST = { pending: ['Chờ duyệt', 'amber'], approved: ['Đã duyệt', 'green'], rejected: ['Từ chối', 'red'] };
  let status = '', selected = Number(App.param('event')) || null, items = [];

  async function load() {
    let d;
    try { d = await api(`/api/admin/points${status ? `?status=${status}` : ''}`); } catch (err) { $('list').innerHTML = App.emptyState('Không tải được dữ liệu', err.message); return; }
    items = d.items; const c = d.counts || {};
    $('stats').innerHTML = stat('Chờ duyệt', c.pending || 0, 'Danh sách BTC vừa gửi', 'clock') +
      stat('Đã duyệt', c.approved || 0, 'Đã cộng điểm cho sinh viên', 'check') +
      stat('Tổng điểm đã cộng', fmtNum(c.total_points || 0), 'Tổng điểm × số sinh viên', 'gift');
    $('list').innerHTML = items.length ? items.map((x) => `<button class="pt-item ${x.event_id === selected ? 'sel' : ''}" data-ev="${x.event_id}">
        <b>${esc(x.title)}</b>
        <small>${esc(x.unit_short || '')} • ${fmtDate(x.start_at)} • ${esc(LEVEL[x.level] || '')}</small>
        <div class="pt-row"><span class="st ${ST[x.status][1]}">${ST[x.status][0]}</span><small>${fmtNum(x.member_count)} sinh viên × ${x.points} điểm • gửi ${fmtDateTime(x.submitted_at)}</small></div>
      </button>`).join('') : App.emptyState('Chưa có danh sách', 'Danh sách xuất hiện khi Ban tổ chức gửi sau sự kiện.', 'gift');
    document.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.ev); history.replaceState(null, '', `?event=${selected}`); load(); }));
    if (!selected && items.length) selected = (items.find((x) => x.status === 'pending') || items[0]).event_id;
    if (selected) detail(selected);
  }

  async function detail(id) {
    let d;
    try { d = await api(`/api/admin/points/${id}`); } catch (err) { $('detail').innerHTML = App.emptyState('Không tải được danh sách', err.message); return; }
    document.querySelectorAll('.pt-item').forEach((b) => b.classList.toggle('sel', Number(b.dataset.ev) === id));
    const { event: ev, submission: s, members } = d;
    $('detail').innerHTML = `
      <div class="card-head"><div><h3>${esc(ev.title)}</h3><div class="hint">${esc(ev.unit_name)} • ${fmtDate(ev.start_at)} ${fmtTime(ev.start_at)}–${fmtTime(ev.end_at)} • ${esc(LEVEL[ev.level] || '')}</div></div>
        <span class="st ${ST[s.status][1]}">${ST[s.status][0]}</span></div>
      <div class="pt-sum">
        <div><strong>${fmtNum(ev.registered_count)}</strong><small>Đăng ký</small></div>
        <div><strong>${fmtNum(members.length)}</strong><small>Hoàn thành (check-in + check-out)</small></div>
        <div><strong>${s.points}</strong><small>Điểm/sinh viên</small></div>
      </div>
      ${s.note ? `<div class="pt-note"><b>Ghi chú của BTC:</b> ${esc(s.note)}</div>` : ''}
      ${s.review_note ? `<div class="pt-note"><b>Phản hồi:</b> ${esc(s.review_note)}</div>` : ''}
      <div class="table-wrap" style="margin-top:14px;max-height:420px;overflow:auto">
        <table class="tbl"><thead><tr><th>STT</th><th>Sinh viên</th><th>MSSV</th><th>Check-in</th><th>Check-out</th></tr></thead>
        <tbody>${members.map((m, i) => `<tr><td>${i + 1}</td><td><b>${esc(m.full_name)}</b><span class="cell-sub">${esc(m.class_name || '')}</span></td><td>${esc(m.student_code)}</td><td>${fmtTime(m.checked_in_at)}</td><td>${fmtTime(m.checked_out_at)}</td></tr>`).join('')}</tbody></table>
      </div>
      ${s.status === 'pending' ? `<div class="pt-actions"><button class="btn-outline" id="rejectBtn">${icon('x')}Từ chối</button><button class="btn-primary" id="approveBtn">${icon('check')}Duyệt cộng ${s.points} điểm cho ${fmtNum(members.length)} sinh viên</button></div>`
        : `<p class="fine">Xử lý lúc ${fmtDateTime(s.reviewed_at)}.</p>`}`;
    if ($('approveBtn')) $('approveBtn').onclick = async () => {
      const ok = await modal({ title: 'Duyệt điểm hoạt động?', desc: `Cộng <b>${s.points} điểm</b> cho <b>${fmtNum(members.length)}</b> sinh viên hoàn thành "${esc(ev.title)}". Sinh viên và Ban tổ chức sẽ nhận thông báo.`, okText: 'Duyệt',
        onOk: async () => api(`/api/admin/points/${ev.id}/approve`, { method: 'POST', body: {} }) });
      if (ok) { toast(`Đã cộng điểm cho ${ok.count} sinh viên.`, 'ok'); load(); }
    };
    if ($('rejectBtn')) $('rejectBtn').onclick = async () => {
      const note = await askReason('Từ chối danh sách', 'Ban tổ chức sẽ nhận lý do để rà soát và gửi lại.', { okText: 'Từ chối', danger: true, min: 10 });
      if (!note) return;
      try { await api(`/api/admin/points/${ev.id}/reject`, { method: 'POST', body: { note } }); toast('Đã từ chối danh sách.', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    };
  }

  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#tabs .tab.active').forEach((a) => a.classList.remove('active'));
    t.classList.add('active'); status = t.dataset.st; selected = null; load();
  }));
  load();
})();
