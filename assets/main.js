// sticky nav
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll); onScroll();

// mobile menu
const burger = document.getElementById('burger'), menu = document.getElementById('menu');
burger.onclick = () => { menu.classList.toggle('open'); burger.classList.toggle('x'); };
menu.querySelectorAll('a').forEach(a => a.onclick = () => { menu.classList.remove('open'); burger.classList.remove('x'); });

// reveal on scroll
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = (i % 4) * 80 + 'ms';
  io.observe(el);
});

// equipment filter
document.querySelectorAll('.filters button').forEach(b => b.onclick = () => {
  document.querySelector('.filters .on').classList.remove('on'); b.classList.add('on');
  const f = b.dataset.f;
  document.querySelectorAll('.eq').forEach(el => el.classList.toggle('hide', f !== 'all' && el.dataset.c !== f));
});

// lightbox
const lb = document.getElementById('lb'), lbImg = lb.querySelector('img');
document.querySelectorAll('.eq img, .gallery img, .report-imgs img').forEach(img => img.onclick = () => {
  lbImg.src = img.src; lbImg.alt = img.alt; lb.classList.add('open');
});
lb.onclick = () => lb.classList.remove('open');
addEventListener('keydown', e => e.key === 'Escape' && lb.classList.remove('open'));

// quote form -> Web3Forms (sends to company email); falls back to mailto until a key is set
// Access Key ตั้งค่าได้ในหน้าแอดมิน > ข้อมูลบริษัท (content/settings.json)
const form = document.getElementById('quote'), formStatus = document.getElementById('form-status');
const WEB3FORMS_KEY = form.dataset.key, EMAIL = form.dataset.email;
const setStatus = (msg, type) => { formStatus.textContent = msg; formStatus.className = 'form-status ' + type; };

form.onsubmit = async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  const subject = 'ขอใบเสนอราคา - ' + d.type + (d.company ? ' - ' + d.company : '');
  const body = `ชื่อผู้ติดต่อ: ${d.name}\nบริษัท: ${d.company}\nเบอร์โทร: ${d.phone}\nประเภทอุปกรณ์: ${d.type}\n\nรายละเอียด:\n${d.detail}`;

  if (!WEB3FORMS_KEY) {
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  if (d.botcheck) return;

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true; setStatus('กำลังส่ง...', '');
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name: 'เว็บไซต์ PMS Technical Group', ...d })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    form.reset();
    setStatus('ส่งเรียบร้อยแล้ว ขอบคุณครับ ทีมงานจะติดต่อกลับโดยเร็วที่สุด', 'ok');
  } catch {
    setStatus('ส่งไม่สำเร็จ กรุณาโทร 092-641-6559 หรือแชท LINE', 'err');
  } finally {
    btn.disabled = false;
  }
};

document.getElementById('yr').textContent = new Date().getFullYear();
