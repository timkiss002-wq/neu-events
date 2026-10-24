// Báo cáo – thống kê (chỉ Đơn vị quản lý)
const express = require('express');
const ExcelJS = require('exceljs');
const { q } = require('../db/database');
const { now, fmt, parse, wrap, termRange } = require('../lib/util');
const { EVENT_SELECT, decorate, finalizeEndedEvents } = require('../lib/events');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
// Đơn vị quản lý: toàn trường • Ban tổ chức: chỉ sự kiện của đơn vị mình
router.use(requireRole('organizer', 'admin'));

const PHASE_LABEL = { upcoming: 'Sắp diễn ra', ongoing: 'Đang diễn ra', ended: 'Đã kết thúc', cancelled: 'Đã hủy' };
const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

function defaultRange() {
  // Mặc định: từ đầu tháng trước đến hết tháng hiện tại (giống thiết kế 01/09 – 31/10)
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: fmt(from).slice(0, 10), to: fmt(end).slice(0, 10) };
}

function build(query, user) {
  finalizeEndedEvents();
  if (user && user.role === 'organizer') query = { ...query, unit: String(user.unit_id) };
  const def = (query.term && termRange(query.term)) || defaultRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : def.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : def.to;
  const where = ["e.status IN ('approved','cancelled')", 'substr(e.start_at,1,10) >= ?', 'substr(e.start_at,1,10) <= ?'];
  const params = [from, to];
  if (query.unit) { where.push('e.unit_id = ?'); params.push(Number(query.unit)); }
  if (query.category) { where.push('e.category_id = ?'); params.push(Number(query.category)); }
  const at = now();
  const events = q.all(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.start_at DESC`, ...params).map((e) => decorate(e, at));
  const live = events.filter((e) => e.status === 'approved');
  const ids = live.map((e) => e.id);

  const sum = (arr, f) => arr.reduce((s, e) => s + f(e), 0);
  const ended = live.filter((e) => e.phase === 'ended');
  const ongoing = live.filter((e) => e.phase === 'ongoing');
  const upcoming = live.filter((e) => e.phase === 'upcoming');
  const presentEnded = sum(ended, (e) => e.present_count);
  const regEnded = sum(ended, (e) => e.registered_count);
  const ratings = ids.length ? q.get(`SELECT ROUND(AVG(rating),2) avg, COUNT(*) n FROM reviews WHERE event_id IN (${ids.map(() => '?').join(',')})`, ...ids) : { avg: null, n: 0 };

  const summary = {
    events: live.length, ended: ended.length, ongoing: ongoing.length, upcoming: upcoming.length, cancelled: events.length - live.length,
    registrations: sum(live, (e) => e.registered_count),
    attendance: sum(live, (e) => e.present_count), attendance_ended: presentEnded, attendance_ongoing: sum(ongoing, (e) => e.present_count),
    registrations_ended: regEnded, rate: regEnded ? presentEnded / regEnded : null,
    completed: sum(live, (e) => e.completed_count),
    avg_rating: ratings.avg, review_count: ratings.n,
  };

  // Theo tuần (hoặc theo tháng nếu khoảng thời gian dài)
  const start = parse(`${from} 00:00:00`); const endD = parse(`${to} 23:59:59`);
  const days = Math.round((endD - start) / 86400000);
  const buckets = [];
  if (days <= 70) {
    const s = new Date(start); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // về thứ Hai
    for (let d = new Date(s); d <= endD; d.setDate(d.getDate() + 7)) {
      const e = new Date(d); e.setDate(e.getDate() + 6);
      buckets.push({ label: `${dmy(d)}–${dmy(e)}`, from: fmt(d).slice(0, 10), to: fmt(e).slice(0, 10), registrations: 0, attendance: 0 });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= endD; d.setMonth(d.getMonth() + 1)) {
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      buckets.push({ label: `T${d.getMonth() + 1}/${d.getFullYear()}`, from: fmt(d).slice(0, 10), to: fmt(e).slice(0, 10), registrations: 0, attendance: 0 });
    }
  }
  if (ids.length) {
    const inList = ids.map(() => '?').join(',');
    const regs = q.all(`SELECT substr(registered_at,1,10) d, COUNT(*) n FROM registrations WHERE status='registered' AND event_id IN (${inList}) GROUP BY d`, ...ids);
    const atts = q.all(`SELECT substr(checked_in_at,1,10) d, COUNT(*) n FROM registrations WHERE status='registered' AND attendance='present' AND checked_in_at IS NOT NULL AND event_id IN (${inList}) GROUP BY d`, ...ids);
    const put = (rows, key) => rows.forEach((r) => { const b = buckets.find((x) => r.d >= x.from && r.d <= x.to); if (b) b[key] += r.n; });
    put(regs, 'registrations'); put(atts, 'attendance');
  }
  // Bỏ các tuần trống ở cuối (tương lai) để biểu đồ gọn
  while (buckets.length > 1 && buckets[buckets.length - 1].from > at.slice(0, 10) && !buckets[buckets.length - 1].registrations) buckets.pop();

  // Cơ cấu theo loại
  const cats = q.all('SELECT id, name, color FROM categories ORDER BY id');
  const byCategory = cats.map((c) => ({ ...c, count: live.filter((e) => e.category_id === c.id).length })).filter((c) => c.count > 0);

  const table = events.map((e) => ({
    id: e.id, title: e.title, code: e.code, unit_short: e.unit_short, category_name: e.category_name, start_at: e.start_at,
    registered: e.registered_count, present: e.phase === 'upcoming' || e.status === 'cancelled' ? null : e.present_count,
    completed: e.phase === 'upcoming' || e.status === 'cancelled' ? null : e.completed_count, points_status: e.points_status,
    rate: e.phase === 'ended' && e.registered_count ? e.present_count / e.registered_count : null,
    avg_rating: e.avg_rating, review_count: e.review_count,
    phase: e.status === 'cancelled' ? 'cancelled' : e.phase, phase_label: PHASE_LABEL[e.status === 'cancelled' ? 'cancelled' : e.phase],
  }));

  return { filters: { from, to, unit: query.unit || '', category: query.category || '' }, summary, weekly: buckets, monthly: days > 70, byCategory, table, generated_at: at };
}

router.get('/', wrap((req, res) => res.json(build(req.query, req.user))));

router.get('/export', wrap(async (req, res) => {
  const r = build(req.query, req.user);
  const unit = r.filters.unit ? q.get('SELECT name FROM units WHERE id = ?', Number(r.filters.unit))?.name : 'Toàn trường';
  const cat = r.filters.category ? q.get('SELECT name FROM categories WHERE id = ?', Number(r.filters.category))?.name : 'Tất cả loại';
  const wb = new ExcelJS.Workbook(); wb.creator = 'NEU Events';
  const blue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1451A8' } };
  const header = (row) => row.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = blue; });

  const s1 = wb.addWorksheet('Tổng quan');
  s1.addRow(['BÁO CÁO HOẠT ĐỘNG SỰ KIỆN – NEU EVENTS']).font = { bold: true, size: 14, color: { argb: 'FF0F2A5C' } };
  s1.addRow([`Khoảng thời gian: ${r.filters.from} → ${r.filters.to} • Đơn vị: ${unit} • Loại: ${cat}`]);
  s1.addRow([`Xuất lúc: ${r.generated_at}`]); s1.addRow([]);
  header(s1.addRow(['Chỉ số', 'Giá trị', 'Ghi chú']));
  const S = r.summary;
  [['Số sự kiện', S.events, `${S.ended} đã kết thúc • ${S.ongoing} đang diễn ra • ${S.upcoming} sắp diễn ra`],
    ['Sự kiện đã hủy', S.cancelled, 'Không tính vào các chỉ số bên dưới'],
    ['Lượt đăng ký', S.registrations, 'Không tính đăng ký của sự kiện đã hủy'],
    ['Lượt tham dự', S.attendance, `${S.attendance_ended} đã kết thúc • ${S.attendance_ongoing} đang diễn ra`],
    ['Lượt hoàn thành', S.completed, 'Sinh viên đã check-in và check-out'],
    ['Tỷ lệ tham dự', S.rate == null ? '—' : S.rate, `${S.attendance_ended} / ${S.registrations_ended} đăng ký của sự kiện đã kết thúc`],
    ['Điểm đánh giá TB', S.avg_rating ?? '—', `${S.review_count} lượt đánh giá`]].forEach((row) => s1.addRow(row));
  s1.getCell('B11').numFmt = '0.0%';
  s1.columns = [{ width: 24 }, { width: 14 }, { width: 60 }];

  const s2 = wb.addWorksheet('Theo sự kiện');
  header(s2.addRow(['Mã', 'Sự kiện', 'Đơn vị', 'Loại', 'Bắt đầu', 'Đăng ký', 'Check-in', 'Hoàn thành', 'Tỷ lệ', 'Đánh giá TB', 'Số đánh giá', 'Trạng thái']));
  r.table.forEach((e) => {
    const row = s2.addRow([e.code, e.title, e.unit_short, e.category_name, e.start_at.slice(0, 16), e.registered, e.present ?? '—', e.completed ?? '—', e.rate ?? '—', e.avg_rating ?? '—', e.review_count, e.phase_label]);
    if (e.rate != null) row.getCell(9).numFmt = '0.0%';
  });
  s2.columns = [{ width: 18 }, { width: 46 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 14 }];
  s2.autoFilter = { from: 'A1', to: 'L1' };

  const s3 = wb.addWorksheet(r.monthly ? 'Theo tháng' : 'Theo tuần');
  header(s3.addRow([r.monthly ? 'Tháng' : 'Tuần', 'Từ ngày', 'Đến ngày', 'Lượt đăng ký', 'Lượt tham dự']));
  r.weekly.forEach((w) => s3.addRow([w.label, w.from, w.to, w.registrations, w.attendance]));
  s3.columns = [{ width: 16 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }];

  const s4 = wb.addWorksheet('Theo loại');
  header(s4.addRow(['Loại sự kiện', 'Số sự kiện', 'Tỷ trọng']));
  const tot = r.byCategory.reduce((s, c) => s + c.count, 0) || 1;
  r.byCategory.forEach((c) => { const row = s4.addRow([c.name, c.count, c.count / tot]); row.getCell(3).numFmt = '0.0%'; });
  s4.columns = [{ width: 20 }, { width: 12 }, { width: 12 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bao-cao-su-kien-${r.filters.from}_${r.filters.to}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

module.exports = router;
