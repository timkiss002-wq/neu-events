// Trang Người dùng & phân quyền (Quản trị hệ thống): cấp tài khoản mọi vai trò, đổi vai trò, khóa/mở khóa,
// đặt lại mật khẩu, gỡ tạm khóa đăng nhập; xem ma trận phân quyền 4 phân hệ
(async function () {
  const { api, esc, icon, fmtNum, ago, toast, modal, confirmBox, ROLE } = App;
  try { await App.init({ page: 'users', roles: ['sysadmin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const NEU = /^[^\s@]+@([a-z0-9-]+\.)*neu\.edu\.vn$/i;
  const ROLE_TAG = { student: '', organizer: 'navy', admin: 'green', sysadmin: 'violet' };
  const STAFF = ['organizer', 'admin', 'sysadmin'];
  let data = { rows: [], units: [], counts: {}, me: 0, password_min_length: 6 };
  let page = 1;

  const roleTag = (r) => `<span class="st ${ROLE_TAG[r]}">${esc(ROLE[r])}</span>`;
  function stateTag(u) {
    if (!u.is_active) return '<span class="st red">Đã khóa</span>';
    if (u.temp_locked) return `<span class="st amber" title="Đến ${esc(u.locked_until)}">Tạm khóa đăng nhập</span>`;
    return '<span class="st green">Hoạt động</span>';
  }
  const unitOpts = (sel) => data.units.map((u) => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('');

  async function load() {
    const qs = new URLSearchParams({ page, kw: $('kw').value.trim(), role: $('fRole').value, status: $('fStatus').value });
    try { data = await api(`/api/system/users?${qs}`); } catch (err) { $('rows').innerHTML = `<tr><td colspan="5">${App.emptyState('Không tải được dữ liệu', err.message)}</td></tr>`; return; }
    const c = data.counts;
    $('stats').innerHTML = stat('Tổng tài khoản', fmtNum(c.total), `${fmtNum(c.student)} sinh viên`, 'users') +
      stat('Ban tổ chức', fmtNum(c.organizer), `${data.units.filter((u) => !u.accounts).length} đơn vị chưa có tài khoản`, 'building') +
      stat('Cán bộ quản lý & quản trị', fmtNum(c.admin + c.sysadmin), `${fmtNum(c.admin)} đơn vị quản lý • ${fmtNum(c.sysadmin)} quản trị`, 'shield') +
      stat('Đã khóa / tạm khóa', `${fmtNum(c.disabled || 0)} / ${fmtNum(c.temp || 0)}`, 'Không thể đăng nhập', 'lock');
    render();
  }

  function render() {
    const rows = data.rows;
    $('rows').innerHTML = rows.length ? rows.map((u) => {
      const self = u.id === data.me;
      const sub = u.role === 'student' ? `MSSV ${u.code}${u.class_name ? ` • ${u.class_name}` : ''}`
        : u.role === 'organizer' ? `${u.unit_short || ''} • Mã ${u.code}` : `${u.position || 'Cán bộ'} • Mã ${u.code}`;
      return `<tr>
        <td><b class="cell-title">${esc(u.full_name)}${self ? ' <span class="st gray">Bạn</span>' : ''}</b><span class="cell-sub">${esc(sub)}</span></td>
        <td>${roleTag(u.role)}</td>
        <td>${esc(u.email)}<span class="cell-sub">${u.last_login ? `Đăng nhập ${ago(u.last_login)}` : 'Chưa đăng nhập'}${u.failed_logins ? ` • sai mật khẩu ${u.failed_logins} lần` : ''}</span></td>
        <td>${stateTag(u)}</td>
        <td><div class="cell-actions">
          <a class="link" data-act="edit" data-id="${u.id}">Sửa</a>
          ${u.role !== 'student' && !self ? `<a class="link" data-act="role" data-id="${u.id}">Phân quyền</a>` : ''}
          <a class="link" data-act="pw" data-id="${u.id}">Đặt lại mật khẩu</a>
          ${u.temp_locked ? `<a class="link" data-act="unlock" data-id="${u.id}">Gỡ tạm khóa</a>` : ''}
          ${self ? '' : `<a class="link ${u.is_active ? 'danger' : ''}" data-act="lock" data-id="${u.id}">${u.is_active ? 'Khóa' : 'Mở khóa'}</a>`}
        </div></td></tr>`;
    }).join('') : `<tr><td colspan="5">${App.emptyState('Không có tài khoản phù hợp', '', 'users')}</td></tr>`;
    const from = (data.page - 1) * data.size + 1;
    $('count').textContent = data.total ? `Hiển thị ${from}–${from + rows.length - 1} / ${fmtNum(data.total)} tài khoản` : '';
    const pages = Math.ceil(data.total / data.size);
    $('pager').innerHTML = pages > 1 ? `<button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">‹</button>` +
      Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
        .map((p, i, arr) => `${i && p - arr[i - 1] > 1 ? '<span>…</span>' : ''}<button class="${p === page ? 'on' : ''}" data-p="${p}">${p}</button>`).join('') +
      `<button ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">›</button>` : '';
    $('pager').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { page = Number(b.dataset.p); load(); }; });
    document.querySelectorAll('#rows [data-act]').forEach((el) => el.addEventListener('click', () => act(el.dataset.act, data.rows.find((x) => x.id === Number(el.dataset.id)))));
  }

  const put = (u, body) => api(`/api/system/users/${u.id}`, { method: 'PUT', body });

  async function act(action, u) {
    const who = `<b>${esc(u.full_name)}</b> (${esc(u.code)})`;
    if (action === 'edit') {
      const isOrg = u.role === 'organizer';
      const v = await modal({ title: 'Sửa thông tin tài khoản', desc: `${who} – ${ROLE[u.role]}`, okText: 'Lưu', wide: true,
        html: `<div class="form-grid2">
          ${isOrg ? '' : `<div class="full"><label class="label">Họ tên <span class="req">*</span></label><input class="inp" id="m-name" value="${esc(u.full_name)}"></div>`}
          <div><label class="label">Email đăng nhập <span class="req">*</span></label><input class="inp" id="m-email" value="${esc(u.email)}"></div>
          <div><label class="label">Số điện thoại</label><input class="inp" id="m-phone" value="${esc(u.phone || '')}"></div>
          ${u.role !== 'student' ? `<div class="full"><label class="label">Đơn vị</label><select class="inp" id="m-unit">${isOrg ? '' : '<option value="">— Không thuộc đơn vị —</option>'}${unitOpts(u.unit_id)}</select></div>` : ''}
        </div>`,
        onOk: async (root) => {
          const body = { email: root.querySelector('#m-email').value.trim(), phone: root.querySelector('#m-phone').value };
          if (u.role !== 'student' && !NEU.test(body.email)) throw new Error('Email tài khoản cán bộ / đơn vị phải có đuôi @neu.edu.vn.');
          const n = root.querySelector('#m-name'); if (n) body.full_name = n.value;
          const un = root.querySelector('#m-unit'); if (un && un.value) body.unit_id = Number(un.value);
          return put(u, body);
        } });
      if (v) { toast('Đã cập nhật tài khoản.', 'ok'); load(); }
    }
    if (action === 'role') {
      const v = await modal({ title: 'Phân quyền tài khoản', desc: `${who}. Vai trò quyết định phân hệ và chức năng tài khoản được sử dụng; thay đổi có hiệu lực ngay ở lần thao tác tiếp theo.`, okText: 'Cập nhật quyền',
        html: `<label class="label">Vai trò <span class="req">*</span></label>
          <select class="inp" id="m-role">${STAFF.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>
          <div id="m-unitbox" style="margin-top:12px" ${u.role === 'organizer' ? '' : 'hidden'}><label class="label">Đơn vị tổ chức <span class="req">*</span></label><select class="inp" id="m-unit">${unitOpts(u.unit_id)}</select></div>
          <label class="label" style="margin-top:12px">Lý do thay đổi <span class="req">*</span></label><textarea class="inp" id="m-reason" placeholder="VD: Điều chuyển công tác, bổ sung quyền kiểm duyệt..."></textarea>`,
        onOk: async (root) => {
          const role = root.querySelector('#m-role').value;
          const reason = root.querySelector('#m-reason').value.trim();
          if (role === u.role) throw new Error('Vai trò chưa thay đổi.');
          if (reason.length < 5) throw new Error('Vui lòng nhập lý do (tối thiểu 5 ký tự).');
          return put(u, { role, unit_id: Number(root.querySelector('#m-unit').value) || undefined, reason });
        } });
      if (v) { toast('Đã cập nhật phân quyền.', 'ok'); load(); }
    }
    if (action === 'pw') {
      const v = await modal({ title: 'Đặt lại mật khẩu', desc: `${who}. Gửi mật khẩu mới cho người dùng; họ nên đổi lại sau khi đăng nhập.`, okText: 'Đặt lại',
        html: `<label class="label">Mật khẩu mới <span class="req">*</span></label><input class="inp" id="m-pw" type="text" placeholder="Tối thiểu ${data.password_min_length} ký tự">`,
        onOk: async (root) => put(u, { password: root.querySelector('#m-pw').value }) });
      if (v) { toast('Đã đặt lại mật khẩu.', 'ok'); load(); }
    }
    if (action === 'unlock') {
      try { await put(u, { unlock: true }); toast('Đã gỡ tạm khóa đăng nhập.', 'ok'); load(); } catch (err) { toast(err.message, 'err'); }
    }
    if (action === 'lock') {
      const v = await modal({ title: u.is_active ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?', okText: u.is_active ? 'Khóa' : 'Mở khóa', danger: !!u.is_active,
        desc: u.is_active ? `${who} sẽ bị đăng xuất và không thể đăng nhập cho đến khi được mở khóa.` : `${who} có thể đăng nhập trở lại.`,
        html: `<label class="label">Lý do ${u.is_active ? '<span class="req">*</span>' : ''}</label><textarea class="inp" id="m-reason" placeholder="Lý do được ghi vào nhật ký hệ thống"></textarea>`,
        onOk: async (root) => {
          const reason = root.querySelector('#m-reason').value.trim();
          if (u.is_active && reason.length < 5) throw new Error('Vui lòng nhập lý do khóa (tối thiểu 5 ký tự).');
          return put(u, { is_active: !u.is_active, reason });
        } });
      if (v) { toast('Đã cập nhật trạng thái tài khoản.', 'ok'); load(); }
    }
  }
  // Ẩn/hiện ô đơn vị khi chọn vai trò trong hộp thoại phân quyền
  document.addEventListener('change', (e) => {
    if (e.target.id === 'm-role') { const box = document.getElementById('m-unitbox'); if (box) box.hidden = e.target.value !== 'organizer'; }
  });

  // ----- Cấp tài khoản mới -----
  $('addBtn').onclick = async () => {
    const pending = modal({
      title: 'Cấp tài khoản mới', okText: 'Cấp tài khoản', wide: true,
      desc: 'Tài khoản cán bộ / đơn vị dùng email đuôi @neu.edu.vn; mã đăng nhập được hệ thống tự sinh. Sinh viên dùng MSSV 8 chữ số.',
      html: `<label class="label">Vai trò <span class="req">*</span></label>
        <select class="inp" id="n-role"><option value="organizer">Ban tổ chức (tài khoản đơn vị)</option><option value="student">Sinh viên</option><option value="admin">Đơn vị quản lý</option><option value="sysadmin">Quản trị hệ thống</option></select>
        <div id="n-student" hidden style="margin-top:12px"><div class="form-grid2">
          <div><label class="label">Mã số sinh viên <span class="req">*</span></label><input class="inp" id="n-code" inputmode="numeric" placeholder="VD: 11245678"></div>
          <div><label class="label">Lớp</label><input class="inp" id="n-class" placeholder="VD: Logistics 66B"></div></div></div>
        <div id="n-org" style="margin-top:12px">
          <div class="seg" style="display:flex;gap:16px;margin-bottom:8px"><label><input type="radio" name="n-mode" value="old" checked> Đơn vị có sẵn</label><label><input type="radio" name="n-mode" value="new"> Đơn vị mới</label></div>
          <div id="n-old"><label class="label">Đơn vị <span class="req">*</span></label><select class="inp" id="n-unit">${data.units.map((u) => `<option value="${u.id}">${esc(u.name)}${u.accounts ? ` (đã có ${u.accounts} tài khoản)` : ''}</option>`).join('')}</select></div>
          <div id="n-new" hidden><div class="form-grid2"><div><label class="label">Tên đơn vị <span class="req">*</span></label><input class="inp" id="n-uname" placeholder="VD: Liên chi đoàn Khoa Marketing"></div>
            <div><label class="label">Tên viết tắt</label><input class="inp" id="n-ushort" placeholder="VD: LCĐ Khoa Marketing"></div></div></div>
        </div>
        <div id="n-staff" hidden style="margin-top:12px"><div class="form-grid2">
          <div><label class="label">Chức vụ</label><input class="inp" id="n-pos" placeholder="VD: Chuyên viên"></div>
          <div><label class="label">Đơn vị công tác</label><select class="inp" id="n-sunit"><option value="">— Không thuộc đơn vị —</option>${unitOpts(0)}</select></div></div></div>
        <div class="form-grid2" style="margin-top:12px">
          <div class="full" id="n-namebox" hidden><label class="label">Họ tên <span class="req">*</span></label><input class="inp" id="n-name"></div>
          <div><label class="label">Email đăng nhập <span class="req" id="n-emailreq">*</span></label><input class="inp" id="n-email" placeholder="ten@neu.edu.vn"></div>
          <div><label class="label">Mật khẩu ban đầu <span class="req">*</span></label><input class="inp" id="n-pw" type="text" placeholder="Tối thiểu ${data.password_min_length} ký tự"></div>
          <div class="full"><label class="label">Số điện thoại</label><input class="inp" id="n-phone"></div>
        </div>`,
      onOk: async (root) => {
        const v = (id) => root.querySelector(id).value.trim();
        const role = v('#n-role');
        const body = { role, email: v('#n-email'), password: root.querySelector('#n-pw').value, phone: v('#n-phone') };
        if (role === 'student') Object.assign(body, { code: v('#n-code'), class_name: v('#n-class'), full_name: v('#n-name') });
        else if (role === 'organizer') {
          if (!NEU.test(body.email)) throw new Error('Email tài khoản Ban tổ chức phải có đuôi @neu.edu.vn.');
          if (root.querySelector('input[name="n-mode"]:checked').value === 'old') body.unit_id = Number(v('#n-unit'));
          else Object.assign(body, { unit_name: v('#n-uname'), unit_short: v('#n-ushort') });
        } else {
          if (!NEU.test(body.email)) throw new Error('Email tài khoản cán bộ phải có đuôi @neu.edu.vn.');
          Object.assign(body, { full_name: v('#n-name'), position: v('#n-pos'), unit_id: Number(v('#n-sunit')) || null });
        }
        return api('/api/system/users', { method: 'POST', body });
      },
    });
    const sync = () => {
      const role = document.getElementById('n-role').value;
      document.getElementById('n-student').hidden = role !== 'student';
      document.getElementById('n-org').hidden = role !== 'organizer';
      document.getElementById('n-staff').hidden = !['admin', 'sysadmin'].includes(role);
      document.getElementById('n-namebox').hidden = role === 'organizer';
      document.getElementById('n-emailreq').hidden = role === 'student';
      document.getElementById('n-email').placeholder = role === 'student' ? 'Để trống: MSSV@st.neu.edu.vn' : 'ten@neu.edu.vn';
      const isNew = document.querySelector('input[name="n-mode"]:checked').value === 'new';
      document.getElementById('n-old').hidden = isNew; document.getElementById('n-new').hidden = !isNew;
    };
    document.getElementById('n-role').addEventListener('change', sync);
    document.querySelectorAll('input[name="n-mode"]').forEach((r) => r.addEventListener('change', sync));
    if (await pending) { toast('Đã cấp tài khoản mới.', 'ok'); page = 1; load(); }
  };

  // ----- Ma trận phân quyền -----
  let matrixLoaded = false;
  async function loadMatrix() {
    if (matrixLoaded) return;
    const { roles, modules } = await api('/api/system/permissions');
    $('roleCards').innerHTML = roles.map((r) => `<div>${roleTag(r.key)}<b>${esc(r.name)}</b>${esc(r.desc)}</div>`).join('');
    const yes = `<span class="yes" title="Được phép">${icon('tick')}</span>`, no = `<span class="no" title="Không">${icon('x')}</span>`;
    $('matrix').innerHTML = `<thead><tr><th style="width:44%">Chức năng</th>${roles.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>` +
      modules.map((m) => `<tr class="mod"><td colspan="${roles.length + 1}">${esc(m.name)}</td></tr>` +
        m.functions.map((f) => `<tr><td>${esc(f.name)}</td>${roles.map((r) => `<td>${f.roles.includes(r.key) ? yes : no}</td>`).join('')}</tr>`).join('')).join('') + '</tbody>';
    matrixLoaded = true;
  }

  document.querySelectorAll('#viewTabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#viewTabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    $('view-list').hidden = t.dataset.view !== 'list';
    $('view-matrix').hidden = t.dataset.view !== 'matrix';
    if (t.dataset.view === 'matrix') loadMatrix().catch((e) => toast(e.message, 'err'));
    $('addBtn').hidden = t.dataset.view !== 'list';
  }));

  let timer;
  $('kw').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; load(); }, 250); });
  $('fRole').addEventListener('change', () => { page = 1; load(); });
  $('fStatus').addEventListener('change', () => { page = 1; load(); });
  if (location.hash === '#matrix') document.querySelector('#viewTabs [data-view="matrix"]').click();
  load();
})();
