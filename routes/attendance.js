// Điểm danh: sinh viên tự check-in / check-out bằng mã hoặc QR; BTC mở/đóng phiên, theo dõi, sửa thủ công,
// xuất Excel, gửi danh sách hoàn thành để đơn vị quản lý duyệt điểm hoạt động
const express = require('express');
const os = require('os');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const { q } = require('../db/database');
const { now, addMinutes, randomCode, notify, audit, wrap, fail } = require('../lib/util');
const { CHECKOUT_GRACE, EVENT_SELECT, decorate, getEvent, mustManage, closeAttendance, finalizeEndedEvents, activeSession } = require('../lib/events');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Trạng thái hiển thị của một lượt đăng ký
const stateOf = (r) => (r.attendance === 'present' ? (r.checked_out_at ? 'completed' : 'checked_in') : r.attendance);
const STATE_LABEL = { pending: 'Chưa check-in', checked_in: 'Đã check-in', completed: 'Hoàn thành', absent: 'Vắng mặt' };
const METHOD_LABEL = { code: 'Nhập mã', qr: 'Quét QR', manual: 'BTC cập nhật' };
const KIND_LABEL = { checkin: 'check-in', checkout: 'check-out' };

// Địa chỉ LAN để điện thoại cùng mạng Wi-Fi mở được link trong mã QR
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}
function publicOrigin(req) {
  const host = req.get('host') || 'localhost:3000';
  const [name, port] = host.split(':');
  if (['localhost', '127.0.0.1'].includes(name)) {
    const ip = lanAddress();
    if (ip) return `${req.protocol}://${ip}${port ? ':' + port : ''}`;
  }
  return `${req.protocol}://${host}`;
}

// ===== Sinh viên tự check-in / check-out (hệ thống xác định theo loại phiên đang mở) =====
router.post('/checkin', requireRole('student'), wrap((req, res) => {
  finalizeEndedEvents();
  const eventId = Number(req.body?.event_id);
  const code = String(req.body?.code || '').trim().toUpperCase();
  const method = req.body?.method === 'qr' ? 'qr' : 'code';
  if (!code) fail(400, 'Vui lòng nhập mã điểm danh.');
  const ev = getEvent(eventId);
  if (!ev || ev.status !== 'approved') fail(404, 'Không tìm thấy sự kiện.');
  const reg = q.get("SELECT * FROM registrations WHERE event_id = ? AND user_id = ? AND status = 'registered'", ev.id, req.user.id);
  if (!reg) fail(403, 'Bạn chưa đăng ký sự kiện này nên không thể điểm danh.');
  const s = activeSession(ev.id);
  const at = now();
  if (!s) fail(400, 'Ban tổ chức chưa mở phiên điểm danh.');
  if (s.expires_at < at) fail(400, 'Mã điểm danh đã hết hiệu lực.');
  if (s.code.toUpperCase() !== code) fail(400, 'Mã điểm danh không đúng.');

  if (s.kind === 'checkout') {
    if (reg.attendance !== 'present') fail(400, 'Bạn chưa được ban tổ chức ghi nhận check-in nên chưa thể check-out.');
    if (reg.checked_out_at) fail(409, `Bạn đã check-out lúc ${reg.checked_out_at.slice(11, 16)}.`);
    q.run('UPDATE registrations SET checked_out_at=?, checkout_method=? WHERE id=?', at, method, reg.id);
    audit(req.user.id, 'attendance.checkout', 'registration', reg.id, `Tự check-out (${METHOD_LABEL[method]}) – ${ev.title}`);
    notify(req.user.id, { type: 'attendance', title: 'Check-out thành công', body: `Bạn đã hoàn thành "${ev.title}" (check-out lúc ${at.slice(11, 16)}).`, link: '/reviews.html' });
    return res.json({ ok: true, kind: 'checkout', checked_out_at: at });
  }
  if (reg.attendance === 'present') fail(409, `Bạn đã check-in lúc ${reg.checked_in_at.slice(11, 16)}.`);
  if (reg.attendance === 'absent') fail(400, 'Phiên check-in đã kết thúc, bạn được ghi nhận vắng mặt. Liên hệ BTC nếu có sai sót.');
  q.run("UPDATE registrations SET attendance='present', checked_in_at=?, check_method=? WHERE id=?", at, method, reg.id);
  audit(req.user.id, 'attendance.checkin', 'registration', reg.id, `Tự check-in (${METHOD_LABEL[method]}) – ${ev.title}`);
  notify(req.user.id, { type: 'attendance', title: 'Check-in thành công', body: `Đã ghi nhận bạn có mặt tại "${ev.title}" lúc ${at.slice(11, 16)}. Nhớ check-out khi kết thúc để hoàn thành.`, link: `/attendance.html?event=${ev.id}` });
  res.json({ ok: true, kind: 'checkin', checked_in_at: at });
}));

