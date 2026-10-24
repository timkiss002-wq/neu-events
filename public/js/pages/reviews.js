// Trang Đánh giá: sinh viên đánh giá sự kiện đã tham dự • BTC/quản lý xem tổng hợp phản hồi
(async function () {
  const { api, esc, icon, stars, fmtDate, fmtTime, fmtNum, toast, modal, ago } = App;
  let user;
  try { ({ user } = await App.init({ page: 'reviews' })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const score = (x) => (x ? String(Number(x).toFixed(1)).replace('.', ',') : '—');

  // ======================= SINH VIÊN =======================
  async function student() {
    let d;
    try { d = await api('/api/reviews/mine'); } catch (err) { $('content').innerHTML = `<div class="card">${App.emptyState('Lỗi', err.message)}</div>`; return; }
    const avg = d.items.filter((x) => x.rating).reduce((s, x, _, a) => s + x.rating / a.length, 0);
    $('stats').innerHTML = stat('Chờ đánh giá', d.pending, 'Sự kiện đã tham dự chưa đánh giá', 'clock') +
      stat('Đã đánh giá', d.done, 'Có thể chỉnh sửa bất cứ lúc nào', 'check') +
      stat('Điểm bạn chấm TB', d.done ? score(avg) : '—', 'Trên thang 5 sao', 'star');
    $('content').innerHTML = `<section class="card"><h3>Sự kiện đã tham dự</h3><div class="hint">Sự kiện chưa đánh giá được xếp lên đầu</div>
      <div class="rv-list">${d.items.length ? d.items.map((x) => `
        <div class="rv-item ${x.rating ? '' : 'todo'}">
          <div><b>${esc(x.title)}</b><small>${fmtDate(x.start_at)} • ${esc(x.unit_short || '')} • Check-in ${fmtTime(x.checked_in_at)}${x.checked_out_at ? ` • Check-out ${fmtTime(x.checked_out_at)}` : ''}</small>
            ${x.rating ? `<p>${stars(x.rating)}${x.is_anonymous ? ' <span class="st gray">Ẩn danh</span>' : ''}${x.comment ? `<br>${esc(x.comment)}` : ''}</p>` : ''}</div>
          <div class="rv-right">${x.rating ? `<span class="st green">Đã đánh giá ${ago(x.updated_at)}</span><button class="btn-outline btn-sm" data-ev="${x.event_id}">${icon('edit')}Sửa đánh giá</button>`
            : `<span class="st amber">Chờ đánh giá</span><button class="btn-primary btn-sm" data-ev="${x.event_id}">${icon('star')}Đánh giá ngay</button>`}</div>
        </div>`).join('') : App.emptyState('Chưa có sự kiện để đánh giá', 'Hãy tham dự và điểm danh để mở đánh giá.', 'chat')}</div></section>`;
    document.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => openForm(d.items.find((x) => x.event_id === Number(b.dataset.ev)))));
    const pre = Number(App.param('event'));
    if (pre) {
      const it = d.items.find((x) => x.event_id === pre);
      history.replaceState(null, '', location.pathname);
      if (it) openForm(it); else toast('Chỉ sự kiện bạn đã tham dự mới được mở đánh giá.', 'err');
    }
  }

  async function openForm(x) {
    let rating = x.rating || 0;
    const LBL = ['Chọn số sao', 'Rất không hài lòng', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Rất hài lòng'];
    const pending = modal({
      title: x.rating ? 'Sửa đánh giá' : 'Đánh giá sự kiện', okText: 'Gửi đánh giá',
      desc: `<b>${esc(x.title)}</b> • ${fmtDate(x.start_at)}`,
      html: `<label class="label">Mức độ hài lòng <span class="req">*</span></label>
        <div class="star-input" id="m-stars">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}" aria-label="${i} sao"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg></button>`).join('')}</div>
        <div class="help-text" id="m-lbl"></div>
        <label class="label">Nhận xét (không bắt buộc)</label>
        <textarea class="inp" id="m-cmt" maxlength="1000" placeholder="Nội dung, diễn giả, công tác tổ chức…">${esc(x.comment || '')}</textarea>
        <label class="anon-row"><input type="checkbox" id="m-anon" ${x.is_anonymous ? 'checked' : ''}> <span><b>Đánh giá ẩn danh</b><br><small>Ban tổ chức chỉ thấy số sao và nhận xét, không thấy họ tên, MSSV của bạn.</small></span></label>`,
      onOk: async (root) => {
        if (!rating) throw new Error('Vui lòng chọn số sao.');
        await api('/api/reviews', { method: 'POST', body: { event_id: x.event_id, rating, comment: root.querySelector('#m-cmt').value, is_anonymous: root.querySelector('#m-anon').checked } });
      },
    });
    // Hộp thoại đã được thêm vào DOM ngay khi gọi modal() → gắn sự kiện cho các ngôi sao
    const paint = () => {
      document.querySelectorAll('#m-stars button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= rating));
      document.getElementById('m-lbl').textContent = LBL[rating];
    };
    document.querySelectorAll('#m-stars button').forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.v); paint(); }));
    paint();
    if (await pending) { toast('Cảm ơn bạn đã đánh giá!', 'ok'); student(); }
  }

  // ======================= BTC / QUẢN LÝ =======================
  let selected = Number(App.param('event')) || null;
  async function manager() {
    $('sub').textContent = user.role === 'admin' ? 'Phản hồi của sinh viên về các sự kiện toàn trường.' : `Phản hồi của sinh viên về sự kiện do ${user.unit_short || 'đơn vị'} tổ chức.`;
    let d;
    try { d = await api(`/api/reviews/manage${selected ? `?event_id=${selected}` : ''}`); } catch (err) { $('content').innerHTML = `<div class="card">${App.emptyState('Lỗi', err.message)}</div>`; return; }
    const low = d.reviews.filter((r) => r.rating <= 2).length;
    $('stats').innerHTML = stat('Điểm trung bình', score(d.overall.avg), `${fmtNum(d.overall.n)} lượt đánh giá`, 'star') +
      stat('Sự kiện có đánh giá', d.events.length, 'Đã kết thúc hoặc đang diễn ra', 'calendar') +
      stat('Đánh giá thấp (≤ 2 sao)', d.selected ? low : '—', 'Trong sự kiện đang xem', 'alert');
    if (!d.events.length) { $('content').innerHTML = `<div class="card">${App.emptyState('Chưa có đánh giá', 'Đánh giá xuất hiện sau khi sinh viên tham dự sự kiện.', 'chat')}</div>`; return; }
    const ev = d.selected; selected = ev.id;
    const total = d.reviews.length || 1;
    $('content').innerHTML = `<div class="two">
      <section class="card"><h3>Sự kiện</h3><div class="hint">Chọn để xem chi tiết phản hồi</div>
        <div class="ev-pick">${d.events.map((e) => `<button class="${e.id === selected ? 'sel' : ''}" data-id="${e.id}"><b>${esc(e.title)}</b><small><span>${fmtDate(e.start_at)}</span><span>★ ${score(e.avg_rating)} • ${e.review_count}</span></small></button>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h3>${esc(ev.title)}</h3><div class="hint">${fmtDate(ev.start_at)} • ${esc(ev.unit_short)} • ${fmtNum(ev.present_count)} người tham dự</div></div>
          <a class="btn-outline btn-sm" href="/event-detail.html?id=${ev.id}">Chi tiết</a></div>
        <div class="big-score"><strong>${score(ev.avg_rating)}</strong><div>${stars(ev.avg_rating || 0)}<div class="hint">${fmtNum(ev.review_count)} đánh giá • tỷ lệ phản hồi ${ev.present_count ? Math.round((ev.review_count / ev.present_count) * 100) : 0}%</div></div></div>
        <div class="dist">${[5, 4, 3, 2, 1].map((s) => `<div class="dist-row"><span>${s} sao</span><div class="bar"><i style="width:${(d.distribution[s - 1] / total) * 100}%"></i></div><span>${d.distribution[s - 1]}</span></div>`).join('')}</div>
        <h4 style="font-size:16.5px;margin-top:18px">Nhận xét của sinh viên</h4>
        <div class="comments">${d.reviews.map((r) => `<div class="cmt"><div class="cmt-head"><b>${esc(r.full_name)}${r.student_code ? ` <small>• ${esc(r.student_code)}</small>` : ''}</b>${stars(r.rating)}</div>${r.comment ? `<p>${esc(r.comment)}</p>` : '<p class="hint">Không có nhận xét.</p>'}<small>${ago(r.created_at)}</small></div>`).join('')}</div>
      </section></div>`;
    document.querySelectorAll('.ev-pick button').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.id); history.replaceState(null, '', `?event=${selected}`); manager(); }));
  }

  if (user.role === 'student') student(); else manager();
})();
