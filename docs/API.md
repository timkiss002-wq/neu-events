# Danh sách REST API – NEU Events

- Gốc: `http://localhost:3000/api`
- Dữ liệu gửi/nhận: JSON (riêng tạo/sửa sự kiện dùng `multipart/form-data` để upload file).
- Xác thực: cookie phiên `neu.sid` nhận sau khi đăng nhập.
- Lỗi trả về `{ "error": "thông báo tiếng Việt" }` với mã HTTP: `400` dữ liệu sai · `401` chưa đăng nhập · `403` không đủ quyền · `404` không tìm thấy · `409` xung đột (đã đăng ký, hết chỗ…).
- Quyền: **SV** = sinh viên, **BTC** = ban tổ chức (chỉ sự kiện của đơn vị mình), **QL** = đơn vị quản lý (toàn bộ).

## Xác thực & tài khoản – `routes/auth.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | Công khai | `{ username, password, remember }` – username là MSSV/mã CB hoặc email |
| POST | `/auth/logout` | Đã đăng nhập | Hủy phiên |
| GET | `/auth/me` | Đã đăng nhập | Người dùng, học kỳ hiện tại, số thông báo chưa đọc, badge sidebar |
| POST | `/auth/forgot` | Công khai | `{ username }` → tạo mã 6 số (demo: trả về `demo_code`) |
| POST | `/auth/reset` | Công khai | `{ username, code, password }` |
| GET | `/auth/profile` | Đã đăng nhập | Thông tin, thống kê cá nhân, hoạt động gần đây |
| PUT | `/auth/profile` | Đã đăng nhập | `{ email, phone }` |
| POST | `/auth/password` | Đã đăng nhập | `{ current, password }` |

## Sự kiện – `routes/events.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/events` | Tất cả | Sự kiện đã duyệt. Tham số: `q`, `category`, `unit`, `phase` (`open`/`upcoming`/`ongoing`/`ended`). SV kèm `my_registration` |
| GET | `/events/:id` | Tất cả* | Chi tiết + chương trình, file, đăng ký/đánh giá của tôi, `can_manage`, `attendance_open`. *Hồ sơ chưa duyệt chỉ BTC/QL xem |
| GET | `/events/:id/history` | BTC, QL | Lịch sử thao tác của hồ sơ |
| GET | `/events/manage/list` | BTC, QL | Danh sách quản lý + đếm theo trạng thái. Tham số: `q`, `status` |
| POST | `/events` | BTC, QL | Tạo hồ sơ (multipart): các trường sự kiện, `agenda` (JSON), `cover`, `files[]`, `submit=1` để gửi duyệt luôn |
| PUT | `/events/:id` | BTC, QL | Sửa hồ sơ Nháp/Bị từ chối; thêm `remove_files` (JSON id) |
| POST | `/events/:id/submit` | BTC, QL | Gửi duyệt / gửi lại |
| POST | `/events/:id/withdraw` | BTC, QL | Rút hồ sơ chờ duyệt về nháp |
| POST | `/events/:id/cancel` | BTC, QL | `{ reason }` – hủy sự kiện đã duyệt, thông báo cho SV |
| DELETE | `/events/:id` | BTC, QL | Xóa hồ sơ nháp |
| POST | `/events/:id/register` | SV | Đăng ký → `{ code }` |
| POST | `/events/:id/unregister` | SV | Hủy đăng ký (trước hạn) |
| GET | `/events/files/:fileId/download` | Tất cả* | Tải file đính kèm |

## Cá nhân – `routes/me.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/me/registrations?term=` | SV | Đăng ký theo học kỳ (`term=all` cho tất cả), thống kê, sự kiện đang diễn ra |
| GET | `/me/attendance` | SV | Sự kiện cần điểm danh (đang/sắp diễn ra trong 60 phút), lần tham dự gần nhất |
| GET | `/me/notifications` | Tất cả | 30 thông báo mới nhất |
| POST | `/me/notifications/:id/read` | Tất cả | Đánh dấu đã đọc |
| POST | `/me/notifications/read-all` | Tất cả | Đánh dấu tất cả đã đọc |

