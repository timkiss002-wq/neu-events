// Truy vấn & quy tắc nghiệp vụ dùng chung cho sự kiện
const { q } = require('../db/database');
const { now, phaseOf, fail } = require('./util');

// Câu SELECT chuẩn kèm tên đơn vị, loại và số liệu đăng ký/tham dự
const EVENT_SELECT = `
  SELECT e.*, c.name AS category_name, c.color AS category_color,
         un.name AS unit_name, un.short_name AS unit_short,
         cu.full_name AS creator_name,
         rv.full_name AS reviewer_name, rvu.short_name AS reviewer_unit,
         (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered') AS registered_count,
         (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered' AND r.attendance = 'present') AS present_count,
         (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered' AND r.attendance = 'absent') AS absent_count,
         (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered' AND r.attendance = 'present' AND r.checked_out_at IS NOT NULL) AS completed_count,
         (SELECT status FROM point_submissions p WHERE p.event_id = e.id) AS points_status,
         (SELECT ROUND(AVG(rating), 2) FROM reviews v WHERE v.event_id = e.id) AS avg_rating,
         (SELECT COUNT(*) FROM reviews v WHERE v.event_id = e.id) AS review_count
  FROM events e
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN units un ON un.id = e.unit_id
  LEFT JOIN users cu ON cu.id = e.created_by
  LEFT JOIN users rv ON rv.id = e.reviewed_by
  LEFT JOIN units rvu ON rvu.id = rv.unit_id`;

function decorate(ev, at = now()) {
  if (!ev) return ev;
  const e = { ...ev };
  e.phase = phaseOf(e, at);
  e.seats_left = Math.max(0, e.capacity - e.registered_count);
  e.registration_open = e.status === 'approved' && at < e.reg_deadline && at < e.end_at && e.seats_left > 0;
  e.review_checks = e.review_checks ? JSON.parse(e.review_checks) : [];
  return e;
}

function getEvent(id) {
  return decorate(q.get(`${EVENT_SELECT} WHERE e.id = ?`, id));
}

// Người dùng có quyền quản lý sự kiện? (admin: tất cả; BTC: sự kiện của đơn vị mình)
function canManage(user, ev) {
  if (!user || !ev) return false;
  if (user.role === 'admin') return true;
  return user.role === 'organizer' && (ev.unit_id === user.unit_id || ev.created_by === user.id);
}

function mustManage(user, ev) {
  if (!ev) fail(404, 'Không tìm thấy sự kiện.');
  if (!canManage(user, ev)) fail(403, 'Bạn không có quyền quản lý sự kiện này.');
}

// Người dùng có được xem sự kiện? Sự kiện công khai = đã duyệt hoặc đã hủy
function canView(user, ev) {
  if (!ev) return false;
  if (['approved', 'cancelled'].includes(ev.status)) return true;
  return canManage(user, ev);
}

// Thời gian cho phép check-out sau khi sự kiện kết thúc (phút)
const CHECKOUT_GRACE = 120;

// Hoàn tất điểm danh cho sự kiện đã kết thúc: đóng phiên check-in còn mở, chuyển "chưa check-in" -> "vắng mặt";
// phiên check-out tự đóng khi hết hiệu lực
function finalizeEndedEvents() {
  const at = now();
  const ended = q.all(`SELECT id, end_at FROM events WHERE status = 'approved' AND end_at < ?
                       AND (EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.event_id = events.id AND s.closed_at IS NULL AND s.kind = 'checkin')
                            OR EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = events.id AND r.status='registered' AND r.attendance='pending'))`, at);
  for (const e of ended) closeAttendance(e.id, e.end_at);
  q.run("UPDATE attendance_sessions SET closed_at = expires_at WHERE closed_at IS NULL AND kind = 'checkout' AND expires_at < ?", at);
}

// Đóng phiên check-in: sinh viên chưa check-in được ghi nhận vắng mặt
function closeAttendance(eventId, closedAt = now()) {
  q.run("UPDATE attendance_sessions SET closed_at = ? WHERE event_id = ? AND closed_at IS NULL AND kind = 'checkin'", closedAt, eventId);
  return q.run(`UPDATE registrations SET attendance = 'absent' WHERE event_id = ? AND status = 'registered' AND attendance = 'pending'`, eventId).changes;
}

function activeSession(eventId) {
  return q.get('SELECT * FROM attendance_sessions WHERE event_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1', eventId);
}

module.exports = { CHECKOUT_GRACE, EVENT_SELECT, decorate, getEvent, canManage, mustManage, canView, finalizeEndedEvents, closeAttendance, activeSession };
