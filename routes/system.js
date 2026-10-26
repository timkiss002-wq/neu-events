// Phân hệ Quản trị hệ thống (vai trò 'sysadmin'):
//  - Quản lý người dùng & phân quyền: cấp tài khoản mọi vai trò, đổi vai trò, khóa/mở khóa, đặt lại mật khẩu
//  - Cấu hình hệ thống: tham số chung, điểm danh, chính sách bảo mật, chế độ bảo trì
//  - An toàn an ninh dữ liệu & hạ tầng: tổng quan máy chủ, nhật ký hệ thống, phiên đăng nhập, sao lưu CSDL
const express = require('express');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { q, open, DB_PATH, DATA_DIR } = require('../db/database');
const { now, fmt, audit, notify, wrap, fail, isNeuEmail, addMinutes } = require('../lib/util');
const settings = require('../lib/settings');
const { ROLES, MODULES } = require('../lib/permissions');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('sysadmin'));

const ROLE_NAME = Object.fromEntries(ROLES.map((r) => [r.key, r.name]));
const STAFF = ['organizer', 'admin', 'sysadmin'];
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const STARTED_AT = now();
const minPw = () => settings.get('password_min_length');

// Kích thước file / thư mục (byte)
const fileSize = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
function dirStats(dir) {
  let size = 0, files = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, name));
      if (st.isFile() && !name.startsWith('.')) { size += st.size; files++; }
    }
  } catch { /* thư mục chưa tồn tại */ }
  return { size, files };
}

// Danh sách phiên đăng nhập trong bộ nhớ máy chủ
function listSessions(store) {
  return new Promise((resolve) => {
    if (!store || typeof store.all !== 'function') return resolve([]);
    store.all((err, all) => {
      if (err || !all) return resolve([]);
      const entries = Array.isArray(all) ? all.map((s) => [s.id, s]) : Object.entries(all);
      resolve(entries.filter(([, s]) => s && s.userId).map(([sid, s]) => ({ sid, ...s })));
    });
  });
}

// ===================== TỔNG QUAN HỆ THỐNG =====================
router.get('/overview', wrap(async (req, res) => {
  const at = now();
  const day = addMinutes(at, -24 * 60);
  const users = q.get(`SELECT COUNT(*) total, SUM(is_active = 1) active, SUM(is_active = 0) disabled,
                              SUM(locked_until > ?) temp_locked FROM users`, at);
  const byRole = q.all('SELECT role, COUNT(*) n, SUM(is_active = 1) active FROM users GROUP BY role');
  const data = q.get(`SELECT (SELECT COUNT(*) FROM events) events, (SELECT COUNT(*) FROM events WHERE status = 'pending') pending,
                             (SELECT COUNT(*) FROM registrations) registrations, (SELECT COUNT(*) FROM audit_logs) logs,
                             (SELECT COUNT(*) FROM units) units`);
  const security = q.get(`SELECT SUM(action = 'auth.login') logins, SUM(action = 'auth.login_failed') failed, SUM(action = 'auth.lockout') lockouts
                          FROM audit_logs WHERE created_at >= ?`, day);
  const recent = q.all(`SELECT a.action, a.detail, a.reason, a.created_at, u.full_name AS actor_name, u.role AS actor_role
                        FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
                        WHERE a.action LIKE 'auth.lockout' OR a.action LIKE 'auth.login_failed' OR a.action LIKE 'system.%' OR a.action LIKE 'account.%'
                        ORDER BY a.id DESC LIMIT 6`);
  const sessions = await listSessions(req.sessionStore);
  const backups = listBackups();
  const integrity = open().prepare('PRAGMA quick_check').get();
  const mem = process.memoryUsage();
  res.json({
    users, by_role: byRole.map((r) => ({ ...r, name: ROLE_NAME[r.role] || r.role })), data,
    security: { logins: security.logins || 0, failed: security.failed || 0, lockouts: security.lockouts || 0, sessions: sessions.length },
    storage: {
      db: fileSize(DB_PATH) + fileSize(`${DB_PATH}-wal`), uploads: dirStats(UPLOAD_DIR),
      backups: { count: backups.length, size: backups.reduce((s, b) => s + b.size, 0), latest: backups[0] || null },
      integrity: Object.values(integrity || {})[0] || 'unknown',
    },
    server: {
      started_at: STARTED_AT, uptime: Math.round(process.uptime()), node: process.version, platform: `${os.type()} ${os.release()}`,
      memory: mem.rss, cpus: os.cpus().length, host: os.hostname(), sqlite: q.get('SELECT sqlite_version() v').v,
    },
    maintenance: settings.get('maintenance_mode'),
    recent,
  });
}));

