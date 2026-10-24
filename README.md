# NEU Events – Hệ thống quản lý sự kiện

Website quản lý sự kiện cho Đại học Kinh tế Quốc dân: sinh viên khám phá – đăng ký – điểm danh – đánh giá; ban tổ chức tạo hồ sơ và quản lý điểm danh; đơn vị quản lý kiểm duyệt và xem báo cáo.

- **Back-end:** Node.js + Express (REST API), phiên đăng nhập bằng cookie (express-session)
- **CSDL:** SQLite – dùng module có sẵn `node:sqlite` của Node, **không cần cài server CSDL**
- **Front-end:** HTML/CSS/JS thuần (giữ nguyên bộ thiết kế gốc), gọi API bằng `fetch`

---

## 1. Cài đặt & chạy

**Yêu cầu:** Node.js **22.13 trở lên** (khuyến nghị Node 24 LTS) – tải tại <https://nodejs.org>. Kiểm tra: `node -v`.

```bash
cd neu-events
npm install        # cài thư viện (chỉ lần đầu)
npm start          # chạy máy chủ
```

Mở trình duyệt: **http://localhost:3000**

- Lần chạy đầu tiên hệ thống tự tạo file CSDL `data/neu-events.db` và dữ liệu mẫu.
- `npm run seed` – xóa và tạo lại dữ liệu mẫu (**nên chạy ngay trước buổi demo**: thời gian sự kiện mẫu được tính theo ngày chạy seed, nên luôn có sự kiện *đã kết thúc / đang diễn ra / sắp diễn ra*; sự kiện “Ứng dụng AI…” đang diễn ra trong ~3,5 giờ kể từ lúc seed và đã mở phiên điểm danh với mã **AI1210**).
- `npm run dev` – chạy và tự khởi động lại khi sửa code.
- Đổi cổng: `PORT=4000 npm start` (Windows PowerShell: `$env:PORT=4000; npm start`).

## 2. Tài khoản demo (mật khẩu chung: `123456`)

| Vai trò | Đăng nhập | Ghi chú |
|---|---|---|
| Sinh viên | `11240123` | Nguyễn Minh Anh – có đủ trạng thái: đã tham dự, vắng, đang diễn ra, sắp tới, bị hủy |
| Sinh viên | `11244035` | Nguyễn Thị Thu |
| Ban tổ chức | `cntt@neu.edu.vn` | LCĐ Khoa CNTT – sự kiện đang diễn ra, sắp tới, nháp; sự kiện “Python” đã kết thúc, chưa gửi danh sách điểm |
| Ban tổ chức | `dmst@neu.edu.vn` | Viện ĐMST – có hồ sơ chờ duyệt |
| Ban tổ chức | `clbkhoinghiep@neu.edu.vn` | CLB Khởi nghiệp – có hồ sơ bị từ chối |
| Đơn vị quản lý | `admin@neu.edu.vn` | Kiểm duyệt, duyệt điểm Đoàn, cấp tài khoản đơn vị, báo cáo |

Tài khoản Ban tổ chức là tài khoản của **đơn vị** (email bắt buộc đuôi `@neu.edu.vn`), do Đơn vị quản lý cấp. Sinh viên đăng nhập bằng MSSV hoặc email. Ở trang đăng nhập có mục “Tài khoản demo” để điền nhanh. Ngoài ra còn ~118 sinh viên ngẫu nhiên (MSSV từ `11240200`) để có số liệu thống kê.

## 3. Chức năng theo vai trò

**Sinh viên**
- Khám phá sự kiện: tìm kiếm, lọc theo trạng thái / loại / đơn vị.
- Xem chi tiết; **đăng ký** (giới hạn chỗ + hạn đăng ký, tạo mã đăng ký), **hủy** trước hạn, đăng ký lại.
- Trang *Đã đăng ký*: thống kê, banner sự kiện đang diễn ra, tab trạng thái, tìm kiếm, lọc học kỳ.
- **Check-in / check-out** bằng mã hoặc **quét QR**; chỉ check-out được khi BTC đã ghi nhận check-in. Có đủ hai lượt = *Hoàn thành*.
- **Đánh giá** 1–5 sao + nhận xét, có tùy chọn **ẩn danh**; sửa lại được.
- Xem **điểm hoạt động** được cộng; chọn học kỳ ở thanh trên cùng để xem lại các học kỳ/năm học trước.

