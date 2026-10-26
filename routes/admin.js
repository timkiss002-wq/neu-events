// Chức năng riêng của Đơn vị quản lý:
//  - Duyệt danh sách sinh viên hoàn thành do BTC gửi để cộng điểm hoạt động (điểm Đoàn)
// (Cấp tài khoản, phân quyền người dùng đã chuyển sang phân hệ Quản trị hệ thống – routes/system.js)
const express = require('express');
const { q } = require('../db/database');
const { now, notify, audit, wrap, fail } = require('../lib/util');
const { getEvent } = require('../lib/events');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

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