// ===== Ban tổ chức =====
router.use(requireRole('organizer', 'admin'));

// Danh sách sự kiện có thể quản lý điểm danh (cho nút "Đổi sự kiện")
router.get('/events', wrap((req, res) => {
  finalizeEndedEvents();
  const params = [];
  let where = "e.status = 'approved'";
  if (req.user.role === 'organizer') { where += ' AND (e.unit_id = ? OR e.created_by = ?)'; params.push(req.user.unit_id, req.user.id); }
  const at = now();
  const rows = q.all(`${EVENT_SELECT} WHERE ${where} ORDER BY e.start_at DESC`, ...params).map((e) => decorate(e, at));
  const rank = { ongoing: 0, upcoming: 1, ended: 2 };
  rows.sort((a, b) => rank[a.phase] - rank[b.phase] || (a.phase === 'upcoming' ? a.start_at.localeCompare(b.start_at) : b.start_at.localeCompare(a.start_at)));
  res.json({ events: rows.map((e) => ({ id: e.id, title: e.title, code: e.code, start_at: e.start_at, end_at: e.end_at, phase: e.phase, location: e.location, registered_count: e.registered_count, completed_count: e.completed_count, points_status: e.points_status })) });
}));

function sessionInfo(req, ev) {
  const s = activeSession(ev.id);
  if (!s) return null;
  const url = `${publicOrigin(req)}/attendance.html?event=${ev.id}&code=${encodeURIComponent(s.code)}`;
  return { ...s, valid: s.expires_at >= now(), url };
}

const STATE_SQL = {
  pending: "r.attendance = 'pending'",
  checked_in: "r.attendance = 'present' AND r.checked_out_at IS NULL",
  completed: "r.attendance = 'present' AND r.checked_out_at IS NOT NULL",
  absent: "r.attendance = 'absent'",
};

router.get('/:eventId', wrap(async (req, res) => {
  finalizeEndedEvents();
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  const { q: kw = '', status = '', page = 1, size = 10 } = req.query;
  const where = ['r.event_id = ?', "r.status = 'registered'"]; const params = [ev.id];
  if (kw) { where.push('(u.full_name LIKE ? OR u.code LIKE ?)'); params.push(`%${kw}%`, `%${kw}%`); }
  if (STATE_SQL[status]) where.push(STATE_SQL[status]);
  const total = q.get(`SELECT COUNT(*) n FROM registrations r JOIN users u ON u.id = r.user_id WHERE ${where.join(' AND ')}`, ...params).n;
  const lim = Math.min(100, Math.max(1, Number(size))); const off = (Math.max(1, Number(page)) - 1) * lim;
  const rows = q.all(`SELECT r.id, r.code, r.attendance, r.checked_in_at, r.check_method, r.checked_out_at, r.checkout_method, r.points_awarded,
                             r.registered_at, u.full_name, u.code AS student_code, u.class_name
                      FROM registrations r JOIN users u ON u.id = r.user_id WHERE ${where.join(' AND ')}
                      ORDER BY CASE r.attendance WHEN 'pending' THEN 0 WHEN 'present' THEN 1 ELSE 2 END, r.checked_in_at DESC, u.full_name
                      LIMIT ? OFFSET ?`, ...params, lim, off).map((r) => ({ ...r, state: stateOf(r) }));
  const session = sessionInfo(req, ev);
  const qr = session ? await QRCode.toDataURL(session.url, { margin: 1, width: 240, color: { dark: '#0f2a5c', light: '#ffffff' } }) : null;
  const last = q.get('SELECT * FROM attendance_sessions WHERE event_id = ? ORDER BY id DESC LIMIT 1', ev.id);
  const submission = q.get(`SELECT p.*, u.full_name AS reviewer_name FROM point_submissions p LEFT JOIN users u ON u.id = p.reviewed_by WHERE p.event_id = ?`, ev.id) || null;
  const at = now();
  res.json({
    event: ev, session, qr, last_session: last || null, submission,
    can_open_checkin: at >= addMinutes(ev.start_at, -60) && at <= ev.end_at,
    can_open_checkout: at >= ev.start_at && at <= addMinutes(ev.end_at, CHECKOUT_GRACE),
    stats: {
      registered: ev.registered_count, present: ev.present_count, completed: ev.completed_count,
      checked_in: ev.present_count - ev.completed_count, absent: ev.absent_count,
      pending: ev.registered_count - ev.present_count - ev.absent_count,
    },
    rows, total, page: Number(page), size: lim, updated_at: at,
  });
}));

