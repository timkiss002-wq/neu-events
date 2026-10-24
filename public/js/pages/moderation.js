// Trang Kiểm duyệt sự kiện (Đơn vị quản lý)
(async function () {
  const { api, esc, icon, fmtDate, fmtTime, fmtDateTime, fmtRange, fmtNum, fmtMoney, fmtSize, nl2br, toast, confirmBox, coverOf } = App;
  let user;
  try { ({ user } = await App.init({ page: 'moderation', roles: ['admin'] })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let items = [], checks = [], selected = Number(App.param('id')) || null;
  const TAG = { pending: ['Chờ duyệt', 'amber'], approved: ['Đã duyệt', 'green'], rejected: ['Đã từ chối', 'red'], cancelled: ['Đã hủy', 'gray'] };
  const tagHtml = (s) => `<span class="tag ${TAG[s][1]}">${TAG[s][0]}</span>`;

  async function loadList() {
    const p = new URLSearchParams({ q: $('search').value.trim(), status: $('status').value });
    let d;
    try { d = await api(`/api/moderation?${p}`); } catch (err) { $('list').innerHTML = App.emptyState('Lỗi', err.message); return; }
    items = d.events; checks = d.checks;
    $('sPending').textContent = d.stats.pending || 0;
    $('sPendingSub').textContent = d.stats.pending_today ? `${d.stats.pending_today} hồ sơ mới gửi hôm nay` : 'Không có hồ sơ mới hôm nay';
    $('sApproved').textContent = d.stats.approved_month || 0; $('sApprovedSub').textContent = `Trong tháng ${d.month} • tổng ${d.stats.approved_total || 0}`;
    $('sRejected').textContent = d.stats.rejected || 0;
    if (!selected || !items.find((e) => e.id === selected)) selected = (items.find((e) => e.status === 'pending') || items[0] || {}).id || null;
    renderList();
    if (selected) loadDetail(selected); else $('detailCol').innerHTML = `<section class="card">${App.emptyState('Không có hồ sơ', 'Không tìm thấy hồ sơ phù hợp bộ lọc.', 'filetext')}</section>`;
  }

  function renderList() {
    $('list').innerHTML = items.length ? items.map((e) => `
      <button class="item ${e.id === selected ? 'selected' : ''}" data-id="${e.id}">
        <span class="item-title">${esc(e.title)}</span>
        <span class="item-sub">${esc(e.unit_short || e.unit_name)} • ${esc(e.code)}</span>
        <span class="item-foot">${tagHtml(e.status)}<span>${fmtDate(e.status === 'pending' ? e.submitted_at : (e.reviewed_at || e.submitted_at))}</span></span>
      </button>`).join('') : App.emptyState('Không có hồ sơ', '', 'filetext');
    document.querySelectorAll('#list .item').forEach((i) => i.addEventListener('click', () => {
      selected = Number(i.dataset.id); history.replaceState(null, '', `?id=${selected}`);
      document.querySelectorAll('#list .item.selected').forEach((s) => s.classList.remove('selected'));
      i.classList.add('selected'); loadDetail(selected);
    }));
  }

  async function loadDetail(id) {
    $('detailCol').innerHTML = `<section class="card">${App.loadingHtml}</section>`;
    let ev, logs;
    try { [{ event: ev }, { logs }] = await Promise.all([api(`/api/events/${id}`), api(`/api/events/${id}/history`)]); }
    catch (err) { $('detailCol').innerHTML = `<section class="card">${App.emptyState('Không tải được hồ sơ', err.message)}</section>`; return; }
    const pending = ev.status === 'pending';
    const selChecks = new Set(pending ? [] : ev.review_checks);

    const files = ev.files.length ? `<div class="files">${ev.files.map((f) => `<div class="file"><div>${icon('file')}<span>${esc(f.original_name)} • ${fmtSize(f.size)}</span></div><a href="/api/events/files/${f.id}/download" aria-label="Tải xuống">${icon('download')}</a></div>`).join('')}</div>`
      : '<p class="copy" style="margin-top:12px">Hồ sơ không có file đính kèm.</p>';

    const checkHtml = checks.map((c) => pending
      ? `<button class="check" data-check="${esc(c)}">${icon('check', 'stroke-width="2.2"')}${esc(c)}</button>`
      : `<span class="check ${selChecks.has(c) ? '' : 'off'}">${icon('check', 'stroke-width="2.2"')}${esc(c)}</span>`).join('');

    const decision = pending ? `
      <section class="card">
        <h3>Quyết định kiểm duyệt</h3>
        <div class="hint">Người thực hiện: ${esc(user.full_name)} • ${esc(user.unit_short || '')}</div>
        <div id="decAlert" style="margin-top:12px"></div>
        <label class="label" for="comment">Nhận xét / lý do từ chối (bắt buộc khi từ chối)</label>
        <textarea id="comment" placeholder="Nhập nhận xét cho ban tổ chức..."></textarea>
        <div class="actions">
          <button class="btn-primary" id="approveBtn">${icon('tick', 'stroke-width="2"')}Phê duyệt &amp; xuất bản</button>
          <button class="btn-danger" id="rejectBtn">${icon('x', 'stroke-width="2"')}Từ chối hồ sơ</button>
        </div>
        <p class="fine">Phê duyệt sẽ công khai sự kiện và mở đăng ký. Từ chối sẽ gửi lý do để ban tổ chức bổ sung và gửi duyệt lại.</p>
      </section>` : `
      <section class="card">
        <h3>Kết quả kiểm duyệt</h3>
        <div class="hint">${ev.reviewer_name ? `${esc(ev.reviewer_name)} • ${fmtDateTime(ev.reviewed_at)}` : 'Chưa có thông tin người duyệt'}</div>
        <div class="decision-note ${ev.status === 'rejected' ? 'red' : 'green'}">${ev.status === 'rejected' ? '<b>Lý do từ chối:</b> ' : '<b>Nhận xét:</b> '}${esc(ev.review_note || (ev.status === 'rejected' ? '' : 'Không có nhận xét.'))}</div>
        ${ev.status === 'cancelled' ? `<div class="decision-note red"><b>Sự kiện đã bị BTC hủy:</b> ${esc(ev.cancel_reason || '')}</div>` : ''}
        ${ev.status === 'approved' ? `<div class="actions"><a class="btn-primary" href="/event-detail.html?id=${ev.id}">${icon('eye')}Xem trang công khai</a></div>` : ''}
      </section>`;

    const LOGC = { 'event.approve': 'green', 'event.reject': 'red', 'event.cancel': 'red', 'event.create': 'gray' };
    const evLogs = logs.filter((l) => l.entity_type === 'event' && l.action.startsWith('event.'));
    const history = `<section class="card"><h3>Lịch sử hồ sơ</h3><div class="hint">Mọi thao tác trên hồ sơ được ghi lại</div>
      <div class="timeline">${evLogs.length ? evLogs.map((l) => `<div class="tl ${LOGC[l.action] || ''}"><i></i><div><b>${esc(l.detail)}</b><small>${esc(l.actor_name || 'Hệ thống')} • ${fmtDateTime(l.created_at)}</small>${l.reason ? `<p>${esc(l.reason)}</p>` : ''}</div></div>`).join('') : '<div class="hint">Chưa có lịch sử.</div>'}</div></section>`;

    $('detailCol').innerHTML = `
      <section class="card">
        <div class="detail-head">
          <div>
            <h3>${esc(ev.title)}</h3>
            <div class="hint">Mã hồ sơ: ${esc(ev.code)} • Gửi ngày ${fmtDate(ev.submitted_at)}, ${fmtTime(ev.submitted_at)}</div>
          </div>
          ${tagHtml(ev.status)}
        </div>
        <div class="cover" style="--cover-image:url('${coverOf(ev)}')"></div>
        <dl class="meta">
          <div><dt>Đơn vị tổ chức</dt><dd class="big">${esc(ev.unit_name)}</dd></div>
          <div><dt>Loại sự kiện / Quy mô</dt><dd>${esc(ev.category_name)} • ${fmtNum(ev.capacity)} sinh viên • ${esc(ev.fee || 'Miễn phí')}</dd></div>
          <div><dt>Thời gian tổ chức</dt><dd class="big">${fmtRange(ev.start_at, ev.end_at)}</dd></div>
          <div><dt>Kinh phí dự kiến</dt><dd class="big">${fmtMoney(ev.budget)}</dd></div>
          <div><dt>Địa điểm</dt><dd>${esc(ev.location)}</dd></div>
          <div><dt>Người phụ trách</dt><dd>${esc(ev.contact_name || '—')}${ev.contact_phone ? ` • ${esc(ev.contact_phone)}` : ''}</dd></div>
          <div><dt>Hạn đăng ký</dt><dd>${fmtDateTime(ev.reg_deadline)}</dd></div>
          <div><dt>Người tạo hồ sơ</dt><dd>${esc(ev.creator_name || '—')}</dd></div>
        </dl>
        <h4 class="section-title">Nội dung cần kiểm duyệt</h4>
        ${ev.slogan ? `<p class="copy"><b>${esc(ev.slogan)}</b></p>` : ''}
        <p class="copy">${nl2br(ev.summary)}</p>
        <p class="copy">${nl2br(ev.description)}</p>
        ${ev.benefits ? `<p class="copy"><b>Quyền lợi:</b> ${esc(ev.benefits.split('\n').join(' • '))}</p>` : ''}
        ${ev.preparation ? `<p class="copy"><b>Yêu cầu tham dự:</b> ${esc(ev.preparation.split('\n').join(' • '))}</p>` : ''}
        <div class="agenda-mini">${ev.agenda.map((a) => `<div><b>${esc(a.time_label)}</b>${esc(a.title)}</div>`).join('')}</div>
        ${files}
        <div class="checks">${checkHtml}</div>
      </section>
      ${decision}
      ${history}`;

    if (pending) {
      document.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
      const getChecks = () => [...document.querySelectorAll('[data-check].on')].map((b) => b.dataset.check);
      const decide = async (approve) => {
        const note = $('comment').value.trim();
        $('decAlert').innerHTML = '';
        if (!approve && note.length < 10) { $('decAlert').innerHTML = '<div class="alert err">Vui lòng nhập lý do từ chối (tối thiểu 10 ký tự) để ban tổ chức bổ sung.</div>'; $('comment').focus(); return; }
        if (approve && getChecks().length < checks.length && !(await confirmBox('Chưa đủ tiêu chí', 'Một số tiêu chí kiểm duyệt chưa được đánh dấu. Vẫn phê duyệt và xuất bản sự kiện?', 'Vẫn phê duyệt'))) return;
        if (!approve && !(await confirmBox('Từ chối hồ sơ?', 'Lý do sẽ được gửi tới ban tổ chức để bổ sung và gửi duyệt lại.', 'Từ chối', true))) return;
        try {
          await api(`/api/moderation/${ev.id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { note, checks: getChecks() } });
          toast(approve ? 'Đã phê duyệt và xuất bản sự kiện.' : 'Đã từ chối hồ sơ và gửi lý do tới ban tổ chức.', 'ok');
          loadList();
        } catch (err) { $('decAlert').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
      };
      $('approveBtn').onclick = () => decide(true);
      $('rejectBtn').onclick = () => decide(false);
    }
  }

  let t;
  $('search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadList, 300); });
  $('status').addEventListener('change', loadList);
  loadList();
})();
