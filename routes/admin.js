// Chức năng riêng của Đơn vị quản lý:
//  - Cấp & quản lý tài khoản Ban tổ chức cho các đơn vị (email @neu.edu.vn + mật khẩu)
//  - Duyệt danh sách sinh viên hoàn thành do BTC gửi để cộng điểm hoạt động (điểm Đoàn)
const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db/database');
const { now, notify, audit, wrap, fail, isNeuEmail } = require('../lib/util');
const { getEvent } = require('../lib/events');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

// ===================== TÀI KHOẢN BAN TỔ CHỨC =====================
router.get('/accounts', wrap((req, res) => {
  const accounts = q.all(`SELECT u.id, u.code, u.email, u.full_name, u.phone, u.is_active, u.created_at, u.unit_id, un.name AS unit_name, un.short_name AS unit_short,
                                 (SELECT COUNT(*) FROM events e WHERE e.unit_id = u.unit_id) AS event_count,
                                 (SELECT MAX(created_at) FROM audit_logs a WHERE a.actor_id = u.id AND a.action = 'auth.login') AS last_login
                          FROM users u LEFT JOIN units un ON un.id = u.unit_id WHERE u.role = 'organizer' ORDER BY un.name`);
  const units = q.all(`SELECT un.id, un.name, un.short_name, (SELECT COUNT(*) FROM users u WHERE u.unit_id = un.id AND u.role = 'organizer') AS accounts
                       FROM units un ORDER BY un.name`);
  res.json({ accounts, units });
}));

function nextCode() {
  const row = q.get("SELECT code FROM users WHERE code LIKE 'DV%' ORDER BY CAST(substr(code, 3) AS INTEGER) DESC LIMIT 1");
  const n = row ? Number(row.code.slice(2)) + 1 : 1;
  return `DV${String(n).padStart(3, '0')}`;
}

