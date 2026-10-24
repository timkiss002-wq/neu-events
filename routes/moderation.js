// Kiểm duyệt hồ sơ sự kiện – chỉ Đơn vị quản lý (admin)
const express = require('express');
const { q } = require('../db/database');
const { now, notify, audit, wrap, fail } = require('../lib/util');
const { EVENT_SELECT, decorate, getEvent } = require('../lib/events');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const CHECKS = ['Nội dung phù hợp', 'Đủ hồ sơ', 'Quy mô hợp lý'];

router.get('/', wrap((req, res) => {
  const { q: kw = '', status = '' } = req.query;
  const where = ["e.status IN ('pending','approved','rejected','cancelled')"]; const params = [];
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (kw) { where.push('(e.title LIKE ? OR e.code LIKE ? OR un.name LIKE ?)'); params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`); }
  const rows = q.all(`${EVENT_SELECT} WHERE ${where.join(' AND ')}
                      ORDER BY CASE e.status WHEN 'pending' THEN 0 ELSE 1 END, COALESCE(e.reviewed_at, e.submitted_at) DESC`, ...params)
    .map((e) => decorate(e));
  const at = now(); const today = at.slice(0, 10); const month = at.slice(0, 7);
  const stats = q.get(`SELECT
      SUM(status='pending') pending,
      SUM(status='pending' AND substr(submitted_at,1,10) = ?) pending_today,
      SUM(status IN ('approved','cancelled') AND substr(reviewed_at,1,7) = ?) approved_month,
      SUM(status IN ('approved','cancelled')) approved_total,
      SUM(status='rejected') rejected,
      SUM(status='rejected' AND substr(reviewed_at,1,7) = ?) rejected_month
    FROM events`, today, month, month);
  res.json({ events: rows, stats, month: `${month.slice(5, 7)}/${month.slice(0, 4)}`, checks: CHECKS });
}));

function decide(req, res, approve) {
  const ev = getEvent(Number(req.params.id));
  if (!ev) fail(404, 'Không tìm thấy hồ sơ.');
  if (ev.status !== 'pending') fail(400, 'Hồ sơ không ở trạng thái chờ duyệt.');
  const note = String(req.body?.note || '').trim();
  const checks = Array.isArray(req.body?.checks) ? req.body.checks.filter((c) => CHECKS.includes(c)) : [];
  if (!approve && note.length < 10) fail(400, 'Vui lòng nhập lý do từ chối (tối thiểu 10 ký tự) để ban tổ chức bổ sung.');
  if (approve && ev.start_at <= now()) fail(400, 'Thời gian tổ chức đã qua, không thể phê duyệt. Hãy từ chối để BTC cập nhật lịch.');
  const at = now();
  q.tx(() => {
    q.run('UPDATE events SET status=?, reviewed_at=?, reviewed_by=?, review_note=?, review_checks=?, updated_at=? WHERE id=?',
      approve ? 'approved' : 'rejected', at, req.user.id, note || null, JSON.stringify(checks), at, ev.id);
    audit(req.user.id, approve ? 'event.approve' : 'event.reject', 'event', ev.id,
      approve ? `Phê duyệt & xuất bản${checks.length ? ' (' + checks.join(', ') + ')' : ''}` : 'Từ chối hồ sơ', note);
    const recipients = new Set([ev.created_by, ...q.all("SELECT id FROM users WHERE role='organizer' AND unit_id = ?", ev.unit_id).map((u) => u.id)]);
    for (const uid of recipients) {
      if (!uid) continue;
      notify(uid, approve
        ? { type: 'moderation', title: 'Hồ sơ đã được duyệt', body: `"${ev.title}" đã được công khai và mở đăng ký.${note ? ' Nhận xét: ' + note : ''}`, link: `/event-detail.html?id=${ev.id}` }
        : { type: 'moderation', title: 'Hồ sơ bị từ chối', body: `"${ev.title}" cần bổ sung: ${note}`, link: `/event-form.html?id=${ev.id}` });
    }
  });
  res.json({ ok: true });
}

router.post('/:id/approve', wrap((req, res) => decide(req, res, true)));
router.post('/:id/reject', wrap((req, res) => decide(req, res, false)));

module.exports = router;
