// Trang An ninh & dữ liệu (Quản trị hệ thống): nhật ký hệ thống, phiên đăng nhập, sao lưu cơ sở dữ liệu
(async function () {
  const { api, esc, icon, fmtNum, fmtSize, fmtDateTime, ago, toast, confirmBox, ROLE, actionTag } = App;
  try { await App.init({ page: 'security', roles: ['sysadmin'] }); } catch { return; }
  const $ = (s) => document.getElementById(s);
  const stat = (label, val, sub, ic) => `<div class="stat"><div class="stat-top">${label} ${icon(ic)}</div><strong>${val}</strong><small>${sub}</small></div>`;
  const pagerHtml = (page, pages) => (pages > 1 ? `<button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">‹</button>` +
    Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
      .map((p, i, arr) => `${i && p - arr[i - 1] > 1 ? '<span>…</span>' : ''}<button class="${p === page ? 'on' : ''}" data-p="${p}">${p}</button>`).join('') +
    `<button ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">›</button>` : '');

  async function loadStats() {
    try {
      const d = await api('/api/system/overview');
      const latest = d.storage.backups.latest;
      $('stats').innerHTML =
        stat('Lượt đăng nhập (24 giờ)', fmtNum(d.security.logins), `${fmtNum(d.security.sessions)} phiên đang hoạt động`, 'activity') +
        stat('Đăng nhập sai (24 giờ)', fmtNum(d.security.failed), `${fmtNum(d.security.lockouts)} lần tạm khóa tài khoản`, 'alert') +
        stat('Tài khoản bị khóa', fmtNum((d.users.disabled || 0) + (d.users.temp_locked || 0)), `${fmtNum(d.users.temp_locked || 0)} đang tạm khóa đăng nhập`, 'lock') +
        stat('Sao lưu gần nhất', latest ? ago(latest.created_at) : 'Chưa có', latest ? `${d.storage.backups.count} bản • ${fmtSize(d.storage.backups.size)}` : 'Nên tạo bản sao lưu', 'database');
    } catch (err) { $('stats').innerHTML = App.emptyState('Không tải được số liệu', err.message, 'shield'); }
  }

  // ----- Nhật ký hệ thống -----
  let page = 1;
  const filters = () => new URLSearchParams({ kw: $('kw').value.trim(), group: $('fGroup').value, from: $('fFrom').value, to: $('fTo').value });
  async function loadAudit() {
    const qs = filters(); qs.set('page', page);
    let d;
    try { d = await api(`/api/system/audit?${qs}`); } catch (err) { $('auditRows').innerHTML = `<tr><td colspan="4">${App.emptyState('Không tải được nhật ký', err.message)}</td></tr>`; return; }
    $('auditRows').innerHTML = d.rows.length ? d.rows.map((a) => `<tr>
        <td class="muted-cell">${fmtDateTime(a.created_at)}</td>
        <td>${a.actor_name ? `<b class="cell-title">${esc(a.actor_name)}</b><span class="cell-sub">${esc(ROLE[a.actor_role] || '')} • ${esc(a.actor_code)}</span>` : '<span class="muted-cell">Hệ thống</span>'}</td>
        <td>${actionTag(a.action)}<span class="cell-sub mono">${esc(a.action)}</span></td>
        <td>${esc(a.detail)}${a.reason ? `<span class="cell-sub">Lý do: ${esc(a.reason)}</span>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="4">${App.emptyState('Không có bản ghi phù hợp', '', 'history')}</td></tr>`;
    const from = (d.page - 1) * d.size + 1;
    $('auditCount').textContent = d.total ? `Hiển thị ${fmtNum(from)}–${fmtNum(from + d.rows.length - 1)} / ${fmtNum(d.total)} bản ghi` : '';
    $('auditPager').innerHTML = pagerHtml(page, Math.ceil(d.total / d.size));
    $('auditPager').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { page = Number(b.dataset.p); loadAudit(); }; });
  }
  let timer;
  $('kw').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; loadAudit(); }, 250); });
  ['fGroup', 'fFrom', 'fTo'].forEach((id) => $(id).addEventListener('change', () => { page = 1; loadAudit(); }));
  $('exportBtn').onclick = () => App.download(`/api/system/audit/export?${filters()}`);

  // ----- Phiên đăng nhập -----
  const device = (ua) => {
    if (!ua) return '—';
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Khác';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl/i.test(ua) ? 'curl' : 'Trình duyệt khác';
    return `${br} • ${os}`;
  };
  async function loadSessions() {
    let d;
    try { d = await api('/api/system/sessions'); } catch (err) { $('sessionRows').innerHTML = `<tr><td colspan="5">${App.emptyState('Không tải được danh sách phiên', err.message)}</td></tr>`; return; }
    $('sessionRows').innerHTML = d.rows.length ? d.rows.map((s) => `<tr>
        <td><b class="cell-title">${esc(s.user.full_name)}${s.current ? ' <span class="st gray">Phiên của bạn</span>' : ''}</b><span class="cell-sub">${esc(ROLE[s.user.role])} • ${esc(s.user.code)}</span></td>
        <td class="muted-cell">${s.login_at ? fmtDateTime(s.login_at) : '—'}${s.remember ? '<span class="cell-sub">Ghi nhớ đăng nhập</span>' : ''}</td>
        <td>${s.last_seen ? ago(s.last_seen) : '—'}${s.idle_expired ? '<span class="cell-sub">Đã hết hạn do không thao tác</span>' : ''}</td>
        <td><span class="mono">${esc(s.ip || '—')}</span><span class="cell-sub">${esc(device(s.agent))}</span></td>
        <td>${s.current ? '<span class="muted-cell">—</span>' : `<a class="link danger" data-sid="${esc(s.sid)}" data-name="${esc(s.user.full_name)}">Buộc đăng xuất</a>`}</td></tr>`).join('')
      : `<tr><td colspan="5">${App.emptyState('Không có phiên đăng nhập', '', 'users')}</td></tr>`;
    document.querySelectorAll('[data-sid]').forEach((a) => a.addEventListener('click', async () => {
      if (!(await confirmBox('Buộc đăng xuất?', `Phiên đăng nhập của <b>${esc(a.dataset.name)}</b> sẽ bị hủy ngay lập tức.`, 'Buộc đăng xuất', true))) return;
      try { await api(`/api/system/sessions/${encodeURIComponent(a.dataset.sid)}`, { method: 'DELETE' }); toast('Đã hủy phiên đăng nhập.', 'ok'); loadSessions(); loadStats(); }
      catch (err) { toast(err.message, 'err'); }
    }));
  }

  // ----- Sao lưu -----
  function renderBackups(d) {
    if (d.keep) $('backupHint').innerHTML = `Bản sao lưu lưu tại thư mục <span class="mono">${esc(d.dir || 'data/backups')}</span> trên máy chủ; giữ lại tối đa ${d.keep} bản gần nhất (đổi tại <a class="link" href="/settings.html">Cấu hình hệ thống</a>).`;
    $('backupRows').innerHTML = d.rows.length ? d.rows.map((b, i) => `<tr>
        <td><span class="mono">${esc(b.name)}</span>${i === 0 ? ' <span class="st green">Mới nhất</span>' : ''}</td>
        <td class="muted-cell">${fmtDateTime(b.created_at)}</td><td>${fmtSize(b.size)}</td>
        <td><div class="cell-actions"><a class="link" data-dl="${esc(b.name)}">Tải về</a><a class="link danger" data-del="${esc(b.name)}">Xóa</a></div></td></tr>`).join('')
      : `<tr><td colspan="4">${App.emptyState('Chưa có bản sao lưu', 'Bấm "Tạo bản sao lưu ngay" để sao lưu toàn bộ cơ sở dữ liệu.', 'database')}</td></tr>`;
    document.querySelectorAll('[data-dl]').forEach((a) => a.addEventListener('click', () => App.download(`/api/system/backups/${encodeURIComponent(a.dataset.dl)}/download`)));
    document.querySelectorAll('[data-del]').forEach((a) => a.addEventListener('click', async () => {
      if (!(await confirmBox('Xóa bản sao lưu?', `<span class="mono">${esc(a.dataset.del)}</span> sẽ bị xóa vĩnh viễn khỏi máy chủ.`, 'Xóa', true))) return;
      try { const r = await api(`/api/system/backups/${encodeURIComponent(a.dataset.del)}`, { method: 'DELETE' }); renderBackups(r); toast('Đã xóa bản sao lưu.', 'ok'); loadStats(); }
      catch (err) { toast(err.message, 'err'); }
    }));
  }
  async function loadBackups() {
    try { renderBackups(await api('/api/system/backups')); } catch (err) { $('backupRows').innerHTML = `<tr><td colspan="4">${App.emptyState('Không tải được danh sách', err.message)}</td></tr>`; }
  }
  $('backupBtn').onclick = async () => {
    $('backupBtn').disabled = true;
    try { const r = await api('/api/system/backups', { method: 'POST' }); renderBackups(r); toast(`Đã tạo bản sao lưu ${r.name}.`, 'ok'); loadStats(); }
    catch (err) { toast(err.message, 'err'); }
    $('backupBtn').disabled = false;
  };

  // ----- Chuyển tab -----
  const LOADERS = { audit: loadAudit, sessions: loadSessions, backup: loadBackups };
  function show(view) {
    document.querySelectorAll('#viewTabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
    Object.keys(LOADERS).forEach((k) => { $(`view-${k}`).hidden = k !== view; });
    LOADERS[view]();
  }
  document.querySelectorAll('#viewTabs .tab').forEach((t) => t.addEventListener('click', () => { history.replaceState(null, '', `#${t.dataset.view}`); show(t.dataset.view); }));
  loadStats();
  show(LOADERS[location.hash.slice(1)] ? location.hash.slice(1) : 'audit');
})();