// ===================== NGƯỜI DÙNG & PHÂN QUYỀN =====================
router.get('/users', wrap((req, res) => {
  const { role = '', status = '', kw = '' } = req.query;
  const size = Math.min(100, Math.max(5, Number(req.query.size) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);
  const at = now();
  const where = ['1=1']; const params = [];
  if (ROLE_NAME[role]) { where.push('u.role = ?'); params.push(role); }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'disabled') where.push('u.is_active = 0');
  if (status === 'temp') { where.push('u.locked_until > ?'); params.push(at); }
  if (kw.trim()) {
    where.push('(lower(u.full_name) LIKE ? OR lower(u.email) LIKE ? OR lower(u.code) LIKE ? OR lower(IFNULL(un.name, \'\')) LIKE ?)');
    const k = `%${kw.trim().toLowerCase()}%`; params.push(k, k, k, k);
  }
  const base = `FROM users u LEFT JOIN units un ON un.id = u.unit_id WHERE ${where.join(' AND ')}`;
  const total = q.get(`SELECT COUNT(*) n ${base}`, ...params).n;
  const rows = q.all(`SELECT u.id, u.code, u.email, u.full_name, u.role, u.unit_id, u.class_name, u.position, u.phone, u.is_active,
                             u.failed_logins, u.locked_until, u.created_at, un.name AS unit_name, un.short_name AS unit_short,
                             (SELECT MAX(created_at) FROM audit_logs a WHERE a.actor_id = u.id AND a.action = 'auth.login') AS last_login
                      ${base} ORDER BY CASE u.role WHEN 'sysadmin' THEN 0 WHEN 'admin' THEN 1 WHEN 'organizer' THEN 2 ELSE 3 END, u.full_name
                      LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size)
    .map((u) => ({ ...u, temp_locked: !!(u.locked_until && u.locked_until > at) }));
  const counts = q.get(`SELECT COUNT(*) total, SUM(role='student') student, SUM(role='organizer') organizer, SUM(role='admin') admin,
                               SUM(role='sysadmin') sysadmin, SUM(is_active = 0) disabled, SUM(locked_until > ?) temp FROM users`, at);
  const units = q.all(`SELECT un.id, un.name, un.short_name, (SELECT COUNT(*) FROM users u WHERE u.unit_id = un.id AND u.role = 'organizer') AS accounts
                       FROM units un ORDER BY un.name`);
  res.json({ rows, total, page, size, counts, units, roles: ROLES, me: req.user.id, password_min_length: minPw() });
}));

function nextCode(prefix) {
  const row = q.get(`SELECT code FROM users WHERE code LIKE ? AND substr(code, ${prefix.length + 1}) GLOB '[0-9]*'
                     ORDER BY CAST(substr(code, ${prefix.length + 1}) AS INTEGER) DESC LIMIT 1`, `${prefix}%`);
  const n = row ? Number(row.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}
const PREFIX = { organizer: 'DV', admin: 'CB', sysadmin: 'QT' };

function emailTaken(email, exceptId = 0) {
  return q.get('SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?', email, exceptId);
}

// Cấp tài khoản mới (mọi vai trò)
router.post('/users', wrap((req, res) => {
  const b = req.body || {};
  const role = String(b.role || '');
  if (!ROLE_NAME[role]) fail(400, 'Vai trò không hợp lệ.');
  const password = String(b.password || '');
  if (password.length < minPw()) fail(400, `Mật khẩu tối thiểu ${minPw()} ký tự.`);
  const phone = String(b.phone || '').trim() || null;
  const at = now();

  const id = q.tx(() => {
    let code, email = String(b.email || '').trim().toLowerCase(), fullName = String(b.full_name || '').trim(), unitId = Number(b.unit_id) || null;
    let className = null, position = null;
    if (role === 'student') {
      code = String(b.code || '').trim();
      if (!/^\d{8}$/.test(code)) fail(400, 'Mã số sinh viên gồm 8 chữ số.');
      if (q.get('SELECT 1 FROM users WHERE code = ?', code)) fail(409, 'Mã số sinh viên đã tồn tại.');
      if (!email) email = `${code}@st.neu.edu.vn`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Email không hợp lệ.');
      if (fullName.length < 3) fail(400, 'Vui lòng nhập họ tên sinh viên.');
      className = String(b.class_name || '').trim() || null;
      unitId = null;
    } else {
      if (!isNeuEmail(email)) fail(400, 'Email tài khoản cán bộ / đơn vị phải có đuôi @neu.edu.vn.');
      code = nextCode(PREFIX[role]);
      if (role === 'organizer') {
        if (!unitId) {
          const name = String(b.unit_name || '').trim();
          const short = String(b.unit_short || '').trim() || name;
          if (name.length < 3) fail(400, 'Vui lòng chọn đơn vị hoặc nhập tên đơn vị mới.');
          if (q.get('SELECT 1 FROM units WHERE lower(name) = lower(?)', name)) fail(409, 'Đơn vị đã tồn tại, hãy chọn trong danh sách.');
          unitId = q.run('INSERT INTO units (name, short_name) VALUES (?,?)', name, short).id;
        }
        const unit = q.get('SELECT * FROM units WHERE id = ?', unitId);
        if (!unit) fail(404, 'Không tìm thấy đơn vị.');
        fullName = unit.name; // tài khoản BTC mang tên đơn vị
      } else {
        if (fullName.length < 3) fail(400, 'Vui lòng nhập họ tên cán bộ.');
        position = String(b.position || '').trim() || null;
        if (unitId && !q.get('SELECT 1 FROM units WHERE id = ?', unitId)) fail(404, 'Không tìm thấy đơn vị.');
      }
    }
    if (emailTaken(email)) fail(409, 'Email đã được dùng bởi tài khoản khác.');
    const uid = q.run(`INSERT INTO users (code,email,password_hash,full_name,role,unit_id,class_name,position,phone,created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)`, code, email, bcrypt.hashSync(password, 8), fullName, role, unitId, className, position, phone, at).id;
    audit(req.user.id, 'account.create', 'user', uid, `Cấp tài khoản ${ROLE_NAME[role]}: ${fullName} (${email}, mã ${code})`);
    notify(uid, { type: 'account', title: 'Chào mừng đến NEU Events', body: `Tài khoản ${ROLE_NAME[role]} của bạn đã được cấp. Hãy đổi mật khẩu tại Hồ sơ cá nhân.`, link: '/profile.html#password' });
    return uid;
  });
  res.json({ ok: true, id });
}));

// Cập nhật: thông tin, phân quyền (vai trò), khóa/mở khóa, đặt lại mật khẩu, gỡ tạm khóa
router.put('/users/:id', wrap((req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
  if (!u) fail(404, 'Không tìm thấy tài khoản.');
  const b = req.body || {};
  const self = u.id === req.user.id;
  const parts = [];
  const activeSysadmins = () => q.get("SELECT COUNT(*) n FROM users WHERE role = 'sysadmin' AND is_active = 1").n;

  q.tx(() => {
    if (b.full_name !== undefined && u.role !== 'organizer') {
      const name = String(b.full_name).trim();
      if (name.length < 3) fail(400, 'Họ tên tối thiểu 3 ký tự.');
      if (name !== u.full_name) { q.run('UPDATE users SET full_name = ? WHERE id = ?', name, u.id); parts.push(`họ tên "${name}"`); }
    }
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (u.role === 'student' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : !isNeuEmail(email)) fail(400, u.role === 'student' ? 'Email không hợp lệ.' : 'Email tài khoản cán bộ / đơn vị phải có đuôi @neu.edu.vn.');
      if (emailTaken(email, u.id)) fail(409, 'Email đã được dùng bởi tài khoản khác.');
      if (email !== u.email) { q.run('UPDATE users SET email = ? WHERE id = ?', email, u.id); parts.push(`email ${email}`); }
    }
    if (b.phone !== undefined && String(b.phone).trim() !== (u.phone || '')) {
      q.run('UPDATE users SET phone = ? WHERE id = ?', String(b.phone).trim() || null, u.id); parts.push('số điện thoại');
    }
    if (b.role !== undefined && b.role !== u.role) {
      const role = String(b.role);
      if (self) fail(400, 'Không thể tự thay đổi vai trò của chính mình.');
      if (!STAFF.includes(role) || u.role === 'student') fail(400, 'Chỉ chuyển đổi vai trò giữa các tài khoản cán bộ (Ban tổ chức, Đơn vị quản lý, Quản trị hệ thống). Tài khoản sinh viên gắn với MSSV nên giữ nguyên vai trò.');
      if (u.role === 'sysadmin' && u.is_active && activeSysadmins() <= 1) fail(400, 'Hệ thống cần ít nhất một tài khoản Quản trị hệ thống đang hoạt động.');
      const unitId = Number(b.unit_id) || u.unit_id;
      if (role === 'organizer' && !unitId) fail(400, 'Tài khoản Ban tổ chức phải gắn với một đơn vị.');
      q.run('UPDATE users SET role = ?, unit_id = ? WHERE id = ?', role, unitId || null, u.id);
      parts.push(`phân quyền ${ROLE_NAME[u.role]} → ${ROLE_NAME[role]}`);
      notify(u.id, { type: 'account', title: 'Quyền tài khoản đã thay đổi', body: `Tài khoản của bạn được chuyển sang vai trò ${ROLE_NAME[role]}.`, link: '/profile.html' });
    } else if (b.unit_id !== undefined && Number(b.unit_id) && Number(b.unit_id) !== u.unit_id && u.role !== 'student') {
      if (!q.get('SELECT 1 FROM units WHERE id = ?', Number(b.unit_id))) fail(404, 'Không tìm thấy đơn vị.');
      q.run('UPDATE users SET unit_id = ? WHERE id = ?', Number(b.unit_id), u.id); parts.push('đơn vị');
    }
    if (b.password) {
      if (String(b.password).length < minPw()) fail(400, `Mật khẩu tối thiểu ${minPw()} ký tự.`);
      q.run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', bcrypt.hashSync(String(b.password), 8), u.id);
      parts.push('đặt lại mật khẩu');
    }
    if (b.unlock) {
      q.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', u.id); parts.push('gỡ tạm khóa đăng nhập');
    }
    if (b.is_active !== undefined && !!b.is_active !== !!u.is_active) {
      if (self) fail(400, 'Không thể tự khóa tài khoản của chính mình.');
      if (!b.is_active && u.role === 'sysadmin' && activeSysadmins() <= 1) fail(400, 'Hệ thống cần ít nhất một tài khoản Quản trị hệ thống đang hoạt động.');
      q.run('UPDATE users SET is_active = ? WHERE id = ?', b.is_active ? 1 : 0, u.id); parts.push(b.is_active ? 'mở khóa tài khoản' : 'khóa tài khoản');
    }
    if (!parts.length) fail(400, 'Không có thay đổi.');
    const action = b.role !== undefined && b.role !== u.role ? 'account.role' : (b.is_active !== undefined && !!b.is_active !== !!u.is_active ? (b.is_active ? 'account.enable' : 'account.disable') : 'account.update');
    audit(req.user.id, action, 'user', u.id, `Cập nhật tài khoản ${u.full_name} (${u.code}): ${parts.join(', ')}`, String(b.reason || '').trim());
  });
  res.json({ ok: true });
}));

router.get('/permissions', (_req, res) => res.json({ roles: ROLES, modules: MODULES }));

// ===================== CẤU HÌNH HỆ THỐNG =====================
function settingsPayload() {
  const values = settings.all();
  const meta = q.all('SELECT s.key, s.updated_at, u.full_name AS updated_by FROM settings s LEFT JOIN users u ON u.id = s.updated_by');
  const metaBy = Object.fromEntries(meta.map((m) => [m.key, m]));
  return {
    groups: settings.GROUPS.map((g) => ({
      ...g,
      items: settings.DEFS.filter((d) => d.group === g.key).map((d) => ({ ...d, value: values[d.key], is_default: values[d.key] === d.def, updated: metaBy[d.key] || null })),
    })),
  };
}
router.get('/settings', (_req, res) => res.json(settingsPayload()));

router.put('/settings', wrap((req, res) => {
  let changes;
  try { changes = settings.update(req.body?.values || {}, req.user.id, now()); } catch (e) { fail(e.status || 400, e.message); }
  const show = (v) => (typeof v === 'boolean' ? (v ? 'Bật' : 'Tắt') : String(v));
  if (changes.length) {
    audit(req.user.id, 'system.settings', 'settings', null, `Cập nhật cấu hình: ${changes.map((c) => `${c.label}: ${show(c.from)} → ${show(c.to)}`).join('; ')}`);
    const m = changes.find((c) => c.key === 'maintenance_mode');
    if (m) audit(req.user.id, m.to ? 'system.maintenance_on' : 'system.maintenance_off', 'settings', null, m.to ? 'Bật chế độ bảo trì' : 'Tắt chế độ bảo trì');
  }
  res.json({ ok: true, changed: changes.length, ...settingsPayload() });
}));

router.post('/settings/reset', wrap((req, res) => {
  settings.reset();
  audit(req.user.id, 'system.settings_reset', 'settings', null, 'Khôi phục toàn bộ cấu hình về mặc định');
  res.json({ ok: true, ...settingsPayload() });
}));

// ===================== NHẬT KÝ HỆ THỐNG =====================
const GROUP_SQL = {
  auth: "a.action LIKE 'auth.%' OR a.action LIKE 'user.%'",
  security: "a.action IN ('auth.login_failed','auth.lockout','session.revoke') OR a.action LIKE 'system.%' OR a.action LIKE 'account.%'",
  account: "a.action LIKE 'account.%'",
  system: "a.action LIKE 'system.%' OR a.action LIKE 'session.%'",
  event: "a.action LIKE 'event.%' OR a.action LIKE 'moderation.%'",
  attendance: "a.action LIKE 'attendance.%' OR a.action LIKE 'registration.%'",
  points: "a.action LIKE 'points.%'",
};
function auditQuery(query) {
  const where = ['1=1']; const params = [];
  if (GROUP_SQL[query.group]) where.push(`(${GROUP_SQL[query.group]})`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) { where.push('a.created_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) { where.push('a.created_at <= ?'); params.push(`${query.to} 23:59:59`); }
  if (String(query.kw || '').trim()) {
    const k = `%${String(query.kw).trim().toLowerCase()}%`;
    where.push("(lower(IFNULL(a.detail,'')) LIKE ? OR lower(IFNULL(u.full_name,'')) LIKE ? OR lower(IFNULL(u.code,'')) LIKE ? OR lower(a.action) LIKE ?)");
    params.push(k, k, k, k);
  }
  return { sql: `FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE ${where.join(' AND ')}`, params };
}
const AUDIT_COLS = 'a.id, a.action, a.entity_type, a.entity_id, a.detail, a.reason, a.created_at, u.full_name AS actor_name, u.code AS actor_code, u.role AS actor_role';

router.get('/audit', wrap((req, res) => {
  const size = Math.min(100, Math.max(10, Number(req.query.size) || 25));
  const page = Math.max(1, Number(req.query.page) || 1);
  const { sql, params } = auditQuery(req.query);
  const total = q.get(`SELECT COUNT(*) n ${sql}`, ...params).n;
  const rows = q.all(`SELECT ${AUDIT_COLS} ${sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size);
  res.json({ rows, total, page, size });
}));

router.get('/audit/export', wrap(async (req, res) => {
  const { sql, params } = auditQuery(req.query);
  const rows = q.all(`SELECT ${AUDIT_COLS} ${sql} ORDER BY a.id DESC LIMIT 20000`, ...params);
  const wb = new ExcelJS.Workbook(); wb.creator = 'NEU Events';
  const ws = wb.addWorksheet('Nhật ký hệ thống');
  ws.columns = [
    { header: 'STT', width: 7 }, { header: 'Thời gian', width: 20 }, { header: 'Người thực hiện', width: 30 }, { header: 'Vai trò', width: 18 },
    { header: 'Mã thao tác', width: 24 }, { header: 'Đối tượng', width: 14 }, { header: 'Nội dung', width: 70 }, { header: 'Lý do', width: 30 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A5C' } };
  rows.forEach((r, i) => ws.addRow([i + 1, r.created_at, r.actor_name ? `${r.actor_name} (${r.actor_code})` : 'Hệ thống', ROLE_NAME[r.actor_role] || '',
    r.action, r.entity_id ? `${r.entity_type} #${r.entity_id}` : r.entity_type, r.detail, r.reason || '']));
  audit(req.user.id, 'system.audit_export', 'audit', null, `Xuất ${rows.length} dòng nhật ký hệ thống ra Excel`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="nhat-ky-he-thong-${now().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

// ===================== PHIÊN ĐĂNG NHẬP =====================
router.get('/sessions', wrap(async (req, res) => {
  const list = await listSessions(req.sessionStore);
  const ids = [...new Set(list.map((s) => s.userId))];
  const users = ids.length ? q.all(`SELECT u.id, u.code, u.full_name, u.email, u.role, un.short_name AS unit_short FROM users u LEFT JOIN units un ON un.id = u.unit_id
                                     WHERE u.id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const idle = settings.get('session_idle_minutes');
  const rows = list.filter((s) => byId[s.userId]).map((s) => ({
    sid: s.sid, current: s.sid === req.sessionID, user: byId[s.userId], ip: s.ip || '', agent: s.agent || '', remember: !!s.remember,
    login_at: s.loginAt || null, last_seen: s.lastSeen ? fmt(new Date(s.lastSeen)) : null,
    idle_expired: !!(idle > 0 && !s.remember && s.lastSeen && Date.now() - s.lastSeen > idle * 60000),
  })).sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)));
  res.json({ rows });
}));

router.delete('/sessions/:sid', wrap(async (req, res) => {
  const sid = String(req.params.sid);
  if (sid === req.sessionID) fail(400, 'Đây là phiên bạn đang dùng – hãy dùng chức năng Đăng xuất.');
  const s = (await listSessions(req.sessionStore)).find((x) => x.sid === sid);
  if (!s) fail(404, 'Phiên đăng nhập không còn tồn tại.');
  await new Promise((resolve) => req.sessionStore.destroy(sid, () => resolve()));
  const u = q.get('SELECT full_name, code FROM users WHERE id = ?', s.userId);
  audit(req.user.id, 'session.revoke', 'user', s.userId, `Buộc đăng xuất phiên của ${u ? `${u.full_name} (${u.code})` : 'người dùng'}${s.ip ? `, IP ${s.ip}` : ''}`);
  res.json({ ok: true });
}));

// ===================== SAO LƯU CƠ SỞ DỮ LIỆU =====================
const BACKUP_RE = /^neu-events-\d{8}-\d{6}\.db$/;
function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR).filter((n) => BACKUP_RE.test(n)).map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, created_at: fmt(st.mtime) };
    }).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
function backupPath(name) {
  if (!BACKUP_RE.test(String(name))) fail(400, 'Tên bản sao lưu không hợp lệ.');
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) fail(404, 'Không tìm thấy bản sao lưu.');
  return p;
}

router.get('/backups', (_req, res) => res.json({ rows: listBackups(), keep: settings.get('backup_keep'), dir: path.relative(path.join(__dirname, '..'), BACKUP_DIR) }));

router.post('/backups', wrap((req, res) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `neu-events-${now().replace(/[-: ]/g, '').replace(/^(\d{8})(\d{6})$/, '$1-$2')}.db`;
  const target = path.join(BACKUP_DIR, name);
  if (fs.existsSync(target)) fail(409, 'Vừa có bản sao lưu cùng thời điểm, vui lòng thử lại sau vài giây.');
  // VACUUM INTO: SQLite tạo bản sao nhất quán của toàn bộ CSDL kể cả khi hệ thống đang chạy
  open().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const keep = settings.get('backup_keep');
  const removed = listBackups().slice(keep);
  for (const b of removed) fs.unlinkSync(path.join(BACKUP_DIR, b.name));
  audit(req.user.id, 'system.backup', 'backup', null, `Tạo bản sao lưu ${name} (${Math.round(fileSize(target) / 1024)} KB)${removed.length ? `; tự xóa ${removed.length} bản cũ` : ''}`);
  res.json({ ok: true, name, rows: listBackups() });
}));

router.get('/backups/:name/download', wrap((req, res) => {
  const p = backupPath(req.params.name);
  audit(req.user.id, 'system.backup_download', 'backup', null, `Tải bản sao lưu ${req.params.name}`);
  res.download(p, req.params.name);
}));

router.delete('/backups/:name', wrap((req, res) => {
  const p = backupPath(req.params.name);
  fs.unlinkSync(p);
  audit(req.user.id, 'system.backup_delete', 'backup', null, `Xóa bản sao lưu ${req.params.name}`);
  res.json({ ok: true, rows: listBackups() });
}));

module.exports = router;
