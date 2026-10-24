// Đăng nhập, đăng xuất, quên mật khẩu, hồ sơ cá nhân
const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db/database');
const { now, addMinutes, termOf, termList, isNeuEmail, audit, wrap, fail } = require('../lib/util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

const findByLogin = (login) =>
  q.get('SELECT * FROM users WHERE lower(code) = lower(?) OR lower(email) = lower(?)', login.trim(), login.trim());

router.post('/login', wrap((req, res) => {
  const { username = '', password = '', remember = false } = req.body || {};
  if (!username.trim() || !password) fail(400, 'Vui lòng nhập MSSV/email và mật khẩu.');
  const u = findByLogin(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) fail(401, 'MSSV/email hoặc mật khẩu không đúng.');
  if (!u.is_active) fail(403, 'Tài khoản đã bị khóa. Liên hệ events@neu.edu.vn.');
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Không thể tạo phiên đăng nhập.' });
    req.session.userId = u.id;
    if (remember) req.session.cookie.maxAge = REMEMBER_MS; else req.session.cookie.expires = false;
    audit(u.id, 'auth.login', 'user', u.id, 'Đăng nhập');
    res.json({ ok: true, role: u.role });
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('neu.sid'); res.json({ ok: true }); });
});

router.get('/me', requireAuth, (req, res) => {
  const unread = q.get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).n;
  const badges = {};
  if (req.user.role === 'admin') badges.moderation = q.get("SELECT COUNT(*) n FROM events WHERE status = 'pending'").n;
  if (req.user.role === 'admin') badges.points = q.get("SELECT COUNT(*) n FROM point_submissions WHERE status = 'pending'").n;
  if (req.user.role === 'organizer') badges.manage = q.get("SELECT COUNT(*) n FROM events WHERE status = 'rejected' AND unit_id = ?", req.user.unit_id).n;
  res.json({ user: req.user, term: termOf(now()), terms: termList(), unread, badges });
});

// ----- Quên mật khẩu: tạo mã 6 số (demo: không có máy chủ email nên mã được trả về & in ra console) -----
router.post('/forgot', wrap((req, res) => {
  const login = (req.body?.username || '').trim();
  if (!login) fail(400, 'Vui lòng nhập MSSV hoặc email.');
  const u = findByLogin(login);
  if (!u) fail(404, 'Không tìm thấy tài khoản với MSSV/email này.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  q.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', now(), u.id);
  q.run('INSERT INTO password_resets (user_id, code, expires_at, created_at) VALUES (?,?,?,?)', u.id, code, addMinutes(now(), 15), now());
  console.log(`[Quên mật khẩu] Mã đặt lại cho ${u.code} (${u.email}): ${code}`);
  const masked = u.email.replace(/^(.{2}).*(@.*)$/, '$1•••$2');
  res.json({ ok: true, email: masked, demo_code: code });
}));

router.post('/reset', wrap((req, res) => {
  const { username = '', code = '', password = '' } = req.body || {};
  const u = findByLogin(username);
  if (!u) fail(404, 'Không tìm thấy tài khoản.');
  if (String(password).length < 6) fail(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
  const r = q.get('SELECT * FROM password_resets WHERE user_id = ? AND code = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', u.id, String(code).trim());
  if (!r) fail(400, 'Mã xác nhận không đúng.');
  if (r.expires_at < now()) fail(400, 'Mã xác nhận đã hết hạn, vui lòng yêu cầu mã mới.');
  q.tx(() => {
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 8), u.id);
    q.run('UPDATE password_resets SET used_at = ? WHERE id = ?', now(), r.id);
    audit(u.id, 'auth.reset_password', 'user', u.id, 'Đặt lại mật khẩu bằng mã xác nhận');
  });
  res.json({ ok: true });
}));

// ----- Hồ sơ cá nhân -----
router.get('/profile', requireAuth, (req, res) => {
  const u = req.user;
  const stats = u.role === 'student'
    ? q.get(`SELECT COUNT(*) total, SUM(status='registered' AND attendance='present') present,
                    SUM(status='registered' AND attendance='present' AND checked_out_at IS NOT NULL) completed,
                    COALESCE(SUM(points_awarded), 0) points,
                    SUM(status='registered' AND attendance='absent') absent,
                    (SELECT COUNT(*) FROM reviews WHERE user_id = ?) reviews
             FROM registrations WHERE user_id = ?`, u.id, u.id)
    : q.get(`SELECT COUNT(*) total, SUM(status='approved') approved, SUM(status='pending') pending
             FROM events WHERE ${u.role === 'admin' ? '1=1' : 'unit_id = ?'}`, ...(u.role === 'admin' ? [] : [u.unit_id]));
  const activity = q.all(`SELECT action, detail, reason, created_at FROM audit_logs WHERE actor_id = ? ORDER BY id DESC LIMIT 8`, u.id);
  res.json({ user: u, stats, activity });
});

router.put('/profile', requireAuth, wrap((req, res) => {
  const { phone = '', email = '' } = req.body || {};
  const em = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) fail(400, 'Email không hợp lệ.');
  if (req.user.role !== 'student' && !isNeuEmail(em)) fail(400, 'Email tài khoản Ban tổ chức/Đơn vị quản lý phải có đuôi @neu.edu.vn.');
  if (q.get('SELECT 1 FROM users WHERE lower(email) = lower(?) AND id <> ?', em, req.user.id)) fail(409, 'Email đã được dùng bởi tài khoản khác.');
  q.run('UPDATE users SET phone = ?, email = ? WHERE id = ?', String(phone).trim(), em, req.user.id);
  audit(req.user.id, 'user.update_profile', 'user', req.user.id, 'Cập nhật thông tin liên hệ');
  res.json({ ok: true });
}));

router.post('/password', requireAuth, wrap((req, res) => {
  const { current = '', password = '' } = req.body || {};
  const u = q.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(current, u.password_hash)) fail(400, 'Mật khẩu hiện tại không đúng.');
  if (String(password).length < 6) fail(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 8), req.user.id);
  audit(req.user.id, 'user.change_password', 'user', req.user.id, 'Đổi mật khẩu');
  res.json({ ok: true });
}));

module.exports = router;
