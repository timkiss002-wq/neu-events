# Thiết kế cơ sở dữ liệu – NEU Events

CSDL SQLite, file `data/neu-events.db`, lược đồ tại `db/schema.sql`. Thời gian lưu dạng chuỗi `YYYY-MM-DD HH:MM:SS` (giờ máy chủ) nên so sánh chuỗi = so sánh thời gian.

## 1. Sơ đồ quan hệ (ERD)

> Sơ đồ viết bằng Mermaid – xem trực tiếp trên GitHub/VS Code (extension *Markdown Preview Mermaid*) hoặc dán vào <https://mermaid.live>.

```mermaid
erDiagram
    UNITS ||--o{ USERS : "thuộc"
    UNITS ||--o{ EVENTS : "tổ chức"
    CATEGORIES ||--o{ EVENTS : "phân loại"
    USERS ||--o{ EVENTS : "tạo (created_by)"
    USERS ||--o{ EVENTS : "duyệt (reviewed_by)"
    EVENTS ||--o{ EVENT_AGENDA : "có chương trình"
    EVENTS ||--o{ EVENT_FILES : "đính kèm"
    EVENTS ||--o{ REGISTRATIONS : "được đăng ký"
    USERS ||--o{ REGISTRATIONS : "đăng ký"
    EVENTS ||--o{ ATTENDANCE_SESSIONS : "mở phiên"
    USERS ||--o{ ATTENDANCE_SESSIONS : "mở (opened_by)"
    EVENTS ||--o{ REVIEWS : "được đánh giá"
    USERS ||--o{ REVIEWS : "viết"
    USERS ||--o{ NOTIFICATIONS : "nhận"
    USERS ||--o{ AUDIT_LOGS : "thực hiện"
    USERS ||--o{ PASSWORD_RESETS : "yêu cầu"

    UNITS {
        int id PK
        text name UK
        text short_name
    }
    CATEGORIES {
        int id PK
        text name UK
        text color
    }
    USERS {
        int id PK
        text code UK "MSSV / mã cán bộ"
        text email UK
        text password_hash "bcrypt"
        text full_name
        text role "student|organizer|admin"
        int unit_id FK
        text class_name
        text position
        text phone
        int is_active
        text created_at
    }
    EVENTS {
        int id PK
        text code UK "NEU-AI-2026"
        text title
        text slogan
        text summary
        text description
        text benefits
        text preparation
        int category_id FK
        int unit_id FK
        int created_by FK
        text location
        text start_at
        text end_at
        text reg_deadline
        int capacity
        text fee
        int budget
        text contact_name
        text contact_phone
        text contact_email
        text cover_image
        text status "draft|pending|approved|rejected|cancelled"
        text submitted_at
        text reviewed_at
        int reviewed_by FK
        text review_note
        text review_checks "JSON"
        text cancel_reason
        text created_at
        text updated_at
    }
    EVENT_AGENDA {
        int id PK
        int event_id FK
        text time_label
        text title
        text description
        int sort_order
    }
    EVENT_FILES {
        int id PK
        int event_id FK
        text original_name
        text stored_name
        text mime
        int size
        int uploaded_by FK
        text uploaded_at
    }
    REGISTRATIONS {
        int id PK
        int event_id FK
        int user_id FK
        text code UK "NEU-AI-0123"
        text status "registered|cancelled"
        text registered_at
        text cancelled_at
        text attendance "pending|present|absent"
        text checked_in_at
        text check_method "code|qr|manual"
    }
    ATTENDANCE_SESSIONS {
        int id PK
        int event_id FK
        text code
        int opened_by FK
        text opened_at
        text expires_at
        text closed_at
    }
    REVIEWS {
        int id PK
        int event_id FK
        int user_id FK
        int rating "1-5"
        text comment
        text created_at
        text updated_at
    }
    NOTIFICATIONS {
        int id PK
        int user_id FK
        text type
        text title
        text body
        text link
        int is_read
        text created_at
    }
    AUDIT_LOGS {
        int id PK
        int actor_id FK
        text action
        text entity_type
        int entity_id
        text detail
        text reason
        text created_at
    }
    PASSWORD_RESETS {
        int id PK
        int user_id FK
        text code
        text expires_at
        text used_at
        text created_at
    }
```

