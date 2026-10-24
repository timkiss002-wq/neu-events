// Các hàm dùng chung cho back-end: thời gian, trạng thái sự kiện, thông báo, audit log.
const { q } = require('../db/database');

const pad = (n) => String(n).padStart(2, '0');

// Định dạng Date -> 'YYYY-MM-DD HH:MM:SS' (giờ địa phương của máy chủ)
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const now = () => fmt(new Date());

// Chuẩn hóa chuỗi thời gian người dùng gửi lên ('2026-10-24T08:00' hoặc '2026-10-24 08:00')
function normTime(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] || '00'}`;
}
function parse(s) { return s ? new Date(s.replace(' ', 'T')) : null; }
function addMinutes(s, mins) { const d = parse(s); d.setMinutes(d.getMinutes() + mins); return fmt(d); }

// Học kỳ theo ngày: T8–T12 → HK I; T1–T5 → HK II; T6–T7 → HK hè
function termOf(s) {
  const d = parse(s) || new Date();
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (m >= 8) return { key: `${y}-1`, label: `Học kỳ I, ${y}–${y + 1}`, short: `Học kỳ I • Năm học ${y}–${y + 1}` };
  if (m <= 5) return { key: `${y - 1}-2`, label: `Học kỳ II, ${y - 1}–${y}`, short: `Học kỳ II • Năm học ${y - 1}–${y}` };
  return { key: `${y - 1}-3`, label: `Học kỳ hè, ${y - 1}–${y}`, short: `Học kỳ hè • Năm học ${y - 1}–${y}` };
}

// Khóa học kỳ 'YYYY-n' → khoảng ngày [from, to] (n: 1 = HK I, 2 = HK II, 3 = HK hè)
function termRange(key) {
  const m = /^(\d{4})-([123])$/.exec(String(key || ''));
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] === '1') return { from: `${y}-08-01`, to: `${y}-12-31` };
  if (m[2] === '2') return { from: `${y + 1}-01-01`, to: `${y + 1}-05-31` };
  return { from: `${y + 1}-06-01`, to: `${y + 1}-07-31` };
}
function termLabel(key) {
  const [y, n] = key.split('-').map(Number);
  const name = { 1: 'Học kỳ I', 2: 'Học kỳ II', 3: 'Học kỳ hè' }[n];
  return { key, label: `${name}, ${y}–${y + 1}`, short: `${name} • Năm học ${y}–${y + 1}`, year: `${y}–${y + 1}`, ...termRange(key) };
}
// Danh sách học kỳ: học kỳ hiện tại và lùi về các năm học trước
function termList(years = 4, at = now()) {
  const cur = termOf(at);
  const [cy, cn] = cur.key.split('-').map(Number);
  const out = [];
  for (let y = cy; y > cy - years; y--) for (let n = 3; n >= 1; n--) if (y < cy || n <= cn) out.push(termLabel(`${y}-${n}`));
  return out;
}
// Email cán bộ / đơn vị bắt buộc thuộc tên miền neu.edu.vn
const isNeuEmail = (e) => /^[^\s@]+@([a-z0-9-]+\.)*neu\.edu\.vn$/i.test(String(e || '').trim());

// Giai đoạn của sự kiện đã duyệt dựa trên thời gian hiện tại
function phaseOf(ev, at = now()) {
  if (ev.status !== 'approved') return ev.status; // draft | pending | rejected | cancelled
  if (at < ev.start_at) return 'upcoming';
  if (at <= ev.end_at) return 'ongoing';
  return 'ended';
}

function notify(userId, { type = 'info', title, body = '', link = '' }) {
  q.run('INSERT INTO notifications (user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?)',
    userId, type, title, body, link, now());
}

function audit(actorId, action, entityType, entityId, detail = '', reason = '') {
  q.run('INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,detail,reason,created_at) VALUES (?,?,?,?,?,?,?)',
    actorId ?? null, action, entityType, entityId ?? null,
    typeof detail === 'string' ? detail : JSON.stringify(detail), reason || '', now());
}

// Mã ngẫu nhiên dễ đọc (bỏ ký tự dễ nhầm 0/O, 1/I)
function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Lỗi có mã HTTP để trả về client
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// Bọc handler async để lỗi được chuyển tới middleware xử lý lỗi
const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) { next(e); }
};

module.exports = { fmt, now, normTime, parse, addMinutes, termOf, termRange, termLabel, termList, isNeuEmail, phaseOf, notify, audit, randomCode, HttpError, fail, wrap };