## Điểm danh – `routes/attendance.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/attendance/checkin` | SV | `{ event_id, code, method: 'code'|'qr' }` |
| GET | `/attendance/events` | BTC, QL | Sự kiện có thể điểm danh (đang → sắp → đã kết thúc) |
| GET | `/attendance/:eventId` | BTC, QL | Thống kê, phiên hiện tại + ảnh QR (data URL), danh sách. Tham số: `q`, `status`, `page`, `size` |
| POST | `/attendance/:eventId/open` | BTC, QL | `{ minutes, code? }` – mở phiên / đổi mã |
| POST | `/attendance/:eventId/close` | BTC, QL | Đóng phiên, chưa điểm danh → vắng mặt |
| POST | `/attendance/:eventId/mark` | BTC, QL | `{ registration_id, attendance, reason }` – sửa thủ công (bắt buộc lý do) |
| GET | `/attendance/:eventId/export` | BTC, QL | Tải file Excel danh sách điểm danh |

## Kiểm duyệt – `routes/moderation.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/moderation?q=&status=` | QL | Danh sách hồ sơ + thống kê |
| POST | `/moderation/:id/approve` | QL | `{ note?, checks[] }` – phê duyệt & xuất bản |
| POST | `/moderation/:id/reject` | QL | `{ note, checks[] }` – từ chối (note ≥ 10 ký tự) |

## Đánh giá – `routes/reviews.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/reviews/mine` | SV | Sự kiện đã tham dự + đánh giá của tôi |
| POST | `/reviews` | SV | `{ event_id, rating 1–5, comment }` – tạo hoặc cập nhật |
| GET | `/reviews/manage?event_id=` | BTC, QL | Sự kiện có đánh giá, phân bố sao, danh sách nhận xét |

## Báo cáo – `routes/reports.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/reports?from=&to=&unit=&category=` | QL | Chỉ số tổng hợp, theo tuần/tháng, theo loại, bảng sự kiện (mặc định: đầu tháng trước → cuối tháng này) |
| GET | `/reports/export?...` | QL | Tải file Excel 4 trang tính |

## Khác – `server.js`

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/meta` | Đã đăng nhập | Danh sách đơn vị và loại sự kiện |
| GET | `/audit?limit=` | QL | Nhật ký thao tác toàn hệ thống |

## Ví dụ gọi bằng curl

```bash
# Đăng nhập, lưu cookie
curl -c ck.txt -H "Content-Type: application/json" -d '{"username":"11240123","password":"123456"}' http://localhost:3000/api/auth/login
# Danh sách sự kiện đang mở đăng ký
curl -b ck.txt "http://localhost:3000/api/events?phase=open"
# Đăng ký sự kiện id 9
curl -b ck.txt -X POST http://localhost:3000/api/events/9/register
# Điểm danh
curl -b ck.txt -H "Content-Type: application/json" -d '{"event_id":8,"code":"AI1210"}' http://localhost:3000/api/attendance/checkin
```

## Bổ sung: check-out, điểm hoạt động, tài khoản đơn vị

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/attendance/checkin` | Sinh viên | `{event_id, code}` – tự nhận biết phiên check-in hay check-out; check-out yêu cầu đã check-in |
| POST | `/api/attendance/:eventId/open` | BTC/QL | `{kind: 'checkin'\|'checkout', minutes, code?}` |
| GET | `/api/attendance/:eventId/export?type=all\|completed` | BTC/QL | Excel danh sách đăng ký / hoàn thành |
| POST | `/api/attendance/:eventId/submit-points` | BTC/QL | Gửi danh sách hoàn thành để duyệt điểm |
| GET | `/api/admin/points?status=` | QL | Danh sách đã gửi + số lượng theo trạng thái |
| GET | `/api/admin/points/:eventId` | QL | Chi tiết danh sách sinh viên hoàn thành |
| POST | `/api/admin/points/:eventId/approve\|reject` | QL | Duyệt (cộng điểm) / từ chối `{note}` |
| GET/POST | `/api/admin/accounts` | QL | Danh sách / cấp tài khoản BTC `{unit_id \| unit_name, unit_short, email, password, phone}` |
| PUT | `/api/admin/accounts/:id` | QL | `{email?, password?, is_active?}` |
