// Đánh giá sự kiện: sinh viên đánh giá sự kiện đã tham dự; BTC/quản lý xem phản hồi
const express = require('express');
const { q } = require('../db/database');
const { now, audit, wrap, fail } = require('../lib/util');
const { EVENT_SELECT, decorate, getEvent, mustManage, finalizeEndedEvents } = require('../lib/events');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Sinh viên: danh sách sự kiện đã tham dự + đánh giá của mình
router.get('/mine', requireRole('student'), wrap((req, res) => {
  finalizeEndedEvents();
  const rows = q.all(`SELECT e.id AS event_id, e.title, e.code, e.start_at, e.end_at, e.location, c.name AS category_name, un.short_name AS unit_short,
                             r.checked_in_at, r.checked_out_at, v.rating, v.comment, v.is_anonymous, v.created_at AS reviewed_at, v.updated_at
                      FROM registrations r JOIN events e ON e.id = r.event_id
                      LEFT JOIN categories c ON c.id = e.category_id LEFT JOIN units un ON un.id = e.unit_id
                      LEFT JOIN reviews v ON v.event_id = e.id AND v.user_id = r.user_id
                      WHERE r.user_id = ? AND r.status = 'registered' AND r.attendance = 'present'
                      ORDER BY (v.id IS NOT NULL), e.start_at DESC`, req.user.id);
  res.json({ items: rows, pending: rows.filter((r) => !r.rating).length, done: rows.filter((r) => r.rating).length });
}));

// Sinh viên: gửi / sửa đánh giá
router.post('/', requireRole('student'), wrap((req, res) => {
  const eventId = Number(req.body?.event_id);
  const rating = parseInt(req.body?.rating, 10);
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  const anon = req.body?.is_anonymous ? 1 : 0;
  if (!(rating >= 1 && rating <= 5)) fail(400, 'Vui lòng chọn số sao từ 1 đến 5.');
  const reg = q.get("SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status='registered' AND attendance='present'", eventId, req.user.id);
  if (!reg) fail(403, 'Chỉ sự kiện bạn đã tham dự mới được mở đánh giá.');
  const at = now();
  const existing = q.get('SELECT id FROM reviews WHERE event_id = ? AND user_id = ?', eventId, req.user.id);
  if (existing) q.run('UPDATE reviews SET rating=?, comment=?, is_anonymous=?, updated_at=? WHERE id=?', rating, comment, anon, at, existing.id);
  else q.run('INSERT INTO reviews (event_id,user_id,rating,comment,is_anonymous,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', eventId, req.user.id, rating, comment, anon, at, at);
  audit(req.user.id, existing ? 'review.update' : 'review.create', 'event', eventId, `Đánh giá ${rating} sao`);
  res.json({ ok: true });
}));

// BTC / quản lý: tổng hợp đánh giá theo sự kiện
router.get('/manage', requireRole('organizer', 'admin'), wrap((req, res) => {
  const params = [];
  let where = "e.status IN ('approved','cancelled')";
  if (req.user.role === 'organizer') { where += ' AND (e.unit_id = ? OR e.created_by = ?)'; params.push(req.user.unit_id, req.user.id); }
  const events = q.all(`${EVENT_SELECT} WHERE ${where} AND (SELECT COUNT(*) FROM reviews v WHERE v.event_id = e.id) > 0 ORDER BY e.start_at DESC`, ...params).map((e) => decorate(e));
  let selected = null, reviews = [], dist = [0, 0, 0, 0, 0];
  const id = Number(req.query.event_id) || events[0]?.id;
  if (id) {
    selected = getEvent(id);
    mustManage(req.user, selected);
    // Đánh giá ẩn danh: không trả về họ tên, MSSV cho BTC / quản lý
    reviews = q.all(`SELECT v.rating, v.comment, v.created_at, v.is_anonymous,
                            CASE WHEN v.is_anonymous = 1 THEN 'Sinh viên ẩn danh' ELSE u.full_name END AS full_name,
                            CASE WHEN v.is_anonymous = 1 THEN '' ELSE u.code END AS student_code
                     FROM reviews v JOIN users u ON u.id = v.user_id
                     WHERE v.event_id = ? ORDER BY v.created_at DESC`, id);
    for (const r of reviews) dist[r.rating - 1]++;
  }
  const overall = q.get(`SELECT ROUND(AVG(v.rating),2) avg, COUNT(*) n FROM reviews v JOIN events e ON e.id = v.event_id WHERE ${where}`, ...params);
  res.json({ events, selected, reviews, distribution: dist, overall });
}));

module.exports = router;