// Mở phiên check-in hoặc check-out (mỗi sự kiện tại một thời điểm chỉ có 1 phiên đang mở)
router.post('/:eventId/open', wrap((req, res) => {
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  if (ev.status !== 'approved') fail(400, 'Sự kiện chưa được duyệt hoặc đã bị hủy.');
  const kind = req.body?.kind === 'checkout' ? 'checkout' : 'checkin';
  const at = now();
  let limit;
  if (kind === 'checkin') {
    if (at < addMinutes(ev.start_at, -60)) fail(400, 'Chỉ mở check-in trong vòng 60 phút trước giờ bắt đầu.');
    if (at > ev.end_at) fail(400, 'Sự kiện đã kết thúc, không thể mở check-in.');
    limit = ev.end_at;
  } else {
    if (at < ev.start_at) fail(400, 'Chỉ mở check-out sau khi sự kiện bắt đầu.');
    limit = addMinutes(ev.end_at, CHECKOUT_GRACE);
    if (at > limit) fail(400, `Đã quá ${CHECKOUT_GRACE} phút sau khi sự kiện kết thúc, không thể mở check-out.`);
  }
  const minutes = Math.min(600, Math.max(5, parseInt(req.body?.minutes, 10) || 45));
  let expires = addMinutes(at, minutes); if (expires > limit) expires = limit;
  const custom = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const code = custom.length >= 4 ? custom : randomCode(6);
  q.tx(() => {
    q.run('UPDATE attendance_sessions SET closed_at = ? WHERE event_id = ? AND closed_at IS NULL', at, ev.id);
    q.run('INSERT INTO attendance_sessions (event_id,code,kind,opened_by,opened_at,expires_at) VALUES (?,?,?,?,?,?)', ev.id, code, kind, req.user.id, at, expires);
    audit(req.user.id, `attendance.open_${kind}`, 'event', ev.id, `Mở phiên ${KIND_LABEL[kind]}, mã ${code}, hiệu lực tới ${expires.slice(11, 16)}`);
  });
  const targets = kind === 'checkin'
    ? q.all("SELECT user_id FROM registrations WHERE event_id = ? AND status='registered' AND attendance='pending'", ev.id)
    : q.all("SELECT user_id FROM registrations WHERE event_id = ? AND status='registered' AND attendance='present' AND checked_out_at IS NULL", ev.id);
  for (const r of targets) {
    notify(r.user_id, { type: 'attendance', title: kind === 'checkin' ? 'Đã mở check-in' : 'Đã mở check-out', body: `"${ev.title}" đang mở ${KIND_LABEL[kind]} tới ${expires.slice(11, 16)}.`, link: `/attendance.html?event=${ev.id}` });
  }
  res.json({ ok: true, kind, code, expires_at: expires });
}));

