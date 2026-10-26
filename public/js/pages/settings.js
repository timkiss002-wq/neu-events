// Trang Cấu hình hệ thống (Quản trị hệ thống): tham số chung, điểm danh, bảo mật, sao lưu; chế độ bảo trì
(async function () {
  const { api, esc, icon, ago, toast, confirmBox } = App;
  try { await App.init({ page: 'settings', roles: ['sysadmin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  let groups = [];
  let original = {};

  const control = (it) => {
    if (it.type === 'bool') return `<label class="switch"><input type="checkbox" data-key="${it.key}" ${it.value ? 'checked' : ''}><span class="track"></span><span data-label>${it.value ? 'Đang bật' : 'Đang tắt'}</span></label>`;
    if (it.type === 'int') return `<input class="inp" type="number" data-key="${it.key}" min="${it.min}" max="${it.max}" step="1" value="${it.value}">`;
    return `<input class="inp" type="${it.type === 'email' ? 'email' : 'text'}" data-key="${it.key}" ${it.max ? `maxlength="${it.max}"` : ''} value="${esc(it.value)}">`;
  };
  const defText = (it) => (it.type === 'bool' ? (it.def ? 'Bật' : 'Tắt') : it.def);

  function render(payload) {
    groups = payload.groups;
    original = {};
    groups.forEach((g) => g.items.forEach((it) => { original[it.key] = it.value; }));
    $('groups').innerHTML = groups.map((g, i) => `<section class="card ${i ? 'sec-gap' : ''}">
        <h3>${esc(g.name)}</h3><div class="hint">${esc(g.desc)}</div>
        <div style="margin-top:6px">${g.items.map((it) => `<div class="set-row" data-row="${it.key}">
          <div><div class="lbl">${esc(it.label)}</div>
            ${it.help ? `<div class="help">${esc(it.help)}</div>` : ''}
            <div class="meta">${it.type === 'int' ? `Giới hạn ${it.min}–${it.max} • ` : ''}Mặc định: ${esc(defText(it))}${it.updated ? ` • Sửa bởi ${esc(it.updated.updated_by || '—')} ${ago(it.updated.updated_at)}` : ''}</div></div>
          <div>${control(it)}</div></div>`).join('')}</div></section>`).join('');
    $('banner').innerHTML = original.maintenance_mode
      ? `<div class="banner amber">${icon('alert')}<div><b>Chế độ bảo trì đang bật.</b> Người dùng khác đã bị đăng xuất và chỉ thấy thông báo bảo trì ở trang đăng nhập.</div></div>` : '';
    document.querySelectorAll('[data-key]').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', onChange));
    onChange();
  }

  function current() {
    const v = {};
    document.querySelectorAll('[data-key]').forEach((el) => {
      v[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
    });
    return v;
  }
  function diff() { const c = current(); return Object.fromEntries(Object.entries(c).filter(([k, val]) => val !== original[k])); }
  function onChange(e) {
    if (e && e.target.type === 'checkbox') e.target.parentElement.querySelector('[data-label]').textContent = e.target.checked ? 'Đang bật' : 'Đang tắt';
    const d = diff();
    document.querySelectorAll('.set-row').forEach((r) => r.classList.toggle('changed', r.dataset.row in d));
    const n = Object.keys(d).length;
    $('saveBar').hidden = !n;
    $('saveHint').textContent = `${n} tham số chưa lưu.`;
  }

  async function load() {
    try { render(await api('/api/system/settings')); } catch (err) { $('groups').innerHTML = `<div class="card">${App.emptyState('Không tải được cấu hình', err.message, 'settings')}</div>`; }
  }

  $('saveBtn').onclick = async () => {
    const d = diff();
    if ('maintenance_mode' in d && d.maintenance_mode && !(await confirmBox('Bật chế độ bảo trì?', 'Tất cả người dùng không phải Quản trị hệ thống sẽ bị đăng xuất và không thể đăng nhập cho tới khi tắt bảo trì.', 'Bật bảo trì', true))) return;
    $('saveBtn').disabled = true;
    try {
      const r = await api('/api/system/settings', { method: 'PUT', body: { values: d } });
      render(r); toast(`Đã lưu ${r.changed} tham số.`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    $('saveBtn').disabled = false;
  };
  $('undoBtn').onclick = () => render({ groups });
  $('resetBtn').onclick = async () => {
    if (!(await confirmBox('Khôi phục cấu hình mặc định?', 'Toàn bộ tham số trở về giá trị mặc định ban đầu (chế độ bảo trì sẽ tắt).', 'Khôi phục', true))) return;
    try { render(await api('/api/system/settings/reset', { method: 'POST' })); toast('Đã khôi phục cấu hình mặc định.', 'ok'); } catch (err) { toast(err.message, 'err'); }
  };
  window.addEventListener('beforeunload', (e) => { if (Object.keys(diff()).length) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
