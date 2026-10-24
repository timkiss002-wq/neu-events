// Trang Hướng dẫn: hiển thị nội dung theo vai trò; xem được cả khi chưa đăng nhập
(async function () {
  let role = 'guest';
  const res = await fetch('/api/auth/me').catch(() => null);
  if (res && res.ok) {
    try { const { user } = await App.init({ page: 'guide' }); role = user.role; } catch { /* bỏ qua */ }
  } else {
    document.body.classList.add('guest');
    document.querySelector('.sidebar').remove();
    document.querySelector('.header').innerHTML = `<a href="/login.html" class="brand"><img class="brand-logo-img" src="/img/logo-neu.png" alt="Logo Trường Đại học Kinh tế Quốc dân"><div><div class="brand-name">NEU Events</div><div class="brand-sub">Đại học Kinh tế Quốc dân</div></div></a>
      <a class="btn-primary" href="/login.html">Đăng nhập</a>`;
    document.querySelector('.footer').innerHTML = `<span>© ${new Date().getFullYear()} Đại học Kinh tế Quốc dân. Cổng thông tin sự kiện.</span><nav><a href="#quy-dinh">Quy định sử dụng</a><a href="mailto:events@neu.edu.vn">Liên hệ hỗ trợ</a></nav>`;
  }
  // Ẩn phần không dành cho vai trò hiện tại
  document.querySelectorAll('[data-roles]').forEach((el) => { if (!el.dataset.roles.split(' ').includes(role)) el.remove(); });
  // Đánh số lại và dựng mục lục từ các phần còn lại
  const toc = document.getElementById('toc');
  document.querySelectorAll('.g-body > section').forEach((sec, i) => {
    const h = sec.querySelector('h3'); h.textContent = `${i + 1}. ${h.textContent}`;
    const a = document.createElement('a'); a.href = `#${sec.id}`; a.textContent = h.textContent; toc.appendChild(a);
  });
  if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
})();
