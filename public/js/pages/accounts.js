// Trang Tài khoản đơn vị (Đơn vị quản lý): cấp email + mật khẩu cho Ban tổ chức, đặt lại mật khẩu, khóa/mở khóa
(async function () {
  const { api, esc, icon, fmtDate, ago, toast, modal, confirmBox } = App;
  try { await App.init({ page: 'accounts', roles: ['admin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const NEU = /^[^\s@]+@([a-z0-9-]+\.)*neu\.edu\.vn$/i;
  let data = { accounts: [], units: [] };

  async function load() {
    try { data = await api('/api/admin/accounts'); } catch (err) { $('rows').innerHTML = `<tr><td colspan="5">${App.emptyState('Không tải được dữ liệu', err.message)}</td></tr>`; return; }
    const active = data.accounts.filter((a) => a.is_active).length;
    $('stats').innerHTML = stat('Tài khoản Ban tổ chức', data.accounts.length, `${active} đang hoạt động`, 'users') +
      stat('Đơn vị trong hệ thống', data.units.length, `${data.units.filter((u) => !u.accounts).length} đơn vị chưa có tài khoản`, 'building') +
      stat('Đã khóa', data.accounts.length - active, 'Không thể đăng nhập', 'lock');
    render();
  }

  function render() {
    const kw = $('search').value.trim().toLowerCase();
    const list = data.accounts.filter((a) => !kw || (a.unit_name || '').toLowerCase().includes(kw) || a.email.toLowerCase().includes(kw));
    $('rows').innerHTML = list.length ? list.map((a) => `<tr>
        <td><b class="cell-title">${esc(a.unit_name || a.full_name)}</b><span class="cell-sub">${esc(a.unit_short || '')} • Mã đăng nhập ${esc(a.code)}</span></td>
        <td class="acc-email">${esc(a.email)}<span class="cell-sub">${a.last_login ? `Đăng nhập ${ago(a.last_login)}` : 'Chưa đăng nhập'}</span></td>
        <td>${a.event_count}</td>
        <td>${a.is_active ? '<span class="st green">Hoạt động</span>' : '<span class="st red">Đã khóa</span>'}</td>
        <td><div class="cell-actions">
          <a class="link" data-act="email" data-id="${a.id}">Đổi email</a>
          <a class="link" data-act="pw" data-id="${a.id}">Đặt lại mật khẩu</a>
          <a class="link ${a.is_active ? 'danger' : ''}" data-act="lock" data-id="${a.id}">${a.is_active ? 'Khóa' : 'Mở khóa'}</a>
        </div></td></tr>`).join('') : `<tr><td colspan="5">${App.emptyState('Không có tài khoản phù hợp', '', 'users')}</td></tr>`;
    $('count').textContent = `Hiển thị ${list.length} / ${data.accounts.length} tài khoản`;
    document.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => act(el.dataset.act, data.accounts.find((x) => x.id === Number(el.dataset.id)))));
  }

  async function act(action, a) {
    if (action === 'email') {
      const v = await modal({ title: 'Đổi email đăng nhập', desc: `Đơn vị: <b>${esc(a.unit_name)}</b>`, okText: 'Lưu',
        html: `<label class="label">Email mới <span class="req">*</span></label><input class="inp" id="m-email" value="${esc(a.email)}">`,
        onOk: async (root) => { const email = root.querySelector('#m-email').value.trim(); if (!NEU.test(email)) throw new Error('Email phải có đuôi @neu.edu.vn.'); return api(`/api/admin/accounts/${a.id}`, { method: 'PUT', body: { email } }); } });
      if (v) { toast('Đã cập nhật email.', 'ok'); load(); }
    }
    if (action === 'pw') {
      const v = await modal({ title: 'Đặt lại mật khẩu', desc: `Đơn vị: <b>${esc(a.unit_name)}</b>. Gửi mật khẩu mới cho đơn vị; đơn vị nên đổi lại sau khi đăng nhập.`, okText: 'Đặt lại',
        html: '<label class="label">Mật khẩu mới <span class="req">*</span></label><input class="inp" id="m-pw" type="text" placeholder="Tối thiểu 6 ký tự">',
        onOk: async (root) => api(`/api/admin/accounts/${a.id}`, { method: 'PUT', body: { password: root.querySelector('#m-pw').value } }) });
      if (v) toast('Đã đặt lại mật khẩu.', 'ok');
    }
    if (action === 'lock') {
      if (!(await confirmBox(a.is_active ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?', a.is_active ? `<b>${esc(a.unit_name)}</b> sẽ không thể đăng nhập cho đến khi được mở khóa.` : `<b>${esc(a.unit_name)}</b> có thể đăng nhập trở lại.`, a.is_active ? 'Khóa' : 'Mở khóa', a.is_active))) return;
      try { await api(`/api/admin/accounts/${a.id}`, { method: 'PUT', body: { is_active: !a.is_active } }); toast('Đã cập nhật.', 'ok'); load(); }
      catch (err) { toast(err.message, 'err'); }
    }
  }

  $('addBtn').onclick = async () => {
    const pending = modal({
      title: 'Cấp tài khoản Ban tổ chức', okText: 'Cấp tài khoản', wide: true,
      desc: 'Dành cho đơn vị đăng ký sử dụng hệ thống. Email bắt buộc có đuôi @neu.edu.vn; đơn vị có thể tự đổi email, mật khẩu sau khi đăng nhập.',
      html: `<div class="seg"><label><input type="radio" name="m-mode" value="old" checked> Đơn vị có sẵn</label><label><input type="radio" name="m-mode" value="new"> Đơn vị mới</label></div>
        <div id="m-old"><label class="label">Đơn vị <span class="req">*</span></label><select class="inp" id="m-unit">${data.units.map((u) => `<option value="${u.id}">${esc(u.name)}${u.accounts ? ` (đã có ${u.accounts} tài khoản)` : ''}</option>`).join('')}</select></div>
        <div id="m-new" hidden><div class="form-grid"><div><label class="label">Tên đơn vị <span class="req">*</span></label><input class="inp" id="m-uname" placeholder="VD: Liên chi đoàn Khoa CNTT"></div>
          <div><label class="label">Tên viết tắt</label><input class="inp" id="m-ushort" placeholder="VD: LCĐ Khoa CNTT"></div></div></div>
        <div class="form-grid" style="margin-top:4px">
          <div><label class="label">Email đăng nhập <span class="req">*</span></label><input class="inp" id="m-email" placeholder="ten.donvi@neu.edu.vn"></div>
          <div><label class="label">Mật khẩu ban đầu <span class="req">*</span></label><input class="inp" id="m-pw" type="text" placeholder="Tối thiểu 6 ký tự"></div>
          <div class="full"><label class="label">Số điện thoại liên hệ</label><input class="inp" id="m-phone"></div>
        </div>`,
      onOk: async (root) => {
        const mode = root.querySelector('input[name="m-mode"]:checked').value;
        const email = root.querySelector('#m-email').value.trim();
        if (!NEU.test(email)) throw new Error('Email tài khoản Ban tổ chức phải có đuôi @neu.edu.vn.');
        const body = { email, password: root.querySelector('#m-pw').value, phone: root.querySelector('#m-phone').value };
        if (mode === 'old') body.unit_id = Number(root.querySelector('#m-unit').value);
        else { body.unit_name = root.querySelector('#m-uname').value; body.unit_short = root.querySelector('#m-ushort').value; }
        return api('/api/admin/accounts', { method: 'POST', body });
      },
    });
    document.querySelectorAll('input[name="m-mode"]').forEach((r) => r.addEventListener('change', () => {
      const isNew = document.querySelector('input[name="m-mode"]:checked').value === 'new';
      document.getElementById('m-old').hidden = isNew; document.getElementById('m-new').hidden = !isNew;
    }));
    if (await pending) { toast('Đã cấp tài khoản. Đơn vị đăng nhập bằng email vừa cấp.', 'ok'); load(); }
  };
  $('search').addEventListener('input', render);
  load();
})();
