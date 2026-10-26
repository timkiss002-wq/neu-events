// Trang Hồ sơ cá nhân: thông tin, liên hệ, đổi mật khẩu, nhật ký thao tác
(async function () {
  const { api, esc, icon, initials, fmtDate, fmtNum, ago, toast, ROLE } = App;
  try { await App.init({ page: 'profile' }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;

  async function load() {
    const { user: u, stats: s, activity } = await api('/api/auth/profile');
    const d = App.displayOf(u);
    $('who').innerHTML = `<div class="big-av">${esc(d.av)}</div><h3>${esc(d.name)}</h3><div class="hint">${ROLE[u.role]}</div>
      <dl>
        <div><dt>${u.role === 'student' ? 'Mã số sinh viên' : 'Mã tài khoản'}</dt><dd>${esc(u.code)}</dd></div>
        ${u.role === 'student' ? `<div><dt>Lớp</dt><dd>${esc(u.class_name || '—')}</dd></div>` : u.role === 'sysadmin' ? `<div><dt>Chức vụ</dt><dd>${esc(u.position || '—')}</dd></div>` : `<div><dt>Đơn vị</dt><dd>${esc(u.unit_name || '—')}</dd></div>`}
        <div><dt>Email</dt><dd>${esc(u.email)}</dd></div>
        <div><dt>Điện thoại</dt><dd>${esc(u.phone || '—')}</dd></div>
      </dl>`;
    $('stats').innerHTML = u.role === 'sysadmin'
      ? stat('Tài khoản hệ thống', fmtNum(s.users), `${fmtNum(s.active || 0)} đang hoạt động`, 'users') + stat('Đã khóa', fmtNum(s.locked || 0), 'Không thể đăng nhập', 'lock') + stat('Thao tác quản trị', fmtNum(s.actions || 0), 'Đã ghi nhật ký', 'history')
      : u.role === 'student'
      ? stat('Lượt đăng ký', fmtNum(s.total), 'Tất cả học kỳ', 'ticket1') + stat('Hoàn thành', fmtNum(s.completed || 0), `${fmtNum(s.present || 0)} lượt check-in • ${fmtNum(s.absent || 0)} vắng`, 'check') + stat('Điểm hoạt động', fmtNum(s.points || 0), 'Đã được duyệt cộng', 'gift')
      : stat('Hồ sơ sự kiện', fmtNum(s.total), u.role === 'admin' ? 'Toàn trường' : 'Của đơn vị', 'folder') + stat('Đã duyệt', fmtNum(s.approved || 0), 'Đã công khai', 'check') + stat('Chờ duyệt', fmtNum(s.pending || 0), 'Đang trong hàng chờ', 'clock');
    const f = $('infoForm'); f.email.value = u.email; f.phone.value = u.phone || '';
    $('activity').innerHTML = activity.length ? activity.map((a) => `<div>${esc(a.detail)}${a.reason ? ` – <i>${esc(a.reason)}</i>` : ''}<small>${ago(a.created_at)}</small></div>`).join('') : '<div class="hint">Chưa có hoạt động.</div>';
  }

  $('infoForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $('infoAlert').innerHTML = '';
    try { await api('/api/auth/profile', { method: 'PUT', body: { email: f.email.value, phone: f.phone.value } }); toast('Đã cập nhật thông tin.', 'ok'); load(); }
    catch (err) { $('infoAlert').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
  });
  $('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $('pwAlert').innerHTML = '';
    if (f.password.value !== f.confirm.value) { $('pwAlert').innerHTML = '<div class="alert err">Mật khẩu nhập lại không khớp.</div>'; return; }
    try { await api('/api/auth/password', { method: 'POST', body: { current: f.current.value, password: f.password.value } }); f.reset(); $('pwAlert').innerHTML = '<div class="alert ok">Đổi mật khẩu thành công.</div>'; load(); }
    catch (err) { $('pwAlert').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
  });
  load().catch((e) => toast(e.message, 'err'));
  if (location.hash === '#password') setTimeout(() => $('password').scrollIntoView(), 100);
})();