## 2. Mô tả bảng

| Bảng | Ý nghĩa | Ràng buộc đáng chú ý |
|---|---|---|
| `units` | Khoa, viện, phòng ban, CLB | `name` duy nhất |
| `categories` | Loại sự kiện (Học thuật, Nghề nghiệp, Cộng đồng, Văn hóa) | `color` dùng cho biểu đồ |
| `users` | Tài khoản 3 vai trò | `code`, `email` duy nhất; `role` CHECK |
| `events` | Hồ sơ / sự kiện | `status` CHECK 5 giá trị |
| `event_agenda` | Các mốc chương trình | Xóa theo sự kiện (CASCADE) |
| `event_files` | File đính kèm, lưu ở `uploads/` | CASCADE |
| `registrations` | Lượt đăng ký + kết quả điểm danh | `UNIQUE(event_id, user_id)` – đăng ký lại dùng lại bản ghi |
| `attendance_sessions` | Phiên điểm danh (mã, thời gian hiệu lực) | Phiên mở: `closed_at IS NULL` |
| `reviews` | Đánh giá 1–5 sao | `UNIQUE(event_id, user_id)`; `rating` CHECK 1–5 |
| `notifications` | Thông báo trong hệ thống | Chỉ mục `(user_id, is_read)` |
| `audit_logs` | Nhật ký thao tác (duyệt, từ chối, hủy, sửa điểm danh…) | `reason` lưu lý do bắt buộc |
| `password_resets` | Mã đặt lại mật khẩu 6 số, hạn 15 phút | `used_at` đánh dấu đã dùng |

## 3. Vòng đời trạng thái

**Hồ sơ sự kiện (`events.status`)**

```mermaid
stateDiagram-v2
    [*] --> draft : BTC tạo
    draft --> pending : Gửi duyệt
    pending --> draft : Rút về nháp
    pending --> approved : QL phê duyệt
    pending --> rejected : QL từ chối (bắt buộc lý do)
    rejected --> pending : BTC bổ sung, gửi lại
    approved --> cancelled : BTC/QL hủy (bắt buộc lý do)
    draft --> [*] : Xóa
```

**Điểm danh (`registrations.attendance`)**

```mermaid
stateDiagram-v2
    [*] --> pending : Đăng ký
    pending --> present : SV nhập mã / quét QR, hoặc BTC xác nhận
    pending --> absent : Đóng phiên / sự kiện kết thúc
    present --> absent : BTC sửa thủ công (có lý do)
    absent --> present : BTC sửa thủ công (có lý do)
```

## 4. Các chỉ số báo cáo (truy vấn từ bảng)

| Chỉ số | Cách tính |
|---|---|
| Số sự kiện | `events.status = 'approved'` có `start_at` trong khoảng lọc |
| Lượt đăng ký | `registrations.status = 'registered'` của các sự kiện trên |
| Lượt tham dự | như trên và `attendance = 'present'` |
| Tỷ lệ tham dự | tham dự / đăng ký, chỉ tính sự kiện có `end_at < hiện tại` |
| Theo tuần | nhóm `registered_at` (đăng ký) và `checked_in_at` (tham dự) theo tuần bắt đầu thứ Hai |
| Đánh giá TB | `AVG(reviews.rating)` |

## Bổ sung

- `events.level` (`truong` | `khoa` | `clb`), `events.points` – cấp chương trình và điểm hoạt động.
- `registrations.checked_out_at`, `checkout_method`, `points_awarded` – check-out và điểm đã cộng.
- `attendance_sessions.kind` (`checkin` | `checkout`); `reviews.is_anonymous`.
- `point_submissions` (id, event_id UNIQUE, submitted_by, submitted_at, member_count, points, note, status `pending|approved|rejected`, reviewed_by, reviewed_at, review_note) – danh sách nhận điểm BTC gửi Đơn vị quản lý.

Cơ sở dữ liệu cũ được tự động bổ sung cột khi khởi động (`db/database.js → migrate`).
