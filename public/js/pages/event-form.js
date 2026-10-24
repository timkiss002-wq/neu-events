// Trang Tạo / sửa hồ sơ sự kiện (Ban tổ chức / Đơn vị quản lý)
(async function () {
  const { api, esc, icon, fmtSize, fmtDateTime, toast, toInput } = App;
  let user;
  try { ({ user } = await App.init({ page: 'manage', roles: ['organizer', 'admin'] })); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const form = $('form');
  const F = (n) => form.elements[n];
  const id = Number(App.param('id')) || null;
  const removeFiles = new Set();

  const meta = await api('/api/meta');
  F('category_id').innerHTML = '<option value="">— Chọn loại —</option>' + meta.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  F('unit_id').innerHTML = meta.units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  F('unit_id').value = user.unit_id || '';
  if (user.role !== 'admin') F('unit_id').disabled = true;
  F('level').innerHTML = meta.levels.map((l) => `<option value="${l.key}">${esc(l.name)} (mặc định ${l.points} điểm)</option>`).join('');
  F('level').value = 'khoa';
  F('level').addEventListener('change', () => { const l = meta.levels.find((x) => x.key === F('level').value); if (l) F('points').value = l.points; });

  // ----- Chương trình (agenda) -----
  function addAgenda(a = {}) {
    const row = document.createElement('div'); row.className = 'ag-row';
    row.innerHTML = `<input class="inp" placeholder="08:00 – 08:30" value="${esc(a.time_label || '')}" data-k="time_label">
      <input class="inp" placeholder="Nội dung" value="${esc(a.title || '')}" data-k="title">
      <input class="inp" placeholder="Ghi chú (không bắt buộc)" value="${esc(a.description || '')}" data-k="description">
      <button type="button" aria-label="Xóa mốc">${icon('trash')}</button>`;
    row.querySelector('button').onclick = () => row.remove();
    $('agenda').appendChild(row);
  }
  $('addAgenda').onclick = () => addAgenda();
  const agendaData = () => [...document.querySelectorAll('.ag-row')].map((r) => Object.fromEntries([...r.querySelectorAll('input')].map((i) => [i.dataset.k, i.value.trim()]))).filter((a) => a.title);

  // ----- Ảnh bìa xem trước -----
  const setCover = (url) => { $('coverPrev').style.backgroundImage = url ? `url('${url}')` : ''; };
  $('cover').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) setCover(URL.createObjectURL(f)); });

  // ----- Tự điền giờ kết thúc (+2 giờ) và hạn đăng ký (23:59 hôm trước) khi chọn giờ bắt đầu -----
  const p2 = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  F('start_at').addEventListener('change', () => {
    if (!F('start_at').value) return;
    const s0 = new Date(F('start_at').value);
    if (!F('end_at').value) { const e = new Date(s0); e.setHours(e.getHours() + 2); F('end_at').value = local(e); }
    if (!F('reg_deadline').value) { const r = new Date(s0); r.setDate(r.getDate() - 1); r.setHours(23, 59, 0, 0); F('reg_deadline').value = local(r); }
  });

  // ----- Nạp hồ sơ khi sửa -----
  if (id) {
    let ev;
    try { ({ event: ev } = await api(`/api/events/${id}`)); } catch (err) { document.querySelector('.container').innerHTML = `<div class="card">${App.emptyState('Không tìm thấy hồ sơ', err.message)}</div>`; return; }
    if (!ev.can_manage) { document.querySelector('.container').innerHTML = `<div class="card">${App.emptyState('Bạn không có quyền sửa hồ sơ này', '', 'lock')}</div>`; return; }
    if (!['draft', 'rejected'].includes(ev.status)) {
      document.querySelector('.container').innerHTML = `<div class="card">${App.emptyState('Hồ sơ không thể chỉnh sửa', 'Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Bị từ chối. Hồ sơ đang chờ duyệt có thể rút về nháp ở trang Quản lý sự kiện.', 'lock')}<div style="text-align:center"><a class="btn-primary" href="/manage-events.html">Về Quản lý sự kiện</a></div></div>`;
      return;
    }
    document.title = `Sửa: ${ev.title} – NEU Events`;
    $('heading').textContent = 'Chỉnh sửa hồ sơ sự kiện'; $('crumb').textContent = ev.code;
    for (const k of ['title', 'slogan', 'summary', 'description', 'benefits', 'preparation', 'location', 'capacity', 'fee', 'budget', 'contact_name', 'contact_phone', 'contact_email', 'category_id', 'unit_id', 'level', 'points']) if (F(k)) F(k).value = ev[k] ?? '';
    for (const k of ['start_at', 'end_at', 'reg_deadline']) F(k).value = toInput(ev[k]);
    ev.agenda.forEach(addAgenda);
    if (ev.cover_image) setCover(ev.cover_image);
    $('existingFiles').innerHTML = ev.files.map((f) => `<div class="ex-file" data-f="${f.id}"><span>${icon('file', 'style="width:13px;height:13px;display:inline;vertical-align:-2px"')} ${esc(f.original_name)} • ${fmtSize(f.size)}</span><a class="link danger" data-rm="${f.id}">Xóa</a></div>`).join('');
    document.querySelectorAll('[data-rm]').forEach((a) => a.addEventListener('click', () => {
      const fid = Number(a.dataset.rm); const row = a.closest('.ex-file');
      if (removeFiles.has(fid)) { removeFiles.delete(fid); row.classList.remove('rm'); a.textContent = 'Xóa'; } else { removeFiles.add(fid); row.classList.add('rm'); a.textContent = 'Hoàn tác'; }
    }));
    if (ev.status === 'rejected') $('rejectBox').innerHTML = `<div class="alert err"><b>Hồ sơ bị từ chối</b> (${esc(ev.reviewer_name || 'Đơn vị quản lý')} • ${fmtDateTime(ev.reviewed_at)}): ${esc(ev.review_note || '')}<br>Vui lòng bổ sung theo góp ý rồi bấm “Lưu & gửi duyệt”.</div>`;
    $('submitBtn').textContent = ev.status === 'rejected' ? 'Lưu & gửi duyệt lại' : 'Lưu & gửi duyệt';
  } else {
    F('contact_name').value = user.full_name; F('contact_phone').value = user.phone || ''; F('contact_email').value = user.email || '';
    [['08:00 – 08:30', 'Check-in & khai mạc'], ['08:30 – 10:30', 'Nội dung chính'], ['10:30 – 11:00', 'Hỏi đáp & bế mạc']].forEach(([t, n]) => addAgenda({ time_label: t, title: n }));
  }

  // ----- Kiểm tra phía client (máy chủ cũng kiểm tra lại) -----
  function validate() {
    const errs = [];
    form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    const need = (k, msg) => { if (!String(F(k).value).trim()) { F(k).classList.add('invalid'); errs.push(msg); } };
    need('title', 'Tên sự kiện'); need('category_id', 'Loại sự kiện'); need('start_at', 'Thời gian bắt đầu'); need('end_at', 'Thời gian kết thúc');
    need('reg_deadline', 'Hạn đăng ký'); need('location', 'Địa điểm'); need('capacity', 'Số lượng'); need('contact_name', 'Người phụ trách');
    if (errs.length) return `Vui lòng nhập: ${errs.join(', ')}.`;
    if (F('end_at').value <= F('start_at').value) { F('end_at').classList.add('invalid'); return 'Thời gian kết thúc phải sau thời gian bắt đầu.'; }
    if (F('reg_deadline').value > F('start_at').value) { F('reg_deadline').classList.add('invalid'); return 'Hạn đăng ký phải trước khi sự kiện bắt đầu.'; }
    return null;
  }

  async function save(submit) {
    $('formAlert').innerHTML = '';
    const err = validate();
    if (err) { $('formAlert').innerHTML = `<div class="alert err">${esc(err)}</div>`; return; }
    const fd = new FormData();
    for (const k of ['title', 'slogan', 'summary', 'description', 'benefits', 'preparation', 'location', 'capacity', 'fee', 'budget', 'contact_name', 'contact_phone', 'contact_email', 'category_id', 'unit_id', 'level', 'points', 'start_at', 'end_at', 'reg_deadline']) fd.append(k, F(k).value);
    fd.append('agenda', JSON.stringify(agendaData()));
    fd.append('remove_files', JSON.stringify([...removeFiles]));
    fd.append('submit', submit ? '1' : '0');
    if ($('cover').files[0]) fd.append('cover', $('cover').files[0]);
    for (const f of $('files').files) fd.append('files', f);
    [$('submitBtn'), $('draftBtn')].forEach((b) => { b.disabled = true; });
    try {
      const r = await api(id ? `/api/events/${id}` : '/api/events', { method: id ? 'PUT' : 'POST', form: fd });
      toast(submit ? 'Đã lưu và gửi hồ sơ kiểm duyệt.' : 'Đã lưu bản nháp.', 'ok');
      setTimeout(() => { location.href = submit ? '/manage-events.html?status=pending' : `/event-form.html?id=${r.id}`; }, 600);
    } catch (e) {
      $('formAlert').innerHTML = `<div class="alert err">${esc(e.message)}</div>`;
      [$('submitBtn'), $('draftBtn')].forEach((b) => { b.disabled = false; });
    }
  }
  $('submitBtn').onclick = () => save(true);
  $('draftBtn').onclick = () => save(false);
})();