**Ban tổ chức**
- Tạo / sửa hồ sơ (chương trình, thời gian, quy mô, kinh phí, người phụ trách, **ảnh bìa, file đính kèm**), lưu nháp, gửi duyệt, rút về nháp, gửi lại khi bị từ chối, xóa nháp, **hủy sự kiện** kèm lý do.
- Khai báo **cấp chương trình** (Trường 5 điểm / Khoa-Viện 3 điểm / Chi đoàn-CLB 2 điểm) và số điểm hoạt động khi tạo sự kiện.
- **Điểm danh:** danh sách đăng ký để check-in, mở phiên **check-in** và **check-out** (mã/QR), đổi mã, sửa thủ công bắt buộc lý do, đóng phiên; xuất Excel *Danh sách đăng ký* và *Danh sách hoàn thành*.
- **Gửi danh sách nhận điểm** (sinh viên hoàn thành) cho Đơn vị quản lý duyệt.
- Xem đánh giá, phản hồi của sinh viên; **báo cáo – thống kê và xuất Excel** cho sự kiện của đơn vị.

**Đơn vị quản lý**
- **Kiểm duyệt:** thống kê, danh sách hồ sơ, xem chi tiết + tải file, đánh dấu tiêu chí, phê duyệt hoặc từ chối (bắt buộc lý do), lịch sử hồ sơ.
- **Báo cáo – thống kê:** lọc khoảng thời gian / đơn vị / loại; 4 chỉ số, biểu đồ theo tuần (tháng khi > 10 tuần), biểu đồ cơ cấu, bảng hiệu quả; **xuất Excel** 4 trang tính.
- **Duyệt điểm Đoàn:** duyệt hoặc từ chối (kèm lý do) danh sách sinh viên hoàn thành do BTC gửi; khi duyệt, điểm được cộng theo cấp chương trình và gửi thông báo.
- **Tài khoản đơn vị:** cấp tài khoản Ban tổ chức (email @neu.edu.vn + mật khẩu) cho đơn vị mới đăng ký sử dụng; đổi email, đặt lại mật khẩu, khóa/mở khóa.
- Quản lý / xem toàn bộ sự kiện của các đơn vị.

**Chung:** thông báo trong hệ thống (chuông), hồ sơ cá nhân, đổi mật khẩu, quên mật khẩu (mã 6 số), lịch sử thao tác (audit log), hướng dẫn sử dụng, giao diện responsive cho điện thoại.

## 4. Quy tắc nghiệp vụ chính

- Trạng thái hồ sơ: `draft → pending → approved | rejected`; `approved → cancelled`. Chỉ sửa được khi *Nháp* hoặc *Bị từ chối*.
- Giai đoạn của sự kiện đã duyệt tính theo thời gian: *sắp diễn ra / đang diễn ra / đã kết thúc*.
- Đăng ký khi: sự kiện đã duyệt, chưa tới hạn đăng ký, còn chỗ. Hủy đăng ký trước hạn đăng ký và trước giờ bắt đầu.
- Phiên check-in mở từ 60 phút trước giờ bắt đầu đến khi kết thúc; phiên check-out mở từ giờ bắt đầu đến 120 phút sau khi kết thúc. Mã không phân biệt hoa thường.
- Check-out chỉ hợp lệ khi đăng ký đã được ghi nhận check-in. Check-in + check-out = *Hoàn thành*.
- Đóng phiên check-in hoặc sự kiện kết thúc → đăng ký *chưa check-in* chuyển *vắng mặt*. Sự kiện bị hủy không tính vắng mặt.
- Gửi danh sách nhận điểm khi sự kiện đã kết thúc và có sinh viên hoàn thành; danh sách bị từ chối có thể gửi lại. Đã cộng điểm thì không sửa điểm danh được nữa.
- Chỉ đăng ký *đã tham dự* mới được đánh giá; đánh giá ẩn danh không hiện tên với BTC.
- Tỷ lệ tham dự (báo cáo) = tham dự / đăng ký của các sự kiện **đã kết thúc**; không tính sự kiện đã hủy.

## 5. QR điểm danh bằng điện thoại

Khi mở trang bằng `localhost`, mã QR tự dùng **địa chỉ LAN** của máy (in ra khi chạy `npm start`, dạng `http://192.168.x.x:3000`). Điện thoại kết nối **cùng Wi-Fi** quét QR → mở trang điểm danh, đăng nhập tài khoản sinh viên → tự xác nhận. Nếu Windows Firewall hỏi, chọn *Allow* cho Node.js.

## 6. Cấu trúc thư mục