router.post('/:eventId/close', wrap((req, res) => {
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  const s = activeSession(ev.id);
  if (!s) fail(400, 'Không có phiên điểm danh đang mở.');
  const absent = q.tx(() => {
    if (s.kind === 'checkout') {
      q.run('UPDATE attendance_sessions SET closed_at = ? WHERE id = ?', now(), s.id);
      audit(req.user.id, 'attendance.close_checkout', 'event', ev.id, 'Đóng phiên check-out');
      return 0;
    }
    const n = closeAttendance(ev.id);
    audit(req.user.id, 'attendance.close', 'event', ev.id, `Đóng phiên check-in; ${n} sinh viên được ghi nhận vắng mặt`);
    return n;
  });
  res.json({ ok: true, kind: s.kind, absent });
}));

// Sửa thủ công trạng thái (bắt buộc lý do, lưu lịch sử): pending | checked_in | completed | absent
router.post('/:eventId/mark', wrap((req, res) => {
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  const { registration_id, state, reason = '' } = req.body || {};
  const target = state || ({ present: 'checked_in' }[req.body?.attendance] || req.body?.attendance);
  if (!STATE_LABEL[target]) fail(400, 'Trạng thái không hợp lệ.');
  if (String(reason).trim().length < 3) fail(400, 'Vui lòng nhập lý do thay đổi.');
  const reg = q.get(`SELECT r.*, u.full_name, u.code AS student_code FROM registrations r JOIN users u ON u.id = r.user_id
                     WHERE r.id = ? AND r.event_id = ? AND r.status = 'registered'`, Number(registration_id), ev.id);
  if (!reg) fail(404, 'Không tìm thấy lượt đăng ký.');
  const from = stateOf(reg);
  if (from === target) fail(400, 'Trạng thái không thay đổi.');
  if (reg.points_awarded != null) fail(400, 'Danh sách của sự kiện đã được duyệt điểm, không thể thay đổi trạng thái.');
  const at = now();
  q.tx(() => {
    if (target === 'pending' || target === 'absent') {
      q.run('UPDATE registrations SET attendance=?, checked_in_at=NULL, check_method=NULL, checked_out_at=NULL, checkout_method=NULL WHERE id=?', target, reg.id);
    } else {
      const inAt = reg.attendance === 'present' ? reg.checked_in_at : at;
      const inMethod = reg.attendance === 'present' ? reg.check_method : 'manual';
      const outAt = target === 'completed' ? (reg.checked_out_at || at) : null;
      const outMethod = target === 'completed' ? (reg.checkout_method || 'manual') : null;
      q.run("UPDATE registrations SET attendance='present', checked_in_at=?, check_method=?, checked_out_at=?, checkout_method=? WHERE id=?", inAt, inMethod, outAt, outMethod, reg.id);
    }
    audit(req.user.id, 'attendance.manual', 'registration', reg.id,
      `${reg.full_name} (${reg.student_code}): ${STATE_LABEL[from]} → ${STATE_LABEL[target]}`, String(reason).trim());
    notify(reg.user_id, { type: 'attendance', title: 'Cập nhật điểm danh', body: `BTC "${ev.title}" cập nhật trạng thái của bạn: ${STATE_LABEL[target]}. Lý do: ${String(reason).trim()}`, link: '/registered.html' });
  });
  res.json({ ok: true });
}));

