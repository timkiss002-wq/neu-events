// Dữ liệu cá nhân của sinh viên: sự kiện đã đăng ký, điểm danh, thông báo
const express = require('express');
const { q } = require('../db/database');
const { now, termOf, termList, termLabel, phaseOf, addMinutes, wrap } = require('../lib/util');
const { finalizeEndedEvents, activeSession } = require('../lib/events');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Trạng thái hiển thị của 1 lượt đăng ký
function describe(r, at) {
  const phase = phaseOf({ status: r.event_status, start_at: r.start_at, end_at: r.end_at }, at);
  let bucket, attendance_label;
  if (r.status === 'cancelled' || r.event_status === 'cancelled') { bucket = 'cancelled'; attendance_label = null; }
  else if (r.attendance === 'present') { bucket = 'attended'; attendance_label = r.checked_out_at ? 'Hoàn thành' : 'Đã check-in'; }
  else if (r.attendance === 'absent') { bucket = 'absent'; attendance_label = 'Vắng mặt'; }
  else { bucket = 'upcoming'; attendance_label = phase === 'ongoing' ? 'Chưa check-in' : 'Chưa diễn ra'; }
  const s = r.session_id && !r.session_closed && r.session_expires >= at;
  return {
    ...r, phase, bucket, attendance_label,
    registration_label: r.status === 'cancelled' ? 'Đã hủy đăng ký' : (r.event_status === 'cancelled' ? 'Sự kiện bị hủy' : 'Đã đăng ký'),
    attendance_open: !!s,
    session_kind: s ? r.session_kind : null,
    can_cancel: r.status === 'registered' && r.event_status === 'approved' && at < r.reg_deadline && at < r.start_at,
    term: termOf(r.start_at),
  };
}

const REG_SQL = `
  SELECT r.id, r.code, r.status, r.registered_at, r.cancelled_at, r.attendance, r.checked_in_at, r.check_method,
         r.checked_out_at, r.checkout_method, r.points_awarded, e.points AS event_points,
         e.id AS event_id, e.title, e.code AS event_code, e.location, e.start_at, e.end_at, e.reg_deadline, e.status AS event_status,
         e.cancel_reason, c.name AS category_name, un.short_name AS unit_short,
         (SELECT 1 FROM reviews v WHERE v.event_id = e.id AND v.user_id = r.user_id) AS reviewed,
         s.id AS session_id, s.closed_at AS session_closed, s.expires_at AS session_expires, s.kind AS session_kind
  FROM registrations r
  JOIN events e ON e.id = r.event_id
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN units un ON un.id = e.unit_id
  LEFT JOIN attendance_sessions s ON s.id = (SELECT MAX(id) FROM attendance_sessions WHERE event_id = e.id)
  WHERE r.user_id = ?`;

router.get('/registrations', requireRole('student'), wrap((req, res) => {
  finalizeEndedEvents();
  const at = now();
  const all = q.all(`${REG_SQL} ORDER BY e.start_at DESC`, req.user.id).map((r) => describe(r, at));
  // Danh sách học kỳ: các học kỳ gần đây + mọi học kỳ có đăng ký
  const map = new Map(termList().map((t) => [t.key, t]));
  for (const r of all) if (!map.has(r.term.key)) map.set(r.term.key, termLabel(r.term.key));
  const terms = [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  const curTerm = termOf(at);
  const termKey = req.query.term || curTerm.key;
  const list = termKey === 'all' ? all : all.filter((r) => r.term.key === termKey);
  const by = (b) => list.filter((r) => r.bucket === b).length;
  const live = all.find((r) => r.bucket === 'upcoming' && r.phase === 'ongoing') || null;
  const stats = {
    total: list.filter((r) => r.status === 'registered' || r.event_status === 'cancelled').length,
    upcoming: by('upcoming'), attended: by('attended'), absent: by('absent'), cancelled: by('cancelled'),
    attendance_open: list.filter((r) => r.bucket === 'upcoming' && r.attendance_open).length,
    event_cancelled: list.filter((r) => r.event_status === 'cancelled').length,
    completed: list.filter((r) => r.bucket === 'attended' && r.checked_out_at).length,
    points: list.reduce((n, r) => n + (r.points_awarded || 0), 0),
    points_all: all.reduce((n, r) => n + (r.points_awarded || 0), 0),
  };
  res.json({ registrations: list, stats, live, terms, term: termKey, current_term: curTerm });
}));

// Dữ liệu trang điểm danh cho sinh viên
router.get('/attendance', requireRole('student'), wrap((req, res) => {
  finalizeEndedEvents();
  const at = now();
  const regs = q.all(`${REG_SQL} AND r.status = 'registered' AND e.status = 'approved' ORDER BY e.start_at`, req.user.id).map((r) => describe(r, at));
  // Sự kiện có thể điểm danh: đang diễn ra hoặc bắt đầu trong 60 phút tới
  const soon = addMinutes(at, 60);
  // đang/sắp diễn ra trong 60 phút, hoặc đang mở phiên (kể cả phiên check-out sau giờ kết thúc)
  const current = regs.filter((r) => (r.end_at >= at && r.start_at <= soon) || r.attendance_open);
  const next = regs.find((r) => r.start_at > soon) || null; // sự kiện gần nhất sắp tới (để hiển thị khi chưa có gì)
  const recent = q.all(`${REG_SQL} AND r.attendance = 'present' ORDER BY r.checked_in_at DESC LIMIT 1`, req.user.id).map((r) => describe(r, at))[0] || null;
  const enrich = (r) => {
    const s = activeSession(r.event_id);
    return { ...r, session: s ? { kind: s.kind, opened_at: s.opened_at, expires_at: s.expires_at, valid: s.expires_at >= at } : null };
  };
  res.json({ current: current.map(enrich), recent, next });
}));

// ----- Thông báo -----
router.get('/notifications', wrap((req, res) => {
  const items = q.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', req.user.id);
  const unread = q.get('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).n;
  res.json({ items, unread });
}));
router.post('/notifications/read-all', wrap((req, res) => {
  q.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
}));
router.post('/notifications/:id/read', wrap((req, res) => {
  q.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
