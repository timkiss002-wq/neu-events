// Trang Tổng quan hệ thống (Quản trị hệ thống): hạ tầng máy chủ, dữ liệu, tài khoản, sự kiện an ninh
(async function () {
  const { api, esc, icon, fmtNum, fmtSize, fmtDateTime, ago, toast, actionTag } = App;
  try { await App.init({ page: 'system', roles: ['sysadmin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const kv = (rows) => rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');
  const uptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return [d && `${d} ngày`, h && `${h} giờ`, `${m} phút`].filter(Boolean).join(' '); };
  const FEED_IC = { 'auth.lockout': ['lock', 'red'], 'auth.login_failed': ['alert', 'amber'], 'system.maintenance_on': ['alert', 'red'] };

  async function load() {
    let d;
    try { d = await api('/api/system/overview'); } catch (err) { $('stats').innerHTML = App.emptyState('Không tải được dữ liệu', err.message, 'server'); return; }
    $('banner').innerHTML = d.maintenance
      ? `<div class="banner amber">${icon('alert')}<div><b>Hệ thống đang ở chế độ bảo trì.</b> Chỉ tài khoản Quản trị hệ thống đăng nhập được. <a class="link" href="/settings.html">Tắt bảo trì</a></div></div>` : '';
    const ok = d.storage.integrity === 'ok';
    $('stats').innerHTML =
      stat('Tài khoản', fmtNum(d.users.total), `${fmtNum(d.users.active)} hoạt động • ${fmtNum(d.users.disabled || 0)} đã khóa`, 'users') +
      stat('Phiên đăng nhập', fmtNum(d.security.sessions), `${fmtNum(d.security.logins)} lượt đăng nhập trong 24 giờ`, 'activity') +
      stat('Cảnh báo an ninh (24 giờ)', fmtNum(d.security.failed + d.security.lockouts), `${fmtNum(d.security.failed)} lần sai mật khẩu • ${fmtNum(d.security.lockouts)} lần tạm khóa`, 'shield') +
      stat('Cơ sở dữ liệu', fmtSize(d.storage.db), `<span class="dot-st ${ok ? '' : 'bad'}">${ok ? 'Toàn vẹn' : 'Cần kiểm tra'}</span>`, 'database');

    const s = d.server;
    $('server').innerHTML = kv([
      ['Trạng thái', `<span class="dot-st ${d.maintenance ? 'warn' : ''}">${d.maintenance ? 'Đang bảo trì' : 'Đang hoạt động'}</span>`],
      ['Khởi động lúc', `${fmtDateTime(s.started_at)} (${uptime(s.uptime)})`],
      ['Máy chủ', `${esc(s.host)} • ${esc(s.platform)}`],
      ['Node.js / SQLite', `${esc(s.node)} • SQLite ${esc(s.sqlite)}`],
      ['Bộ nhớ tiến trình', `${fmtSize(s.memory)} • ${s.cpus} CPU`],
    ]);
    const st = d.storage, latest = st.backups.latest;
    $('storage').innerHTML = kv([
      ['Kiểm tra toàn vẹn CSDL', `<span class="dot-st ${ok ? '' : 'bad'}">${ok ? 'OK (PRAGMA quick_check)' : esc(st.integrity)}</span>`],
      ['Dữ liệu nghiệp vụ', `${fmtNum(d.data.events)} sự kiện • ${fmtNum(d.data.registrations)} lượt đăng ký • ${fmtNum(d.data.units)} đơn vị`],
      ['Nhật ký hệ thống', `${fmtNum(d.data.logs)} bản ghi`],
      ['File tải lên', `${fmtNum(st.uploads.files)} file • ${st.uploads.files ? fmtSize(st.uploads.size) : '0 KB'}`],
      ['Sao lưu gần nhất', latest
        ? `<span class="dot-st ${Date.now() - App.toDate(latest.created_at) > 86400000 ? 'warn' : ''}">${ago(latest.created_at)}</span> • ${st.backups.count} bản`
        : '<span class="dot-st bad">Chưa có bản sao lưu</span>'],
    ]);
    $('roles').innerHTML = d.by_role.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${fmtNum(r.n)}</td><td>${fmtNum(r.active)}</td><td>${fmtNum(r.n - r.active)}</td></tr>`).join('');
    $('feed').innerHTML = d.recent.length ? d.recent.map((a) => {
      const [ic, c] = FEED_IC[a.action] || ['history', ''];
      return `<div><span class="ic ${c}">${icon(ic)}</span><div>${actionTag(a.action)} ${esc(a.detail)}<small>${esc(a.actor_name || 'Hệ thống')} • ${ago(a.created_at)}</small></div></div>`;
    }).join('') : '<div class="hint">Chưa có sự kiện an ninh.</div>';
  }

  $('refreshBtn').onclick = () => load().then(() => toast('Đã cập nhật số liệu.', 'ok'));
  load();
})();