// Cấp tài khoản cho đơn vị (đơn vị có sẵn hoặc đơn vị mới đăng ký sử dụng hệ thống)
router.post('/accounts', wrap((req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const phone = String(b.phone || '').trim();
  if (!isNeuEmail(email)) fail(400, 'Email tài khoản Ban tổ chức phải có đuôi @neu.edu.vn.');
  if (password.length < 6) fail(400, 'Mật khẩu tối thiểu 6 ký tự.');
  if (q.get('SELECT 1 FROM users WHERE lower(email) = ?', email)) fail(409, 'Email đã được dùng bởi tài khoản khác.');
  let unitId = Number(b.unit_id) || null;
  const at = now();
  const id = q.tx(() => {
    if (!unitId) {
      const name = String(b.unit_name || '').trim();
      const short = String(b.unit_short || '').trim() || name;
      if (name.length < 3) fail(400, 'Vui lòng chọn đơn vị hoặc nhập tên đơn vị mới.');
      if (q.get('SELECT 1 FROM units WHERE lower(name) = lower(?)', name)) fail(409, 'Đơn vị đã tồn tại, hãy chọn trong danh sách.');
      unitId = q.run('INSERT INTO units (name, short_name) VALUES (?,?)', name, short).id;
    }
    const unit = q.get('SELECT * FROM units WHERE id = ?', unitId);
    if (!unit) fail(404, 'Không tìm thấy đơn vị.');
    const code = nextCode();
    const uid = q.run(`INSERT INTO users (code,email,password_hash,full_name,role,unit_id,phone,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      code, email, bcrypt.hashSync(password, 8), unit.name, 'organizer', unitId, phone || null, at).id;
    audit(req.user.id, 'account.create', 'user', uid, `Cấp tài khoản Ban tổ chức cho ${unit.name} (${email})`);
    notify(uid, { type: 'account', title: 'Chào mừng đến NEU Events', body: 'Tài khoản Ban tổ chức của đơn vị đã được cấp. Bạn có thể đổi email, mật khẩu tại Hồ sơ cá nhân.', link: '/profile.html' });
    return uid;
  });
  res.json({ ok: true, id });
}));

router.put('/accounts/:id', wrap((req, res) => {
  const u = q.get("SELECT * FROM users WHERE id = ? AND role = 'organizer'", Number(req.params.id));
  if (!u) fail(404, 'Không tìm thấy tài khoản.');
  const b = req.body || {};
  const parts = [];
  q.tx(() => {
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (!isNeuEmail(email)) fail(400, 'Email tài khoản Ban tổ chức phải có đuôi @neu.edu.vn.');
      if (q.get('SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?', email, u.id)) fail(409, 'Email đã được dùng bởi tài khoản khác.');
      q.run('UPDATE users SET email = ? WHERE id = ?', email, u.id); parts.push(`email ${email}`);
    }
    if (b.password) {
      if (String(b.password).length < 6) fail(400, 'Mật khẩu tối thiểu 6 ký tự.');
      q.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(b.password), 8), u.id); parts.push('đặt lại mật khẩu');
    }
    if (b.is_active !== undefined) {
      q.run('UPDATE users SET is_active = ? WHERE id = ?', b.is_active ? 1 : 0, u.id); parts.push(b.is_active ? 'mở khóa' : 'khóa tài khoản');
    }
    if (!parts.length) fail(400, 'Không có thay đổi.');
    audit(req.user.id, 'account.update', 'user', u.id, `Cập nhật tài khoản ${u.full_name}: ${parts.join(', ')}`);
  });
  res.json({ ok: true });
}));

// ===================== DUYỆT ĐIỂM HOẠT ĐỘNG =====================
router.get('/points', wrap((req, res) => {
  const { status = '' } = req.query;
  const where = status ? 'WHERE p.status = ?' : '';
  const items = q.all(`SELECT p.*, e.title, e.code, e.start_at, e.end_at, e.level, un.short_name AS unit_short, un.name AS unit_name,
                              s.full_name AS submitter_name, rv.full_name AS reviewer_name
                       FROM point_submissions p JOIN events e ON e.id = p.event_id LEFT JOIN units un ON un.id = e.unit_id
                       LEFT JOIN users s ON s.id = p.submitted_by LEFT JOIN users rv ON rv.id = p.reviewed_by
                       ${where} ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.submitted_at DESC`, ...(status ? [status] : []));
  const counts = q.get(`SELECT SUM(status='pending') pending, SUM(status='approved') approved, SUM(status='rejected') rejected,
                               SUM(CASE WHEN status='approved' THEN member_count * points ELSE 0 END) total_points FROM point_submissions`);
  res.json({ items, counts });
}));

router.get('/points/:eventId', wrap((req, res) => {
  const ev = getEvent(Number(req.params.eventId));
  if (!ev) fail(404, 'Không tìm thấy sự kiện.');
  const submission = q.get('SELECT * FROM point_submissions WHERE event_id = ?', ev.id);
  if (!submission) fail(404, 'Sự kiện chưa gửi danh sách.');
  const members = q.all(`SELECT r.code, r.checked_in_at, r.checked_out_at, r.points_awarded, u.full_name, u.code AS student_code, u.class_name
                         FROM registrations r JOIN users u ON u.id = r.user_id
                         WHERE r.event_id = ? AND r.status = 'registered' AND r.attendance = 'present' AND r.checked_out_at IS NOT NULL
                         ORDER BY u.full_name`, ev.id);
  res.json({ event: ev, submission, members });
}));

router.post('/points/:eventId/:decision', wrap((req, res) => {
  const approve = req.params.decision === 'approve';
  if (!['approve', 'reject'].includes(req.params.decision)) fail(404, 'Không hỗ trợ thao tác này.');
  const ev = getEvent(Number(req.params.eventId));
  if (!ev) fail(404, 'Không tìm thấy sự kiện.');
  const sub = q.get('SELECT * FROM point_submissions WHERE event_id = ?', ev.id);
  if (!sub || sub.status !== 'pending') fail(400, 'Danh sách không ở trạng thái chờ duyệt.');
  const note = String(req.body?.note || '').trim();
  if (!approve && note.length < 10) fail(400, 'Vui lòng nhập lý do từ chối (tối thiểu 10 ký tự).');
  const at = now();
  const n = q.tx(() => {
    let count = 0;
    if (approve) {
      const members = q.all(`SELECT id, user_id FROM registrations WHERE event_id = ? AND status = 'registered' AND attendance = 'present' AND checked_out_at IS NOT NULL`, ev.id);
      for (const m of members) {
        q.run('UPDATE registrations SET points_awarded = ? WHERE id = ?', sub.points, m.id);
        notify(m.user_id, { type: 'points', title: 'Đã cộng điểm hoạt động', body: `Bạn được cộng ${sub.points} điểm hoạt động từ "${ev.title}".`, link: '/registered.html' });
      }
      count = members.length;
    }
    q.run('UPDATE point_submissions SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, member_count = CASE WHEN ? THEN ? ELSE member_count END WHERE id = ?',
      approve ? 'approved' : 'rejected', req.user.id, at, note || null, approve ? 1 : 0, count, sub.id);
    audit(req.user.id, approve ? 'points.approve' : 'points.reject', 'event', ev.id,
      approve ? `Duyệt điểm hoạt động: ${count} sinh viên × ${sub.points} điểm` : 'Từ chối danh sách điểm hoạt động', note);
    for (const o of q.all("SELECT id FROM users WHERE role = 'organizer' AND unit_id = ?", ev.unit_id)) {
      notify(o.id, approve
        ? { type: 'points', title: 'Danh sách đã được duyệt điểm', body: `"${ev.title}": ${count} sinh viên được cộng ${sub.points} điểm.`, link: `/attendance.html?event=${ev.id}` }
        : { type: 'points', title: 'Danh sách điểm bị từ chối', body: `"${ev.title}" cần bổ sung: ${note}`, link: `/attendance.html?event=${ev.id}` });
    }
    return count;
  });
  res.json({ ok: true, count: n });
}));

module.exports = router;
