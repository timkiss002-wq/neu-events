// Cấu hình hệ thống: danh sách tham số, giá trị mặc định và đọc/ghi bảng settings.
// Quản trị hệ thống thay đổi tại trang "Cấu hình hệ thống"; các phân hệ khác đọc qua settings.get(key).
const { q } = require('../db/database');

const GROUPS = [
  { key: 'general', name: 'Thông tin chung', desc: 'Tên hệ thống, kênh hỗ trợ và chế độ bảo trì.' },
  { key: 'event', name: 'Sự kiện & điểm danh', desc: 'Khung giờ mở phiên điểm danh và điểm hoạt động mặc định theo cấp chương trình.' },
  { key: 'security', name: 'Bảo mật đăng nhập', desc: 'Chính sách mật khẩu, khóa tài khoản khi nhập sai và thời gian chờ của phiên.' },
  { key: 'data', name: 'Dữ liệu & sao lưu', desc: 'Số bản sao lưu cơ sở dữ liệu được giữ lại.' },
];

// type: text | email | int | bool
const DEFS = [
  { key: 'site_name', group: 'general', label: 'Tên hệ thống', type: 'text', def: 'NEU Events', max: 60 },
  { key: 'support_email', group: 'general', label: 'Email hỗ trợ', type: 'email', def: 'events@neu.edu.vn' },
  { key: 'maintenance_mode', group: 'general', label: 'Chế độ bảo trì', type: 'bool', def: false,
    help: 'Khi bật, chỉ tài khoản Quản trị hệ thống đăng nhập và thao tác được; người dùng khác bị đăng xuất.' },
  { key: 'maintenance_message', group: 'general', label: 'Thông báo bảo trì', type: 'text', max: 200,
    def: 'Hệ thống đang được bảo trì để nâng cấp. Vui lòng quay lại sau.' },

  { key: 'checkin_before_min', group: 'event', label: 'Mở check-in trước giờ bắt đầu (phút)', type: 'int', def: 60, min: 0, max: 240 },
  { key: 'checkout_after_min', group: 'event', label: 'Cho phép check-out sau khi kết thúc (phút)', type: 'int', def: 120, min: 0, max: 480 },
  { key: 'points_truong', group: 'event', label: 'Điểm hoạt động – Cấp Trường', type: 'int', def: 5, min: 0, max: 20 },
  { key: 'points_khoa', group: 'event', label: 'Điểm hoạt động – Cấp Khoa/Viện', type: 'int', def: 3, min: 0, max: 20 },
  { key: 'points_clb', group: 'event', label: 'Điểm hoạt động – Cấp Chi đoàn/CLB', type: 'int', def: 2, min: 0, max: 20 },

  { key: 'password_min_length', group: 'security', label: 'Độ dài mật khẩu tối thiểu', type: 'int', def: 6, min: 6, max: 32 },
  { key: 'max_login_attempts', group: 'security', label: 'Số lần nhập sai mật khẩu trước khi tạm khóa', type: 'int', def: 5, min: 3, max: 20 },
  { key: 'lockout_minutes', group: 'security', label: 'Thời gian tạm khóa đăng nhập (phút)', type: 'int', def: 15, min: 1, max: 1440 },
  { key: 'session_idle_minutes', group: 'security', label: 'Tự đăng xuất khi không thao tác (phút)', type: 'int', def: 120, min: 0, max: 1440,
    help: '0 = không giới hạn. Không áp dụng cho phiên chọn "Ghi nhớ đăng nhập".' },

  { key: 'backup_keep', group: 'data', label: 'Số bản sao lưu giữ lại', type: 'int', def: 10, min: 1, max: 50,
    help: 'Khi tạo bản sao lưu mới, các bản cũ vượt quá số lượng này sẽ tự xóa.' },
];
const BY_KEY = Object.fromEntries(DEFS.map((d) => [d.key, d]));

let cache = null;
function load() {
  if (cache) return cache;
  cache = {};
  for (const d of DEFS) cache[d.key] = d.def;
  for (const r of q.all('SELECT key, value FROM settings')) if (BY_KEY[r.key]) cache[r.key] = decode(BY_KEY[r.key], r.value);
  return cache;
}
function decode(def, raw) {
  if (def.type === 'bool') return raw === '1' || raw === 'true';
  if (def.type === 'int') return Number(raw);
  return raw;
}

const get = (key) => load()[key];
const all = () => ({ ...load() });

// Kiểm tra & chuẩn hóa giá trị; trả về chuỗi lỗi nếu không hợp lệ
function normalize(def, v) {
  if (def.type === 'bool') return { value: v === true || v === 1 || v === '1' || v === 'true' };
  if (def.type === 'int') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < def.min || n > def.max) return { error: `"${def.label}" phải là số nguyên từ ${def.min} đến ${def.max}.` };
    return { value: n };
  }
  const s = String(v ?? '').trim();
  if (!s) return { error: `"${def.label}" không được để trống.` };
  if (def.max && s.length > def.max) return { error: `"${def.label}" tối đa ${def.max} ký tự.` };
  if (def.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { error: `"${def.label}" không phải email hợp lệ.` };
  return { value: s };
}

// Ghi nhiều tham số; trả về danh sách thay đổi [{ key, label, from, to }]
function update(values, userId, at) {
  const cur = load();
  const changes = [];
  for (const [key, raw] of Object.entries(values || {})) {
    const def = BY_KEY[key];
    if (!def) continue;
    const r = normalize(def, raw);
    if (r.error) { const e = new Error(r.error); e.status = 400; throw e; }
    if (r.value === cur[key]) continue;
    changes.push({ key, label: def.label, from: cur[key], to: r.value });
  }
  if (changes.length) {
    q.tx(() => {
      for (const c of changes) {
        const stored = BY_KEY[c.key].type === 'bool' ? (c.to ? '1' : '0') : String(c.to);
        q.run(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        c.key, stored, userId, at);
      }
    });
    cache = null;
  }
  return changes;
}

// Khôi phục giá trị mặc định
function reset() { q.run('DELETE FROM settings'); cache = null; }
function invalidate() { cache = null; }

// Cấp chương trình & điểm mặc định (theo cấu hình hiện tại)
function levels() {
  const s = load();
  return [
    { key: 'truong', name: 'Cấp Trường', points: s.points_truong },
    { key: 'khoa', name: 'Cấp Khoa/Viện', points: s.points_khoa },
    { key: 'clb', name: 'Cấp Chi đoàn/CLB', points: s.points_clb },
  ];
}

module.exports = { GROUPS, DEFS, get, all, update, reset, invalidate, levels };
