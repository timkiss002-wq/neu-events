// Tạo dữ liệu mẫu. Thời gian sự kiện được tính tương đối theo ngày chạy seed
// để lúc demo luôn có sự kiện đã kết thúc / đang diễn ra / sắp diễn ra.
//   npm run seed      -> xóa CSDL cũ và tạo lại dữ liệu mẫu
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { open, close, q, DB_PATH } = require('./database');
const { fmt } = require('../lib/util');
const settings = require('../lib/settings');

// PRNG có hạt giống để dữ liệu ổn định giữa các lần seed
let _s = 20261019;
const rnd = () => { _s = (_s * 1664525 + 1013904223) % 4294967296; return _s / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function at(dayOffset, hh, mm = 0) {
  const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hh, mm, 0, 0); return fmt(d);
}
function shift(s, minutes) { const d = new Date(s.replace(' ', 'T')); d.setMinutes(d.getMinutes() + minutes); return fmt(d); }

function seed() {
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  close();
  open();
  const NOW = fmt(new Date());
  const hash = bcrypt.hashSync('123456', 8);

  q.tx(() => {
    // ---------- Đơn vị ----------
    const units = [
      ['Phòng Công tác chính trị & Quản lý sinh viên', 'Phòng CTCT & QLSV'],
      ['Trung tâm Tư vấn hướng nghiệp & Việc làm', 'Trung tâm TVHN & Việc làm'],
      ['Viện Đổi mới sáng tạo', 'Viện ĐMST'],
      ['Liên chi đoàn Khoa Kinh tế học', 'LCĐ Khoa Kinh tế học'],
      ['Liên chi đoàn Khoa Công nghệ thông tin', 'LCĐ Khoa CNTT'],
      ['Đoàn Thanh niên NEU', 'Đoàn Thanh niên'],
      ['CLB Khởi nghiệp NEU', 'CLB Khởi nghiệp'],
      ['Liên chi đoàn Viện Thương mại & Kinh tế quốc tế', 'LCĐ Viện TM & KTQT'],
    ];
    const U = {};
    units.forEach(([n, s], i) => { U[i + 1] = q.run('INSERT INTO units (name, short_name) VALUES (?,?)', n, s).id; });

    // ---------- Loại sự kiện ----------
    const C = {};
    [['Học thuật', '#1451a8'], ['Nghề nghiệp', '#0f2a5c'], ['Cộng đồng', '#bcd0ee'], ['Văn hóa', '#c9353f']]
      .forEach(([n, c]) => { C[n] = q.run('INSERT INTO categories (name, color) VALUES (?,?)', n, c).id; });

    // ---------- Người dùng ----------
    const addUser = (code, email, name, role, unit, extra = {}) =>
      q.run(`INSERT INTO users (code,email,password_hash,full_name,role,unit_id,class_name,position,phone,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)`, code, email, hash, name, role, unit,
        extra.class_name || null, extra.position || null, extra.phone || null, NOW).id;

    const admin = addUser('CB001', 'admin@neu.edu.vn', 'Trần Hoài Thu', 'admin', U[1], { position: 'Chuyên viên kiểm duyệt', phone: '024 3628 0280' });
    addUser('CB002', 'quanly@neu.edu.vn', 'Nguyễn Văn Hùng', 'admin', U[1], { position: 'Trưởng phòng', phone: '024 3628 0281' });

    // Quản trị hệ thống: quản lý người dùng – phân quyền, cấu hình, an toàn an ninh dữ liệu và hạ tầng
    const sysadmin = addUser('QT001', 'quantri@neu.edu.vn', 'Phạm Quốc Việt', 'sysadmin', null, { position: 'Quản trị viên hệ thống', phone: '024 3628 0299' });

    // Tài khoản Ban tổ chức được cấp cho từng đơn vị (tên tài khoản = tên đơn vị, email @neu.edu.vn)
    const unitName = (i) => units[i - 1][0];
    const org = {
      vieclam: addUser('CB102', 'vieclam@neu.edu.vn', unitName(2), 'organizer', U[2], { phone: '091 234 5678' }),
      dmst: addUser('CB101', 'dmst@neu.edu.vn', unitName(3), 'organizer', U[3], { phone: '098 234 5678' }),
      kth: addUser('CB105', 'kinhtehoc@neu.edu.vn', unitName(4), 'organizer', U[4], { phone: '090 111 2233' }),
      cntt: addUser('CB103', 'cntt@neu.edu.vn', unitName(5), 'organizer', U[5], { phone: '097 345 6789' }),
      doan: addUser('CB104', 'doanthanhnien@neu.edu.vn', unitName(6), 'organizer', U[6], { phone: '093 456 7890' }),
      clb: addUser('CB106', 'clbkhoinghiep@neu.edu.vn', unitName(7), 'organizer', U[7], { phone: '094 567 8901' }),
      tm: addUser('CB107', 'thuongmai@neu.edu.vn', unitName(8), 'organizer', U[8], { phone: '096 678 9012' }),
    };
    // Cấp chương trình & điểm hoạt động theo đơn vị tổ chức
    const LEVEL_BY_UNIT = { [U[1]]: 'truong', [U[2]]: 'truong', [U[6]]: 'truong', [U[7]]: 'clb' };
    const POINTS = { truong: 5, khoa: 3, clb: 2 };

    const ho = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
    const dem = ['Minh', 'Thị', 'Văn', 'Thu', 'Hoài', 'Quốc', 'Ngọc', 'Thanh', 'Gia', 'Bảo', 'Khánh', 'Phương'];
    const ten = ['Anh', 'Thu', 'Hà', 'Linh', 'Nam', 'Huy', 'Trang', 'Long', 'Mai', 'Phúc', 'Quân', 'Vy', 'Hương', 'Đức', 'Tâm', 'Ngân', 'Khoa', 'Yến'];
    const lop = ['Kinh tế học 66A', 'Logistics 66B', 'Khoa học dữ liệu 66', 'Marketing 66C', 'Tài chính 66A', 'Kế toán 66D', 'Quản trị kinh doanh 66B'];

    const mainStudent = addUser('11240123', '11240123@st.neu.edu.vn', 'Thân Mậu Dũng', 'student', null, { class_name: 'Khoa học dữ liệu 66', phone: '0912 000 123' });
    const student2 = addUser('11244035', '11244035@st.neu.edu.vn', 'Lê Văn Dũng', 'student', null, { class_name: 'Logistics 66B', phone: '0912 000 435' });
    const students = [mainStudent, student2];
    for (let i = 0; i < 118; i++) {
      const code = String(11240200 + i * 7);
      const name = `${pick(ho)} ${pick(dem)} ${pick(ten)}`.replace(/Minh Anh$/, 'Minh Đức');
      students.push(addUser(code, `${code}@st.neu.edu.vn`, name, 'student', null, { class_name: pick(lop) }));
    }

    // ---------- Sự kiện ----------
    const evs = {};
    const addEvent = (key, e) => {
      const created = e.created_at || shift(e.start_at, -60 * 24 * 20);
      const id = q.run(`INSERT INTO events (code,title,slogan,summary,description,benefits,preparation,category_id,unit_id,created_by,
          location,start_at,end_at,reg_deadline,capacity,fee,budget,contact_name,contact_phone,contact_email,cover_image,status,
          submitted_at,reviewed_at,reviewed_by,review_note,review_checks,cancel_reason,level,points,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        e.code, e.title, e.slogan || '', e.summary || '', e.description || '', e.benefits || '', e.preparation || '',
        C[e.cat], e.unit, e.by, e.location, e.start_at, e.end_at, e.reg_deadline || shift(e.start_at, -60 * 24),
        e.capacity, e.fee || 'Miễn phí', e.budget || 0, e.contact_name, e.contact_phone, e.contact_email || '', null,
        e.status, e.submitted_at || (e.status !== 'draft' ? shift(created, 60 * 24) : null),
        ['approved', 'rejected', 'cancelled'].includes(e.status) ? (e.reviewed_at || shift(created, 60 * 48)) : null,
        ['approved', 'rejected', 'cancelled'].includes(e.status) ? admin : null,
        e.review_note || null,
        ['approved', 'cancelled'].includes(e.status) ? JSON.stringify(['Nội dung phù hợp', 'Đủ hồ sơ', 'Quy mô hợp lý']) : null,
        e.cancel_reason || null, LEVEL_BY_UNIT[e.unit] || 'khoa', POINTS[LEVEL_BY_UNIT[e.unit] || 'khoa'], created, created).id;
      (e.agenda || []).forEach((a, i) => q.run('INSERT INTO event_agenda (event_id,time_label,title,description,sort_order) VALUES (?,?,?,?,?)', id, a[0], a[1], a[2] || '', i));
      evs[key] = { id, ...e, reg_deadline: e.reg_deadline || shift(e.start_at, -60 * 24) };
      return id;
    };

    const contact = (k) => ({
      cntt: ['Đỗ Minh Khôi', '097 345 6789', 'cntt@neu.edu.vn'], vieclam: ['Phạm Thanh Hà', '091 234 5678', 'vieclam@neu.edu.vn'],
      dmst: ['Lê Quốc Bảo', '098 234 5678', 'dmst@neu.edu.vn'], kth: ['Hoàng Đức Long', '090 111 2233', 'kinhtehoc@neu.edu.vn'],
      doan: ['Vũ Lan Anh', '093 456 7890', 'doanthanhnien@neu.edu.vn'], clb: ['Ngô Bảo Trâm', '094 567 8901', 'clbkhoinghiep@neu.edu.vn'],
      tm: ['Bùi Văn Nam', '096 678 9012', 'thuongmai@neu.edu.vn'],
    })[k];
    const C_ = (k) => { const [n, p, m] = contact(k); return { contact_name: n, contact_phone: p, contact_email: m }; };

    // --- Đã kết thúc ---
    addEvent('xanh', { code: 'NEU-GREEN-2026', title: 'NEU xanh: Từ ý tưởng đến hành động', slogan: 'Sống xanh • Hành động nhỏ • Lan tỏa lớn', cat: 'Cộng đồng', unit: U[6], by: org.doan, ...C_('doan'),
      summary: 'Chuỗi hoạt động bảo vệ môi trường: phân loại rác, trồng cây và triển lãm sáng kiến xanh của sinh viên.',
      description: 'Sự kiện khởi động chiến dịch "NEU xanh" năm học mới, nơi sinh viên cùng nhau biến những ý tưởng sống xanh thành hành động cụ thể trong khuôn viên trường.\nNgười tham gia được hướng dẫn phân loại rác tại nguồn, tham gia trồng cây và bình chọn sáng kiến xanh xuất sắc.',
      benefits: 'Cộng 3 điểm rèn luyện\nNhận giấy chứng nhận tình nguyện\nQuà tặng túi vải thân thiện môi trường',
      preparation: 'Mang theo bình nước cá nhân, hạn chế đồ nhựa dùng một lần.\nMặc trang phục thoải mái, giày thể thao.',
      location: 'Sân trung tâm, Đại học NEU', start_at: at(-14, 7, 30), end_at: at(-14, 11, 0), capacity: 150, status: 'approved',
      agenda: [['07:30 – 08:00', 'Check-in & nhận dụng cụ'], ['08:00 – 09:30', 'Workshop phân loại rác tại nguồn', 'Hướng dẫn bởi Green Hub'], ['09:30 – 10:30', 'Trồng cây khuôn viên'], ['10:30 – 11:00', 'Bình chọn sáng kiến xanh & bế mạc']] });

    addEvent('logi', { code: 'NEU-LOGI-2026', title: 'Hội thảo Logistics & Chuỗi cung ứng số', slogan: 'Chuyển đổi số • Tối ưu vận hành • Kết nối toàn cầu', cat: 'Học thuật', unit: U[8], by: org.tm, ...C_('tm'),
      summary: 'Chuyên gia doanh nghiệp chia sẻ về ứng dụng công nghệ trong quản trị chuỗi cung ứng và logistics hiện đại.',
      description: 'Hội thảo quy tụ chuyên gia từ các doanh nghiệp logistics hàng đầu, bàn về xu hướng số hóa kho bãi, vận tải thông minh và phân tích dữ liệu chuỗi cung ứng.\nSinh viên có cơ hội đặt câu hỏi trực tiếp và tìm hiểu cơ hội thực tập.',
      benefits: 'Cộng 2 điểm rèn luyện\nTài liệu hội thảo bản điện tử\nCơ hội thực tập tại doanh nghiệp đối tác',
      preparation: 'Đọc trước tài liệu giới thiệu được gửi qua email.\nChuẩn bị câu hỏi cho phần thảo luận.',
      location: 'Hội trường A2, Đại học NEU', start_at: at(-21, 8, 0), end_at: at(-21, 11, 30), capacity: 200, status: 'approved',
      agenda: [['08:00 – 08:15', 'Khai mạc'], ['08:15 – 09:30', 'Xu hướng chuỗi cung ứng số tại Việt Nam'], ['09:45 – 10:45', 'Tọa đàm: Dữ liệu trong logistics'], ['10:45 – 11:30', 'Hỏi đáp & kết nối doanh nghiệp']] });

    addEvent('cv', { code: 'NEU-CV-2026', title: 'Workshop Kỹ năng viết CV & phỏng vấn', slogan: 'Tự tin ứng tuyển • Ghi điểm nhà tuyển dụng', cat: 'Nghề nghiệp', unit: U[2], by: org.vieclam, ...C_('vieclam'),
      summary: 'Hướng dẫn viết CV ấn tượng và luyện phỏng vấn thử cùng chuyên viên tuyển dụng.',
      description: 'Workshop thực hành giúp sinh viên hoàn thiện CV theo chuẩn nhà tuyển dụng, đồng thời luyện tập trả lời phỏng vấn qua các tình huống thực tế.',
      benefits: 'Nhận xét CV trực tiếp\nCộng 2 điểm rèn luyện',
      preparation: 'Mang theo bản CV hiện tại (bản in hoặc trên laptop).',
      location: 'Phòng 301, nhà A1', start_at: at(-10, 14, 0), end_at: at(-10, 16, 30), capacity: 80, status: 'approved',
      agenda: [['14:00 – 14:45', 'Cấu trúc một CV hiệu quả'], ['14:45 – 15:30', 'Sửa CV theo nhóm'], ['15:30 – 16:30', 'Phỏng vấn thử 1:1']] });

    addEvent('tansv', { code: 'NEU-WELCOME-2026', title: 'Đêm nhạc Chào tân sinh viên K68', slogan: 'Chào K68 • Thanh xuân rực rỡ', cat: 'Văn hóa', unit: U[6], by: org.doan, ...C_('doan'),
      summary: 'Đêm nhạc chào đón tân sinh viên với các tiết mục từ CLB nghệ thuật và ca sĩ khách mời.',
      description: 'Chương trình nghệ thuật thường niên chào đón tân sinh viên khóa 68, kết nối các thế hệ sinh viên NEU.',
      benefits: 'Cộng 2 điểm rèn luyện\nQuà lưu niệm K68',
      preparation: 'Mang thẻ sinh viên để vào cổng.',
      location: 'Sân vận động NEU', start_at: at(-30, 19, 0), end_at: at(-30, 22, 0), capacity: 300, status: 'approved',
      agenda: [['19:00 – 19:30', 'Đón khách'], ['19:30 – 21:30', 'Biểu diễn nghệ thuật'], ['21:30 – 22:00', 'Bốc thăm may mắn']] });

    addEvent('python', { code: 'NEU-PY-2026', title: 'Seminar Phân tích dữ liệu với Python', slogan: 'Dữ liệu • Mô hình • Quyết định', cat: 'Học thuật', unit: U[5], by: org.cntt, ...C_('cntt'),
      summary: 'Thực hành pandas, trực quan hóa và mô hình hồi quy cơ bản trên bộ dữ liệu kinh tế thực tế.',
      description: 'Seminar dành cho sinh viên muốn bắt đầu với phân tích dữ liệu: làm sạch dữ liệu với pandas, trực quan hóa với matplotlib và xây dựng mô hình hồi quy đơn giản.',
      benefits: 'Notebook mẫu và bộ dữ liệu thực hành\nCộng 2 điểm rèn luyện',
      preparation: 'Cài đặt sẵn Anaconda hoặc dùng Google Colab.\nMang theo laptop đã sạc đầy.',
      location: 'Phòng máy B305, nhà A2', start_at: at(-7, 14, 0), end_at: at(-7, 17, 0), capacity: 60, status: 'approved',
      agenda: [['14:00 – 14:30', 'Giới thiệu hệ sinh thái Python'], ['14:30 – 15:30', 'Làm sạch dữ liệu với pandas'], ['15:45 – 16:30', 'Trực quan hóa dữ liệu'], ['16:30 – 17:00', 'Mô hình hồi quy & hỏi đáp']] });

    addEvent('fintech', { code: 'NEU-FIN-2026', title: 'Tọa đàm Fintech và tương lai ngân hàng số', slogan: 'Công nghệ tài chính • Cơ hội mới', cat: 'Học thuật', unit: U[4], by: org.kth, ...C_('kth'),
      summary: 'Các chuyên gia ngân hàng và startup fintech thảo luận về thanh toán số và tài chính toàn diện.',
      description: 'Tọa đàm mở về sự phát triển của fintech tại Việt Nam, tác động tới ngành ngân hàng và kỹ năng sinh viên kinh tế cần chuẩn bị.',
      benefits: 'Cộng 2 điểm rèn luyện',
      preparation: 'Không yêu cầu chuẩn bị đặc biệt.',
      location: 'Hội trường C, nhà A1', start_at: at(-35, 8, 30), end_at: at(-35, 11, 30), capacity: 150, status: 'approved',
      agenda: [['08:30 – 09:00', 'Khai mạc'], ['09:00 – 10:30', 'Phiên thảo luận chính'], ['10:30 – 11:30', 'Hỏi đáp']] });

    addEvent('hienmau', { code: 'NEU-BLOOD-2026', title: 'Ngày hội Hiến máu nhân đạo', slogan: 'Một giọt máu cho đi • Một cuộc đời ở lại', cat: 'Cộng đồng', unit: U[6], by: org.doan, ...C_('doan'),
      summary: 'Ngày hội hiến máu tình nguyện phối hợp cùng Viện Huyết học – Truyền máu Trung ương.',
      description: 'Hoạt động thường niên của Đoàn Thanh niên NEU, kêu gọi sinh viên và cán bộ tham gia hiến máu cứu người.',
      benefits: 'Giấy chứng nhận hiến máu\nCộng 5 điểm rèn luyện',
      preparation: 'Ăn sáng nhẹ, không uống rượu bia trước 24 giờ.\nMang CCCD hoặc thẻ sinh viên.',
      location: 'Nhà thi đấu NEU', start_at: at(-25, 7, 30), end_at: at(-25, 12, 0), capacity: 250, status: 'approved',
      agenda: [['07:30 – 08:00', 'Đăng ký & khám sàng lọc'], ['08:00 – 11:30', 'Hiến máu'], ['11:30 – 12:00', 'Tổng kết']] });

    // --- Đang diễn ra ---
    const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() - 1);
    const aiStart = fmt(s); const aiEnd = shift(aiStart, 210);
    const hm = (x) => x.slice(11, 16);
    addEvent('ai', { code: 'NEU-AI-2026', title: 'Ứng dụng AI trong học tập & nghiên cứu', slogan: 'Học thông minh • Nghiên cứu hiệu quả • Dùng AI có trách nhiệm', cat: 'Học thuật', unit: U[5], by: org.cntt, ...C_('cntt'),
      summary: 'Hướng dẫn sử dụng công cụ AI tạo sinh để tra cứu tài liệu, viết học thuật và phân tích dữ liệu một cách có trách nhiệm.',
      description: 'Buổi chia sẻ giúp sinh viên khai thác các công cụ AI trong học tập: tìm và tóm tắt tài liệu, hỗ trợ lập trình phân tích dữ liệu, kiểm tra lập luận.\nPhần cuối bàn về liêm chính học thuật và cách trích dẫn khi sử dụng AI.',
      benefits: 'Cộng 2 điểm rèn luyện\nBộ prompt mẫu cho nghiên cứu\nGiấy chứng nhận tham dự',
      preparation: 'Mang theo laptop hoặc điện thoại có kết nối Internet.\nĐăng nhập sẵn tài khoản email NEU.',
      location: 'Phòng B101, nhà A2', start_at: aiStart, end_at: aiEnd, reg_deadline: shift(aiStart, -60 * 12), capacity: 180, status: 'approved',
      agenda: [[`${hm(aiStart)} – ${hm(shift(aiStart, 30))}`, 'Check-in & khai mạc'], [`${hm(shift(aiStart, 30))} – ${hm(shift(aiStart, 100))}`, 'AI hỗ trợ tra cứu & tổng quan tài liệu'], [`${hm(shift(aiStart, 110))} – ${hm(shift(aiStart, 170))}`, 'Thực hành: phân tích dữ liệu cùng AI'], [`${hm(shift(aiStart, 170))} – ${hm(aiEnd)}`, 'Liêm chính học thuật & hỏi đáp']] });

    // --- Sắp diễn ra ---
    addEvent('jobfair', { code: 'NEU-JOB-2026', title: 'Ngày hội việc làm NEU 2026', slogan: 'Kết nối doanh nghiệp • Khám phá cơ hội • Vững bước tương lai', cat: 'Nghề nghiệp', unit: U[2], by: org.vieclam, ...C_('vieclam'),
      summary: 'Cơ hội nghề nghiệp dành cho sinh viên và cựu sinh viên NEU với hơn 60 doanh nghiệp tham gia.',
      description: 'Ngày hội việc làm lớn nhất năm của NEU với hơn 60 gian hàng doanh nghiệp thuộc các lĩnh vực tài chính, logistics, công nghệ và FMCG.\nSinh viên có thể nộp hồ sơ trực tiếp, tham gia phỏng vấn nhanh và các workshop định hướng nghề nghiệp.',
      benefits: '60+ doanh nghiệp tuyển dụng\n1.500+ vị trí thực tập và việc làm\nPhỏng vấn nhanh tại chỗ',
      preparation: 'Chuẩn bị 5–10 bản CV in sẵn.\nTrang phục lịch sự.\nTìm hiểu trước danh sách doanh nghiệp tham gia.',
      location: 'Sân trung tâm & Hội trường A2, Đại học NEU', start_at: at(5, 8, 0), end_at: at(5, 17, 0), reg_deadline: at(4, 23, 59), capacity: 500, status: 'approved', budget: 120000000,
      agenda: [['08:00 – 08:30', 'Khai mạc ngày hội', 'Phát biểu của lãnh đạo nhà trường'], ['08:30 – 11:30', 'Tham quan gian hàng & nộp hồ sơ'], ['13:30 – 15:30', 'Workshop: Định hướng nghề nghiệp 2027'], ['15:30 – 17:00', 'Phỏng vấn nhanh & bế mạc']] });

    addEvent('powerbi', { code: 'NEU-PBI-2026', title: 'Workshop Power BI cho phân tích kinh doanh', slogan: 'Từ dữ liệu thô đến dashboard', cat: 'Học thuật', unit: U[5], by: org.cntt, ...C_('cntt'),
      summary: 'Xây dựng dashboard kinh doanh hoàn chỉnh với Power BI: mô hình dữ liệu, DAX cơ bản và trực quan hóa.',
      description: 'Workshop thực hành theo dự án: nhập dữ liệu bán hàng, xây dựng mô hình quan hệ, viết các phép đo DAX cơ bản và thiết kế dashboard trình bày cho quản lý.',
      benefits: 'File dự án mẫu\nGiấy chứng nhận hoàn thành\nCộng 2 điểm rèn luyện',
      preparation: 'Cài Power BI Desktop (Windows) trước buổi học.\nMang laptop.',
      location: 'Phòng máy B305, nhà A2', start_at: at(8, 13, 30), end_at: at(8, 17, 0), capacity: 40, status: 'approved',
      agenda: [['13:30 – 14:15', 'Nhập & làm sạch dữ liệu (Power Query)'], ['14:15 – 15:15', 'Mô hình dữ liệu & DAX'], ['15:30 – 16:30', 'Thiết kế dashboard'], ['16:30 – 17:00', 'Trình bày & nhận xét']] });

    addEvent('football', { code: 'NEU-CUP-2026', title: 'Giải bóng đá sinh viên NEU Cup', slogan: 'Tinh thần thể thao • Đoàn kết • Fair-play', cat: 'Cộng đồng', unit: U[6], by: org.doan, ...C_('doan'),
      summary: 'Giải bóng đá 7 người giữa các khoa, viện; mở đăng ký cổ động viên.',
      description: 'Giải đấu thường niên giữa các đội bóng khoa, viện. Sinh viên đăng ký tham gia với tư cách cổ động viên để nhận quà và cộng điểm rèn luyện.',
      benefits: 'Áo cổ động miễn phí cho 100 người đầu tiên\nCộng 1 điểm rèn luyện',
      preparation: 'Mang theo nước uống, mũ nón.',
      location: 'Sân bóng NEU', start_at: at(12, 15, 0), end_at: at(12, 18, 0), capacity: 300, status: 'approved',
      agenda: [['15:00 – 15:15', 'Khai mạc'], ['15:15 – 17:30', 'Các trận bán kết & chung kết'], ['17:30 – 18:00', 'Trao giải']] });

    addEvent('asean', { code: 'NEU-ASEAN-2026', title: 'Lễ hội văn hóa các nước ASEAN', slogan: 'Một cộng đồng • Nhiều bản sắc', cat: 'Văn hóa', unit: U[8], by: org.tm, ...C_('tm'),
      summary: 'Gian hàng ẩm thực, trang phục truyền thống và biểu diễn văn nghệ của sinh viên quốc tế.',
      description: 'Lễ hội giới thiệu văn hóa 10 quốc gia ASEAN qua ẩm thực, trang phục, trò chơi dân gian và các tiết mục biểu diễn.',
      benefits: 'Phiếu ẩm thực miễn phí\nCộng 1 điểm rèn luyện',
      preparation: 'Không yêu cầu chuẩn bị.',
      location: 'Sảnh nhà A1', start_at: at(15, 9, 0), end_at: at(15, 16, 0), reg_deadline: at(-1, 23, 59), capacity: 200, status: 'approved',
      agenda: [['09:00 – 09:30', 'Khai mạc'], ['09:30 – 15:00', 'Tham quan gian hàng'], ['15:00 – 16:00', 'Biểu diễn văn nghệ']] });

    addEvent('olympic', { code: 'NEU-OLP-2026', title: 'Olympic Kinh tế lượng & Ứng dụng', slogan: 'Tư duy định lượng • Bản lĩnh học thuật', cat: 'Học thuật', unit: U[4], by: org.kth, ...C_('kth'),
      summary: 'Cuộc thi học thuật về kinh tế lượng ứng dụng dành cho sinh viên năm 2–4.',
      description: 'Vòng loại thi viết 90 phút, vòng chung kết giải quyết tình huống phân tích dữ liệu thực tế.',
      benefits: 'Tổng giải thưởng 20.000.000 đồng\nƯu tiên xét học bổng nghiên cứu',
      preparation: 'Ôn tập hồi quy tuyến tính, kiểm định giả thuyết.\nMang máy tính cầm tay.',
      location: 'Giảng đường D, nhà A2', start_at: at(20, 8, 0), end_at: at(20, 11, 30), capacity: 120, status: 'approved',
      agenda: [['08:00 – 08:15', 'Phổ biến quy chế'], ['08:15 – 09:45', 'Thi viết vòng loại'], ['10:00 – 11:30', 'Giải đề & giao lưu']] });

    // --- Chờ duyệt / từ chối / nháp / đã hủy ---
    addEvent('startup', { code: 'NEU-START-2026', title: 'Cuộc thi Ý tưởng khởi nghiệp NEU 2026', slogan: 'Ý tưởng lớn bắt đầu từ giảng đường', cat: 'Học thuật', unit: U[3], by: org.dmst, ...C_('dmst'),
      summary: 'Cuộc thi tìm kiếm ý tưởng khởi nghiệp sáng tạo của sinh viên, đồng hành bởi các quỹ đầu tư.',
      description: 'Cuộc thi gồm 3 vòng: nộp hồ sơ ý tưởng, bán kết pitching và chung kết trước hội đồng nhà đầu tư. Đội thắng cuộc nhận gói ươm tạo 6 tháng tại Viện Đổi mới sáng tạo.\nLịch trình tóm tắt: nhận hồ sơ đến hết tháng, bán kết sau 2 tuần, chung kết cuối tháng sau.',
      benefits: 'Gói ươm tạo 6 tháng\nTổng giải thưởng 50.000.000 đồng',
      preparation: 'Đội thi 2–5 sinh viên.\nChuẩn bị bản mô tả ý tưởng tối đa 5 trang.',
      location: 'Hội trường A2, Đại học NEU', start_at: at(11, 8, 0), end_at: at(11, 17, 0), capacity: 250, status: 'pending', budget: 10000000,
      created_at: at(-3, 9, 0), submitted_at: at(-1, 9, 20),
      agenda: [['08:00 – 08:30', 'Khai mạc'], ['08:30 – 12:00', 'Bán kết pitching'], ['13:30 – 16:30', 'Chung kết'], ['16:30 – 17:00', 'Trao giải']] });

    addEvent('kts', { code: 'NEU-DIGI-2026', title: 'Tọa đàm Kinh tế số & cơ hội nghề nghiệp', slogan: 'Kinh tế số • Kỹ năng số • Việc làm số', cat: 'Nghề nghiệp', unit: U[4], by: org.kth, ...C_('kth'),
      summary: 'Tọa đàm về nhu cầu nhân lực trong nền kinh tế số và lộ trình phát triển kỹ năng cho sinh viên kinh tế.',
      description: 'Khách mời đến từ các doanh nghiệp thương mại điện tử và ngân hàng số chia sẻ về vị trí việc làm mới, kỹ năng cần có và kinh nghiệm tuyển dụng.',
      benefits: 'Cộng 2 điểm rèn luyện',
      preparation: 'Không yêu cầu chuẩn bị.',
      location: 'Hội trường C, nhà A1', start_at: at(14, 14, 0), end_at: at(14, 16, 30), capacity: 150, status: 'pending', budget: 5000000,
      created_at: at(-4, 10, 0), submitted_at: at(-2, 15, 5),
      agenda: [['14:00 – 14:15', 'Khai mạc'], ['14:15 – 15:45', 'Tọa đàm'], ['15:45 – 16:30', 'Hỏi đáp']] });

    addEvent('doanhnhan', { code: 'NEU-YBIZ-2026', title: 'Giao lưu doanh nhân trẻ', slogan: 'Học từ người đi trước', cat: 'Nghề nghiệp', unit: U[7], by: org.clb, ...C_('clb'),
      summary: 'Buổi giao lưu với các doanh nhân trẻ là cựu sinh viên NEU.',
      description: 'Giao lưu, chia sẻ kinh nghiệm khởi nghiệp.',
      location: 'Phòng 201, nhà A1', start_at: at(9, 18, 0), end_at: at(9, 20, 30), capacity: 600, status: 'rejected', budget: 45000000,
      created_at: at(-8, 9, 0), submitted_at: at(-7, 9, 0), reviewed_at: at(-6, 14, 0),
      review_note: 'Quy mô 600 người vượt sức chứa phòng 201 (80 chỗ). Đề nghị điều chỉnh địa điểm hoặc quy mô, bổ sung danh sách khách mời và dự toán chi tiết.',
      agenda: [['18:00 – 20:30', 'Giao lưu']] });

    addEvent('slide', { code: 'NEU-SLIDE-2026', title: 'Workshop Thiết kế slide thuyết trình học thuật', slogan: 'Trình bày rõ ràng • Thuyết phục', cat: 'Học thuật', unit: U[5], by: org.cntt, ...C_('cntt'),
      summary: 'Nguyên tắc thiết kế slide cho báo cáo nghiên cứu và bảo vệ khóa luận.',
      description: 'Bản nháp – đang hoàn thiện nội dung.',
      location: 'Phòng B101, nhà A2', start_at: at(18, 14, 0), end_at: at(18, 16, 0), capacity: 60, status: 'draft',
      created_at: at(-1, 16, 0), agenda: [['14:00 – 16:00', 'Workshop']] });

    addEvent('run', { code: 'NEU-RUN-2026', title: 'NEU Run – Chạy bộ vì cộng đồng', slogan: 'Mỗi bước chạy • Một nghĩa cử', cat: 'Cộng đồng', unit: U[6], by: org.doan, ...C_('doan'),
      summary: 'Giải chạy gây quỹ học bổng cho sinh viên có hoàn cảnh khó khăn.',
      description: 'Giải chạy 5km quanh khu vực trường, toàn bộ lệ phí được dùng cho quỹ học bổng.',
      location: 'Cổng Giải Phóng, Đại học NEU', start_at: at(3, 6, 0), end_at: at(3, 8, 30), capacity: 400, status: 'cancelled',
      cancel_reason: 'Dự báo thời tiết mưa lớn kéo dài; sự kiện được hủy và sẽ thông báo lịch mới sau.',
      agenda: [['06:00 – 06:30', 'Khởi động'], ['06:30 – 08:00', 'Chạy 5km'], ['08:00 – 08:30', 'Trao giải']] });

    // ---------- Đăng ký, điểm danh, đánh giá ----------
    let regSeq = 1000;
    const comments = ['Nội dung rất bổ ích, diễn giả nhiệt tình.', 'Tổ chức chuyên nghiệp, đúng giờ.', 'Mong có thêm thời gian hỏi đáp.',
      'Phòng hơi chật so với số người tham dự.', 'Rất thực tế, áp dụng được ngay.', 'Tài liệu chia sẻ hữu ích.', '', '', 'Sẽ tham gia các buổi tiếp theo!'];
    const register = (ev, uid, opt = {}) => {
      const e = evs[ev];
      const prefix = e.code.split('-').slice(0, 2).join('-');
      let regAt = opt.at || shift(e.start_at, -between(60 * 6, 60 * 24 * 12));
      if (regAt > NOW) regAt = shift(NOW, -between(30, 60 * 24 * 6));               // không có thời điểm đăng ký trong tương lai
      if (regAt > e.reg_deadline) regAt = shift(e.reg_deadline, -between(60, 60 * 24 * 5));
      if (opt.cancelled_at && regAt >= opt.cancelled_at) regAt = shift(opt.cancelled_at, -between(60 * 24, 60 * 24 * 4));
      const code = `${prefix}-${String(regSeq++).padStart(4, '0')}`;
      const id = q.run(`INSERT INTO registrations (event_id,user_id,code,status,registered_at,cancelled_at,attendance,checked_in_at,check_method,checked_out_at,checkout_method)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, e.id, uid, opt.code || code, opt.status || 'registered', regAt, opt.cancelled_at || null,
        opt.attendance || 'pending', opt.checked_in_at || null, opt.method || null, opt.checked_out_at || null, opt.checked_out_at ? (opt.out_method || 'code') : null).id;
      return id;
    };
    const review = (ev, uid, rating, comment) => {
      const t = shift(evs[ev].end_at, between(30, 60 * 24 * 2));
      q.run('INSERT INTO reviews (event_id,user_id,rating,comment,is_anonymous,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', evs[ev].id, uid, rating, comment, rnd() < 0.2 ? 1 : 0, t, t);
    };

    // Sinh viên demo chính – Thân Mậu Dũng
    register('xanh', mainStudent, { attendance: 'present', checked_in_at: shift(evs.xanh.start_at, 12), method: 'code', checked_out_at: shift(evs.xanh.end_at, 5) });
    review('xanh', mainStudent, 5, 'Hoạt động ý nghĩa, mong trường tổ chức thường xuyên hơn.');
    register('python', mainStudent, { attendance: 'present', checked_in_at: shift(evs.python.start_at, -5), method: 'qr', checked_out_at: shift(evs.python.end_at, 3), out_method: 'qr' });
    register('cv', mainStudent, { attendance: 'absent' });
    register('ai', mainStudent, { code: 'NEU-AI-0123', at: shift(aiStart, -60 * 24 * 4) });
    register('jobfair', mainStudent);
    register('powerbi', mainStudent);
    register('run', mainStudent);
    register('football', mainStudent, { status: 'cancelled', cancelled_at: at(-1, 10, 0) });

    // Sinh viên demo thứ hai
    register('ai', student2); register('logi', student2, { attendance: 'present', checked_in_at: shift(evs.logi.start_at, 3), method: 'code', checked_out_at: shift(evs.logi.end_at, 8) });
    register('jobfair', student2);

    // Sinh viên ngẫu nhiên
    const others = students.slice(2);
    const fill = (ev, n, presentRate) => {
      const e = evs[ev];
      const pool = [...others].sort(() => rnd() - 0.5).slice(0, n);
      const ended = e.end_at < NOW, ongoing = e.start_at <= NOW && NOW <= e.end_at;
      pool.forEach((uid) => {
        if (q.get('SELECT 1 FROM registrations WHERE event_id=? AND user_id=?', e.id, uid)) return;
        if (rnd() < 0.05 && !ended) { register(ev, uid, { status: 'cancelled', cancelled_at: shift(NOW, -between(60, 60 * 24 * 3)) }); return; }
        let opt = {};
        if (ended) {
          const present = rnd() < presentRate;
          opt = present ? { attendance: 'present', checked_in_at: shift(e.start_at, between(-15, 25)), method: rnd() < 0.5 ? 'qr' : 'code',
            checked_out_at: rnd() < 0.88 ? shift(e.end_at, between(-10, 25)) : null, out_method: rnd() < 0.5 ? 'qr' : 'code' } : { attendance: 'absent' };
          register(ev, uid, opt);
          if (present && rnd() < 0.55) review(ev, uid, pick([5, 5, 4, 4, 4, 3, 5, 2]), pick(comments));
        } else if (ongoing) {
          const present = rnd() < presentRate;
          register(ev, uid, present ? { attendance: 'present', checked_in_at: shift(e.start_at, between(-15, 30)), method: rnd() < 0.5 ? 'qr' : 'code' } : {});
        } else register(ev, uid);
      });
    };
    fill('xanh', 95, 0.86); fill('logi', 110, 0.82); fill('cv', 70, 0.9); fill('tansv', 116, 0.78); fill('python', 55, 0.92);
    fill('fintech', 90, 0.8); fill('hienmau', 100, 0.85); fill('ai', 100, 0.75);
    fill('jobfair', 112, 0); fill('powerbi', 37, 0); fill('football', 60, 0); fill('asean', 80, 0); fill('olympic', 45, 0); fill('run', 70, 0);

    // Phiên điểm danh: đã đóng cho sự kiện cũ, đang mở cho sự kiện AI
    for (const k of ['xanh', 'logi', 'cv', 'tansv', 'python', 'fintech', 'hienmau']) {
      const e = evs[k];
      q.run('INSERT INTO attendance_sessions (event_id,code,opened_by,opened_at,expires_at,closed_at) VALUES (?,?,?,?,?,?)',
        e.id, k.toUpperCase().slice(0, 3) + between(1000, 9999), e.by, shift(e.start_at, -15), shift(e.start_at, 45), e.end_at);
      q.run("INSERT INTO attendance_sessions (event_id,code,kind,opened_by,opened_at,expires_at,closed_at) VALUES (?,?,'checkout',?,?,?,?)",
        e.id, 'OUT' + between(1000, 9999), e.by, shift(e.end_at, -15), shift(e.end_at, 30), shift(e.end_at, 30));
    }

    // ---------- Danh sách hoàn thành gửi duyệt điểm hoạt động ----------
    const submitPoints = (k, status, note) => {
      const e = evs[k]; const ev = q.get('SELECT points FROM events WHERE id = ?', e.id);
      const done = q.all("SELECT id, user_id FROM registrations WHERE event_id = ? AND status='registered' AND attendance='present' AND checked_out_at IS NOT NULL", e.id);
      const sub = shift(e.end_at, 60 * 24 * 2);
      q.run(`INSERT INTO point_submissions (event_id,submitted_by,submitted_at,member_count,points,note,status,reviewed_by,reviewed_at,review_note)
             VALUES (?,?,?,?,?,?,?,?,?,?)`, e.id, e.by, sub, done.length, ev.points, 'Danh sách sinh viên check-in và check-out đầy đủ.',
        status, status === 'pending' ? null : admin, status === 'pending' ? null : shift(sub, 60 * 24), note || null);
      if (status === 'approved') for (const r of done) q.run('UPDATE registrations SET points_awarded = ? WHERE id = ?', ev.points, r.id);
    };
    submitPoints('xanh', 'approved'); submitPoints('tansv', 'approved'); submitPoints('hienmau', 'approved');
    submitPoints('logi', 'pending'); submitPoints('cv', 'pending');
    submitPoints('fintech', 'rejected', 'Danh sách có sinh viên trùng MSSV, đề nghị BTC rà soát và gửi lại.');
    q.run('INSERT INTO attendance_sessions (event_id,code,opened_by,opened_at,expires_at,closed_at) VALUES (?,?,?,?,?,NULL)',
      evs.ai.id, 'AI1210', org.cntt, shift(aiStart, -15), aiEnd);

    // ---------- Thông báo & lịch sử ----------
    const n = (uid, type, title, body, link, t) =>
      q.run('INSERT INTO notifications (user_id,type,title,body,link,is_read,created_at) VALUES (?,?,?,?,?,?,?)', uid, type, title, body, link, 0, t);
    n(mainStudent, 'attendance', 'Đã mở điểm danh', `"${evs.ai.title}" đang mở điểm danh. Nhập mã tại phòng B101.`, `/attendance.html?event=${evs.ai.id}`, shift(aiStart, -15));
    n(mainStudent, 'event', 'Sự kiện đã bị hủy', `"${evs.run.title}" đã bị hủy: ${evs.run.cancel_reason}`, `/event-detail.html?id=${evs.run.id}`, at(-1, 8, 0));
    n(mainStudent, 'review', 'Mời bạn đánh giá sự kiện', `Hãy chia sẻ cảm nhận về "${evs.python.title}".`, '/reviews.html', shift(evs.python.end_at, 30));
    n(org.clb, 'moderation', 'Hồ sơ bị từ chối', `"${evs.doanhnhan.title}" cần bổ sung: ${evs.doanhnhan.review_note}`, '/manage-events.html', at(-6, 14, 0));
    n(admin, 'moderation', 'Hồ sơ mới chờ duyệt', `"${evs.startup.title}" vừa được gửi duyệt.`, `/moderation.html?id=${evs.startup.id}`, at(-1, 9, 20));
    n(admin, 'moderation', 'Hồ sơ mới chờ duyệt', `"${evs.kts.title}" vừa được gửi duyệt.`, `/moderation.html?id=${evs.kts.id}`, at(-2, 15, 5));

    const log = (actor, action, ev, detail, reason, t) =>
      q.run('INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,detail,reason,created_at) VALUES (?,?,?,?,?,?,?)', actor, action, 'event', evs[ev].id, detail, reason || '', t);
    for (const [k, e] of Object.entries(evs)) {
      if (e.status === 'draft') { log(e.by, 'event.create', k, 'Tạo hồ sơ nháp', '', e.created_at || at(-1, 16, 0)); continue; }
      const created = e.created_at || shift(e.start_at, -60 * 24 * 20);
      log(e.by, 'event.submit', k, 'Gửi hồ sơ kiểm duyệt', '', e.submitted_at || shift(created, 60 * 24));
      if (e.status === 'approved' || e.status === 'cancelled') log(admin, 'event.approve', k, 'Phê duyệt & xuất bản', '', e.reviewed_at || shift(created, 60 * 48));
      if (e.status === 'rejected') log(admin, 'event.reject', k, 'Từ chối hồ sơ', e.review_note, e.reviewed_at);
      if (e.status === 'cancelled') log(e.by, 'event.cancel', k, 'Hủy sự kiện', e.cancel_reason, at(-1, 8, 0));
    }

    // Nhật ký bảo mật & quản trị mẫu (phục vụ phân hệ Quản trị hệ thống)
    const ulog = (actor, action, target, detail, t, entity = 'user') =>
      q.run('INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,detail,reason,created_at) VALUES (?,?,?,?,?,?,?)', actor, action, entity, target, detail, '', t);
    ulog(sysadmin, 'auth.login', sysadmin, 'Đăng nhập (IP 127.0.0.1)', at(-3, 8, 2));
    ulog(sysadmin, 'system.backup', null, 'Tạo bản sao lưu định kỳ cơ sở dữ liệu', at(-3, 8, 10), 'backup');
    ulog(sysadmin, 'account.create', org.tm, 'Cấp tài khoản Ban tổ chức: Liên chi đoàn Viện Thương mại & Kinh tế quốc tế (thuongmai@neu.edu.vn)', at(-3, 8, 25));
    ulog(sysadmin, 'system.settings', null, 'Cập nhật cấu hình: Số lần nhập sai mật khẩu trước khi tạm khóa: 3 → 5', at(-2, 9, 0), 'settings');
    ulog(student2, 'auth.login_failed', student2, 'Đăng nhập sai mật khẩu lần 1/5 (IP 192.168.1.24)', at(-1, 21, 14));
    ulog(student2, 'auth.login_failed', student2, 'Đăng nhập sai mật khẩu lần 2/5 (IP 192.168.1.24)', at(-1, 21, 15));
    ulog(student2, 'auth.login', student2, 'Đăng nhập (IP 192.168.1.24)', at(-1, 21, 17));
    ulog(mainStudent, 'auth.login', mainStudent, 'Đăng nhập (IP 127.0.0.1)', at(0, 7, 40));
    ulog(admin, 'auth.login', admin, 'Đăng nhập (IP 127.0.0.1)', at(0, 7, 55));
    ulog(org.cntt, 'auth.login', org.cntt, 'Đăng nhập (IP 127.0.0.1)', at(0, 8, 5));
  });
  settings.invalidate();

  const counts = q.get(`SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM events) e, (SELECT COUNT(*) FROM registrations) r, (SELECT COUNT(*) FROM reviews) v`);
  console.log(`✔ Đã tạo dữ liệu mẫu: ${counts.u} người dùng, ${counts.e} sự kiện, ${counts.r} lượt đăng ký, ${counts.v} đánh giá.`);
}

module.exports = { seed };

if (require.main === module) {
  // Xóa file upload cũ khi seed lại
  const up = path.join(__dirname, '..', 'uploads');
  if (fs.existsSync(up)) for (const f of fs.readdirSync(up)) if (f !== '.gitkeep') fs.rmSync(path.join(up, f), { force: true });
  seed();
  close();
}
