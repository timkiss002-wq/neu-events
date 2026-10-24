// Trang Quản lý sự kiện (Ban tổ chức / Đơn vị quản lý)
(async function () {
  const { api, esc, icon, fmtDate, fmtTime, fmtNum, toast, confirmBox, askReason, tag, weekday } = App;
  let user;
  try { ({ user } = await App.init({ page: 'manage', roles: ['organizer', 'admin'] })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let status = App.param('status') || '';
  $('sub').textContent = user.role === 'admin' ? 'Toàn bộ hồ sơ sự kiện của các đơn vị trong trường.' : `Hồ sơ sự kiện của ${user.unit_name}.`;
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.st === status));

  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;

  async function load() {
    let d;
    try { d = await api(`/api/events/manage/list?${new URLSearchParams({ q: $('search').value.trim(), status, term: App.term.key })}`); }
    catch (err) { $('rows').innerHTML = `<tr><td colspan="5">${App.emptyState('Lỗi', err.message)}</td></tr>`; return; }
    const c = d.counts;
    $('stats').innerHTML = stat('Tổng hồ sơ', c.all || 0, `${c.draft || 0} bản nháp`, 'folder') +
      stat('Chờ duyệt', c.pending || 0, 'Đang chờ Đơn vị quản lý', 'clock') +
      stat('Đã duyệt', c.approved || 0, 'Đã công khai trên cổng sự kiện', 'check') +
      stat('Bị từ chối', c.rejected || 0, c.rejected ? 'Cần bổ sung và gửi lại' : 'Không có hồ sơ cần bổ sung', 'xcircle');
    document.querySelectorAll('#tabs .tab').forEach((t) => {
      const base = t.textContent.replace(/\s*\(\d+\)$/, '');
      const n = t.dataset.st ? c[t.dataset.st] || 0 : c.all || 0;
      t.textContent = `${base} (${n})`;
    });
    render(d.events);
  }

  function actions(e) {
    const a = [`<a class="link muted" href="/event-detail.html?id=${e.id}">Xem</a>`];
    if (['draft', 'rejected'].includes(e.status)) {
      a.push(`<a class="link" href="/event-form.html?id=${e.id}">Sửa</a>`);
      a.push(`<a class="link" data-act="submit" data-id="${e.id}">${e.status === 'rejected' ? 'Gửi lại' : 'Gửi duyệt'}</a>`);
    }
    if (e.status === 'pending') a.push(`<a class="link muted" data-act="withdraw" data-id="${e.id}">Rút về nháp</a>`);
    if (e.status === 'approved') {
      a.push(`<a class="link" href="/attendance.html?event=${e.id}">Danh sách & điểm danh</a>`);
      if (e.review_count) a.push(`<a class="link" href="/reviews.html?event=${e.id}">Đánh giá</a>`);
      if (e.phase !== 'ended') a.push(`<a class="link danger" data-act="cancel" data-id="${e.id}">Hủy</a>`);
    }
    if (e.status === 'draft') a.push(`<a class="link danger" data-act="delete" data-id="${e.id}">Xóa</a>`);
    return a.join('');
  }

  function render(list) {
    $('rows').innerHTML = list.length ? list.map((e) => {
      const pct = Math.min(100, Math.round((e.registered_count / e.capacity) * 100));
      return `<tr>
        <td><a class="cell-title" href="/event-detail.html?id=${e.id}">${esc(e.title)}</a>
          <span class="cell-sub">${esc(e.code)} • ${esc(e.unit_short || '')} • ${esc(e.category_name)}</span>
          ${e.status === 'rejected' && e.review_note ? `<span class="reject-note"><b>Lý do từ chối:</b> ${esc(e.review_note)}</span>` : ''}
          ${e.status === 'cancelled' && e.cancel_reason ? `<span class="reject-note"><b>Lý do hủy:</b> ${esc(e.cancel_reason)}</span>` : ''}</td>
        <td><b>${fmtDate(e.start_at)}</b><span class="cell-sub">${weekday(e.start_at)} • ${fmtTime(e.start_at)}–${fmtTime(e.end_at)}</span></td>
        <td class="seat-mini">${['approved', 'cancelled'].includes(e.status) ? `${fmtNum(e.registered_count)}/${fmtNum(e.capacity)}<div class="bar"><i style="width:${pct}%"></i></div>` : `<span class="cell-sub">Tối đa ${fmtNum(e.capacity)}</span>`}</td>
        <td><div class="st-col">${tag(e.status)}${e.status === 'approved' ? tag(e.phase) : ''}${e.points_status ? `<span class="st ${{ pending: 'amber', approved: 'violet', rejected: 'red' }[e.points_status]}">${{ pending: 'Chờ duyệt điểm', approved: 'Đã duyệt điểm', rejected: 'Điểm bị từ chối' }[e.points_status]}</span>` : ''}</div></td>
        <td><div class="cell-actions">${actions(e)}</div></td></tr>`;
    }).join('') : `<tr><td colspan="5">${App.emptyState('Chưa có hồ sơ', 'Bấm "Tạo sự kiện mới" để bắt đầu.', 'folder')}</td></tr>`;
    $('count').textContent = `Hiển thị ${list.length} hồ sơ`;
    document.querySelectorAll('[data-act]').forEach((a) => a.addEventListener('click', () => act(a.dataset.act, Number(a.dataset.id), list.find((x) => x.id === Number(a.dataset.id)))));
  }

  async function act(action, id, e) {
    try {
      if (action === 'submit') {
        if (!(await confirmBox('Gửi hồ sơ kiểm duyệt?', `<b>${esc(e.title)}</b> sẽ được gửi tới Đơn vị quản lý. Trong thời gian chờ duyệt, hồ sơ không thể chỉnh sửa.`, 'Gửi duyệt'))) return;
        await api(`/api/events/${id}/submit`, { method: 'POST' }); toast('Đã gửi hồ sơ kiểm duyệt.', 'ok');
      }
      if (action === 'withdraw') {
        if (!(await confirmBox('Rút hồ sơ về nháp?', 'Hồ sơ sẽ rời hàng chờ duyệt để bạn chỉnh sửa và gửi lại.', 'Rút về nháp'))) return;
        await api(`/api/events/${id}/withdraw`, { method: 'POST' }); toast('Đã rút hồ sơ về nháp.', 'ok');
      }
      if (action === 'cancel') {
        const reason = await askReason('Hủy sự kiện', `${fmtNum(e.registered_count)} sinh viên đã đăng ký <b>${esc(e.title)}</b> sẽ nhận thông báo kèm lý do.`, { okText: 'Hủy sự kiện', danger: true, min: 5 });
        if (!reason) return;
        await api(`/api/events/${id}/cancel`, { method: 'POST', body: { reason } }); toast('Đã hủy sự kiện.', 'ok');
      }
      if (action === 'delete') {
        if (!(await confirmBox('Xóa hồ sơ nháp?', `Hồ sơ <b>${esc(e.title)}</b> và file đính kèm sẽ bị xóa vĩnh viễn.`, 'Xóa', true))) return;
        await api(`/api/events/${id}`, { method: 'DELETE' }); toast('Đã xóa hồ sơ nháp.', 'ok');
      }
      load();
    } catch (err) { toast(err.message, 'err'); }
  }

  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#tabs .tab.active').forEach((a) => a.classList.remove('active'));
    t.classList.add('active'); status = t.dataset.st; load();
  }));
  let timer;
  $('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  load();
})();