// Xuất Excel: type=all (danh sách đăng ký – phục vụ check-in) | completed (danh sách hoàn thành)
router.get('/:eventId/export', wrap(async (req, res) => {
  finalizeEndedEvents();
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  const completed = req.query.type === 'completed';
  const rows = q.all(`SELECT r.code, r.attendance, r.checked_in_at, r.check_method, r.checked_out_at, r.checkout_method, r.points_awarded, r.registered_at,
                             u.full_name, u.code AS student_code, u.class_name, u.email
                      FROM registrations r JOIN users u ON u.id = r.user_id
                      WHERE r.event_id = ? AND r.status = 'registered' ${completed ? "AND r.attendance = 'present' AND r.checked_out_at IS NOT NULL" : ''}
                      ORDER BY u.full_name`, ev.id);
  const wb = new ExcelJS.Workbook(); wb.creator = 'NEU Events';
  const ws = wb.addWorksheet(completed ? 'Hoàn thành' : 'Danh sách đăng ký');
  ws.mergeCells('A1:L1'); ws.getCell('A1').value = `${completed ? 'DANH SÁCH SINH VIÊN HOÀN THÀNH' : 'DANH SÁCH ĐĂNG KÝ & ĐIỂM DANH'} – ${ev.title.toUpperCase()}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2A5C' } };
  ws.mergeCells('A2:L2'); ws.getCell('A2').value = `Mã sự kiện: ${ev.code} • Thời gian: ${ev.start_at.slice(0, 16)} – ${ev.end_at.slice(11, 16)} • Địa điểm: ${ev.location} • Điểm hoạt động: ${ev.points}`;
  ws.mergeCells('A3:L3'); ws.getCell('A3').value = `Đăng ký: ${ev.registered_count} • Check-in: ${ev.present_count} • Hoàn thành: ${ev.completed_count} • Vắng: ${ev.absent_count} • Xuất lúc: ${now()}`;
  ws.addRow([]);
  const head = ws.addRow(['STT', 'Họ và tên', 'MSSV', 'Lớp', 'Email', 'Mã đăng ký', 'Thời điểm đăng ký', 'Trạng thái', 'Check-in', 'Check-out', 'Hình thức', 'Điểm HĐ']);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1451A8' } }; c.alignment = { vertical: 'middle' }; });
  rows.forEach((r, i) => ws.addRow([i + 1, r.full_name, r.student_code, r.class_name || '', r.email, r.code, r.registered_at.slice(0, 16),
    STATE_LABEL[stateOf(r)], r.checked_in_at ? r.checked_in_at.slice(0, 16) : '', r.checked_out_at ? r.checked_out_at.slice(0, 16) : '',
    [METHOD_LABEL[r.check_method], METHOD_LABEL[r.checkout_method]].filter(Boolean).join(' / '), r.points_awarded ?? '']));
  [6, 26, 12, 22, 28, 16, 18, 14, 18, 18, 22, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: 'A5', to: 'L5' };
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${completed ? 'hoan-thanh' : 'dang-ky'}-${ev.code}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

// Gửi danh sách hoàn thành lên đơn vị quản lý để duyệt điểm hoạt động
router.post('/:eventId/submit-points', wrap((req, res) => {
  finalizeEndedEvents();
  const ev = getEvent(Number(req.params.eventId));
  mustManage(req.user, ev);
  if (ev.status !== 'approved') fail(400, 'Sự kiện không ở trạng thái đã duyệt.');
  if (now() <= ev.end_at) fail(400, 'Chỉ gửi danh sách sau khi sự kiện kết thúc.');
  if (!ev.points) fail(400, 'Sự kiện chưa được thiết lập điểm hoạt động.');
  if (!ev.completed_count) fail(400, 'Chưa có sinh viên hoàn thành (check-in và check-out) để gửi.');
  const ex = q.get('SELECT * FROM point_submissions WHERE event_id = ?', ev.id);
  if (ex && ex.status === 'pending') fail(409, 'Danh sách đã được gửi và đang chờ duyệt.');
  if (ex && ex.status === 'approved') fail(409, 'Danh sách đã được duyệt điểm.');
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const at = now();
  q.tx(() => {
    if (ex) q.run("UPDATE point_submissions SET status='pending', submitted_by=?, submitted_at=?, member_count=?, points=?, note=?, reviewed_by=NULL, reviewed_at=NULL, review_note=NULL WHERE id=?",
      req.user.id, at, ev.completed_count, ev.points, note, ex.id);
    else q.run('INSERT INTO point_submissions (event_id,submitted_by,submitted_at,member_count,points,note) VALUES (?,?,?,?,?,?)', ev.id, req.user.id, at, ev.completed_count, ev.points, note);
    audit(req.user.id, 'points.submit', 'event', ev.id, `Gửi danh sách ${ev.completed_count} sinh viên hoàn thành để duyệt điểm hoạt động`);
    for (const a of q.all("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")) {
      notify(a.id, { type: 'points', title: 'Danh sách chờ duyệt điểm', body: `"${ev.title}" – ${ev.completed_count} sinh viên hoàn thành, ${ev.points} điểm/sinh viên.`, link: `/points.html?event=${ev.id}` });
    }
  });
  res.json({ ok: true });
}));

module.exports = router;
