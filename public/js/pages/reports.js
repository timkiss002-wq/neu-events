// Trang Báo cáo – thống kê (Đơn vị quản lý)
(async function () {
  const { api, esc, fmtNum, fmtPct, fmtDate, fmtShort, fmtTime, stars, tag } = App;
  let user;
  try { ({ user } = await App.init({ page: 'reports', roles: ['organizer', 'admin'] })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let showAll = false, last = null, firstLoad = true;
  // Ban tổ chức chỉ xem số liệu sự kiện của đơn vị mình
  if (user.role === 'organizer') {
    $('unit').closest('.fgroup').hidden = true;
    document.querySelector('.page-head p').textContent = `Thống kê đăng ký, tham dự, hoàn thành và đánh giá các sự kiện do ${user.unit_name} tổ chức.`;
  }

  const meta = await api('/api/meta');
  $('unit').insertAdjacentHTML('beforeend', meta.units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join(''));
  $('type').insertAdjacentHTML('beforeend', meta.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));

  // Lần tải đầu: theo học kỳ đang chọn ở thanh trên cùng
  const query = () => new URLSearchParams(firstLoad ? { term: App.term.key, unit: $('unit').value, category: $('type').value }
    : { from: $('from').value, to: $('to').value, unit: $('unit').value, category: $('type').value });

  async function load() {
    let d;
    try { d = await api(`/api/reports?${query()}`); } catch (err) { App.toast(err.message, 'err'); return; }
    last = d; firstLoad = false;
    $('from').value = d.filters.from; $('to').value = d.filters.to;
    const S = d.summary;
    $('sEvents').textContent = fmtNum(S.events);
    $('sEventsSub').textContent = `${S.ended} đã kết thúc • ${S.ongoing + S.upcoming} sắp/đang diễn ra${S.cancelled ? ` • ${S.cancelled} đã hủy` : ''}`;
    $('sRegs').textContent = fmtNum(S.registrations);
    $('sAtt').textContent = fmtNum(S.attendance);
    $('sAttSub').textContent = `${fmtNum(S.attendance_ended)} đã kết thúc • ${fmtNum(S.attendance_ongoing)} đang diễn ra`;
    $('sRate').textContent = fmtPct(S.rate);
    $('sRateSub').textContent = `${fmtNum(S.attendance_ended)} / ${fmtNum(S.registrations_ended)} đăng ký đã kết thúc`;
    renderBars(d); renderDonut(d); renderTable(d);
  }

  function niceMax(v) {
    if (v <= 0) return 4;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 4 >= v);
    return step * 4;
  }

  function renderBars(d) {
    $('barTitle').textContent = `Đăng ký & tham dự theo ${d.monthly ? 'tháng' : 'tuần'}`;
    $('barHint').textContent = `Số lượt sinh viên • Dữ liệu đến ${fmtTime(d.generated_at)} ngày ${fmtDate(d.generated_at)}`;
    const w = d.weekly;
    const max = niceMax(Math.max(0, ...w.map((b) => Math.max(b.registrations, b.attendance))));
    $('yAxis').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span>${fmtNum((max / 4) * i)}</span>`).join('');
    $('plot').innerHTML = w.length ? w.map((b) => `<div class="group" title="${esc(b.label)}: ${b.registrations} đăng ký, ${b.attendance} tham dự">
        <div class="bar a" style="height:${(b.registrations / max) * 100}%">${b.registrations ? `<em>${fmtNum(b.registrations)}</em>` : ''}</div>
        <div class="bar b" style="height:${(b.attendance / max) * 100}%">${b.attendance ? `<em>${fmtNum(b.attendance)}</em>` : ''}</div></div>`).join('') : '';
    $('xAxis').innerHTML = w.map((b) => `<span>${esc(b.label)}</span>`).join('');
    const cur = w.find((b) => d.generated_at.slice(0, 10) >= b.from && d.generated_at.slice(0, 10) <= b.to);
    $('barFine').textContent = cur ? `${d.monthly ? 'Tháng' : 'Tuần'} ${cur.label} đang cập nhật; các sự kiện sắp diễn ra chưa có số liệu tham dự.` : 'Lượt đăng ký tính theo ngày đăng ký; lượt tham dự tính theo giờ điểm danh.';
  }

  function renderDonut(d) {
    const total = d.byCategory.reduce((s, c) => s + c.count, 0);
    $('donutTotal').textContent = total;
    $('donutHint').textContent = `Theo loại sự kiện • ${total} sự kiện`;
    let acc = 0;
    const stops = d.byCategory.map((c) => { const a = acc; acc += (c.count / total) * 100; return `${c.color} ${a}% ${acc}%`; });
    $('donut').style.background = total ? `conic-gradient(${stops.join(', ')})` : '#eef1f6';
    $('legendList').innerHTML = d.byCategory.length ? d.byCategory.map((c) => `<div class="legend-row"><span><i style="background:${c.color}"></i>${esc(c.name)}</span><b>${c.count} • ${Math.round((c.count / total) * 100)}%</b></div>`).join('')
      : '<div class="hint">Không có sự kiện trong khoảng thời gian này.</div>';
  }

  function renderTable(d) {
    const rows = showAll ? d.table : d.table.slice(0, 6);
    $('toggleAll').textContent = showAll ? 'Thu gọn' : `Xem tất cả (${d.table.length})`;
    $('toggleAll').hidden = d.table.length <= 6;
    const PH = { ongoing: 'green', upcoming: '', ended: 'gray', cancelled: 'red' };
    $('rows').innerHTML = rows.length ? rows.map((e) => `<tr>
        <td><a class="cell-title" href="/event-detail.html?id=${e.id}">${esc(e.title)}</a><span class="cell-sub">${esc(e.unit_short)} • ${fmtShort(e.start_at)} • ${esc(e.category_name)}</span></td>
        <td>${fmtNum(e.registered)}</td>
        <td>${e.present == null ? '<span class="muted">—</span>' : `${fmtNum(e.present)}<span class="cell-sub">${fmtNum(e.completed)} hoàn thành</span>`}</td>
        <td>${e.rate == null ? '<span class="muted">—</span>' : fmtPct(e.rate)}</td>
        <td>${e.avg_rating ? `<span class="rating"><b>${String(e.avg_rating.toFixed(1)).replace('.', ',')}</b>${stars(e.avg_rating)}</span><span class="cell-sub">${e.review_count} lượt</span>` : '<span class="muted">—</span>'}</td>
        <td><span class="st ${PH[e.phase]}">${esc(e.phase_label)}</span></td></tr>`).join('')
      : `<tr><td colspan="6">${App.emptyState('Không có dữ liệu', 'Thử mở rộng khoảng thời gian hoặc bỏ bớt bộ lọc.', 'chart')}</td></tr>`;
  }

  $('filterForm').addEventListener('submit', (e) => { e.preventDefault(); if ($('from').value > $('to').value) { App.toast('Ngày bắt đầu phải trước ngày kết thúc.', 'err'); return; } load(); });
  $('toggleAll').addEventListener('click', () => { showAll = !showAll; renderTable(last); });
  $('exportBtn').addEventListener('click', () => App.download(`/api/reports/export?${query()}`));
  load();
})();
