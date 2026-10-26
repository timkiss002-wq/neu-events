// NEU Events – máy chủ Express
//   npm install   (lần đầu)
//   npm start     -> http://localhost:3000
const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { open, q } = require('./db/database');
const { HttpError } = require('./lib/util');
const { loadUser, requireAuth, requireRole } = require('./middleware/auth');
const settings = require('./lib/settings');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

// Tự tạo dữ liệu mẫu ở lần chạy đầu tiên
open();
if (!q.get('SELECT COUNT(*) n FROM users').n) {
  console.log('CSDL trống → tạo dữ liệu mẫu...');
  require('./db/seed').seed();
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 'loopback');
app.use(session({
  name: 'neu.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));
app.use(loadUser);

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/me', require('./routes/me'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/moderation', require('./routes/moderation'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/system', require('./routes/system'));

// Danh mục dùng cho form, bộ lọc
app.get('/api/meta', requireAuth, (_req, res) => {
  res.json({
    units: q.all('SELECT id, name, short_name FROM units ORDER BY name'),
    categories: q.all('SELECT id, name, color FROM categories ORDER BY id'),
    levels: settings.levels(), // cấp chương trình & điểm mặc định theo cấu hình hệ thống
  });
});

// Lịch sử thao tác toàn hệ thống (đơn vị quản lý, quản trị hệ thống)
app.get('/api/audit', requireRole('admin', 'sysadmin'), (req, res) => {
  const rows = q.all(`SELECT a.*, u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
                      ORDER BY a.id DESC LIMIT ?`, Math.min(500, Number(req.query.limit) || 100));
  res.json({ logs: rows });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API không tồn tại.' }));

// ---------- Giao diện tĩnh ----------
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.redirect('/login.html'));
app.get('/favicon.ico', (_req, res) => res.type('image/svg+xml').sendFile(path.join(__dirname, 'public', 'img', 'favicon.svg')));

// ---------- Xử lý lỗi ----------
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
});

app.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log('\n  NEU Events đang chạy:');
  console.log(`  ➜ Máy này:      http://localhost:${PORT}`);
  if (lan) console.log(`  ➜ Cùng mạng LAN: http://${lan.address}:${PORT}  (dùng cho điện thoại quét QR điểm danh)`);
  console.log('  Tài khoản demo (mật khẩu 123456): 11240123 (sinh viên) • cntt@neu.edu.vn (ban tổ chức) • admin@neu.edu.vn (đơn vị quản lý) • quantri@neu.edu.vn (quản trị hệ thống)\n');
});
