// Xác thực phiên đăng nhập và phân quyền theo vai trò
const { q } = require('../db/database');
const settings = require('../lib/settings');

function loadUser(req, _res, next) {
  if (req.session && req.session.userId) {
    const u = q.get(`SELECT u.id, u.code, u.email, u.full_name, u.role, u.unit_id, u.class_name, u.position, u.phone, u.is_active,
                            un.name AS unit_name, un.short_name AS unit_short
                     FROM users u LEFT JOIN units un ON un.id = u.unit_id WHERE u.id = ?`, req.session.userId);
    // Tự đăng xuất khi không thao tác quá thời gian cấu hình (trừ phiên "Ghi nhớ đăng nhập")
    const idle = settings.get('session_idle_minutes');
    const expired = idle > 0 && !req.session.remember && req.session.lastSeen && Date.now() - req.session.lastSeen > idle * 60000;
    if (!u || !u.is_active || expired) req.session.userId = null;
    // Chế độ bảo trì: chỉ Quản trị hệ thống được sử dụng
    else if (settings.get('maintenance_mode') && u.role !== 'sysadmin') req.maintenance = true;
    else { req.user = { ...u }; req.session.lastSeen = Date.now(); }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bạn cần đăng nhập để tiếp tục.' });
  next();
}

// requireRole('admin') hoặc requireRole('organizer','admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Bạn cần đăng nhập để tiếp tục.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác này.' });
  next();
};

module.exports = { loadUser, requireAuth, requireRole };