```
neu-events/
├── server.js              # Khởi tạo Express, gắn route, phục vụ giao diện
├── db/
│   ├── schema.sql         # Lược đồ CSDL (11 bảng)
│   ├── database.js        # Kết nối node:sqlite + tiện ích truy vấn/transaction
│   └── seed.js            # Dữ liệu mẫu (npm run seed)
├── middleware/auth.js     # Nạp người dùng từ session, kiểm tra vai trò
├── lib/
│   ├── util.js            # Thời gian, học kỳ, thông báo, audit log, lỗi HTTP
│   └── events.js          # Truy vấn sự kiện, phân quyền, chốt điểm danh
├── routes/                # REST API: auth, events, me, attendance, moderation, reviews, reports
├── public/                # Giao diện
│   ├── *.html             # 14 trang (6 trang theo thiết kế gốc + 8 trang bổ sung)
│   ├── css/app.css        # Layout & thành phần dùng chung (trích từ thiết kế)
│   ├── css/ui.css         # Hộp thoại, toast, thông báo, nhãn trạng thái…
│   ├── js/app.js          # Gọi API, định dạng, dựng sidebar/header theo vai trò
│   └── js/pages/*.js      # Logic từng trang
├── uploads/               # Ảnh bìa & file đính kèm (tạo khi chạy)
├── data/                  # File CSDL SQLite (tạo khi chạy)
└── docs/                  # DATABASE.md (ERD), API.md (danh sách endpoint)
```

| Trang | File | Vai trò | Nguồn |
|---|---|---|---|
| Đăng nhập | `login.html` | Tất cả | Thiết kế gốc |
| Chi tiết sự kiện | `event-detail.html` | Tất cả | Thiết kế gốc |
| Đã đăng ký | `registered.html` | Sinh viên | Thiết kế gốc |
| Điểm danh | `attendance.html` | SV / BTC / QL (giao diện theo vai trò) | Thiết kế gốc |
| Kiểm duyệt | `moderation.html` | Quản lý | Thiết kế gốc |
| Báo cáo – thống kê | `reports.html` | Quản lý | Thiết kế gốc |
| Khám phá sự kiện | `events.html` | Tất cả | Bổ sung |
| Đánh giá | `reviews.html` | SV (đánh giá) / BTC, QL (xem) | Bổ sung |
| Quản lý sự kiện | `manage-events.html` | BTC / QL | Bổ sung |
| Tạo / sửa hồ sơ | `event-form.html` | BTC / QL | Bổ sung |
| Hồ sơ cá nhân | `profile.html` | Tất cả | Bổ sung |
| Hướng dẫn sử dụng | `guide.html` | Công khai | Bổ sung |
| Quên mật khẩu | `forgot-password.html` | Công khai | Bổ sung |

## 7. Kịch bản demo gợi ý (~10 phút)

1. `npm run seed` → `npm start`.
2. **cntt@neu.edu.vn** → *Quản lý sự kiện* → *Tạo sự kiện mới* (chọn cấp chương trình) → *Lưu & gửi duyệt*.
3. **admin@neu.edu.vn** (cửa sổ ẩn danh) → *Kiểm duyệt* → thử *Từ chối* (bắt buộc lý do) → BTC sửa, gửi lại → *Phê duyệt & xuất bản*.
4. **11240123** → *Sự kiện* → đăng ký sự kiện vừa duyệt; xem *Đã đăng ký* (đổi học kỳ ở thanh trên cùng).
5. **cntt@neu.edu.vn** → *Điểm danh* → sự kiện “Ứng dụng AI…” → *Mở check-in*, trình chiếu QR.
6. **11240123** → *Điểm danh* → nhập mã check-in. BTC *Chuyển sang check-out* → sinh viên nhập mã check-out → *Hoàn thành*.
7. **cntt@neu.edu.vn** → sự kiện “Seminar Python” → *Xuất danh sách hoàn thành* → *Gửi danh sách nhận điểm*.
8. **admin@neu.edu.vn** → *Duyệt điểm Đoàn* → duyệt; *Tài khoản đơn vị* → *Cấp tài khoản mới*.
9. **11240123** → *Đánh giá* (thử ẩn danh); **cntt@neu.edu.vn** → *Đánh giá*, *Báo cáo – thống kê* → *Xuất báo cáo*.

## 8. Giới hạn (phạm vi môn học)

- Chạy trên localhost; phiên đăng nhập lưu trong bộ nhớ – khởi động lại máy chủ cần đăng nhập lại.
- Không có máy chủ email: mã quên mật khẩu hiển thị trên màn hình và in ở console (chế độ demo).
- Không có trang tự đăng ký: tài khoản sinh viên có sẵn trong dữ liệu mẫu; tài khoản Ban tổ chức do Đơn vị quản lý cấp.
