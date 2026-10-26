// Ma trận phân quyền: 4 phân hệ của hệ thống và vai trò được sử dụng từng chức năng.
// Dùng để hiển thị ở trang "Người dùng & phân quyền"; việc kiểm tra quyền thực tế nằm ở middleware requireRole.
const ROLES = [
  { key: 'student', name: 'Sinh viên', desc: 'Tài khoản cá nhân, đăng nhập bằng MSSV hoặc email sinh viên.' },
  { key: 'organizer', name: 'Ban tổ chức', desc: 'Tài khoản của đơn vị tổ chức sự kiện (email @neu.edu.vn).' },
  { key: 'admin', name: 'Đơn vị quản lý', desc: 'Cán bộ kiểm duyệt, giám sát hoạt động toàn trường.' },
  { key: 'sysadmin', name: 'Quản trị hệ thống', desc: 'Quản lý người dùng, phân quyền, cấu hình và an ninh dữ liệu.' },
];

const MODULES = [
  {
    key: 'student', name: 'Phân hệ Sinh viên',
    functions: [
      { name: 'Tìm kiếm, tra cứu thông tin sự kiện', roles: ['student', 'organizer', 'admin'] },
      { name: 'Đăng ký giữ chỗ, hủy đăng ký', roles: ['student'] },
      { name: 'Điểm danh check-in / check-out (mã, QR)', roles: ['student'] },
      { name: 'Theo dõi lịch sử hoạt động, điểm hoạt động', roles: ['student'] },
      { name: 'Đánh giá sự kiện sau khi tham dự', roles: ['student'] },
    ],
  },
  {
    key: 'organizer', name: 'Phân hệ Ban tổ chức',
    functions: [
      { name: 'Tạo, chỉnh sửa và gửi duyệt hồ sơ sự kiện', roles: ['organizer', 'admin'] },
      { name: 'Quản lý số lượng, danh sách người tham gia', roles: ['organizer', 'admin'] },
      { name: 'Mở phiên QR check-in / check-out, sửa điểm danh', roles: ['organizer', 'admin'] },
      { name: 'Gửi danh sách hoàn thành để duyệt điểm', roles: ['organizer'] },
      { name: 'Thống kê, xuất báo cáo sự kiện của đơn vị', roles: ['organizer', 'admin'] },
    ],
  },
  {
    key: 'admin', name: 'Phân hệ Đơn vị quản lý',
    functions: [
      { name: 'Kiểm duyệt nội dung trước khi công khai', roles: ['admin'] },
      { name: 'Duyệt điểm hoạt động (điểm Đoàn)', roles: ['admin'] },
      { name: 'Giám sát tiến độ hoạt động toàn trường', roles: ['admin'] },
      { name: 'Trích xuất báo cáo thống kê số liệu tham gia toàn trường', roles: ['admin'] },
    ],
  },
  {
    key: 'sysadmin', name: 'Phân hệ Quản trị hệ thống',
    functions: [
      { name: 'Quản lý người dùng, cấp tài khoản', roles: ['sysadmin'] },
      { name: 'Phân quyền (đổi vai trò), khóa / mở khóa tài khoản', roles: ['sysadmin'] },
      { name: 'Cấu hình tham số hệ thống, chế độ bảo trì', roles: ['sysadmin'] },
      { name: 'Nhật ký hệ thống, giám sát phiên đăng nhập', roles: ['sysadmin'] },
      { name: 'Sao lưu cơ sở dữ liệu, theo dõi hạ tầng', roles: ['sysadmin'] },
    ],
  },
];

module.exports = { ROLES, MODULES };
