// สร้างเว็บจาก src/index.html + content/*.json
//
//   npm run build
//
// ผลลัพธ์:
//   deploy/                 เว็บที่พร้อมขึ้น Cloudflare (Cloudflare รันคำสั่งนี้เองทุกครั้งที่แก้ในหน้าแอดมิน)
//   dist/PMS-Website.html   ไฟล์เดียว เปิดดูเครื่องอื่นได้
import { readFile, writeFile, readdir, mkdir, rm, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(ROOT, ...p);
const DEPLOY = r('deploy');
const MAX_WIDTH = 1600;

const readJson = async name => JSON.parse(await readFile(r('content', name + '.json'), 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Pages CMS saves media as "/assets/img/x.jpg"; the site uses relative paths
const img = p => esc(String(p || '').replace(/^\/+/, ''));

const CATEGORIES = ['elec', 'ctrl', 'mech'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function renderHtml() {
  const [s, clients, equipment, works, reports] = await Promise.all(
    ['settings', 'clients', 'equipment', 'works', 'reports'].map(readJson));
  const siteUrl = (s.site_url || '').replace(/\/+$/, '');
  const founded = new Date(s.founded_date);
  const now = new Date();

  const vars = {
    ...s,
    site_url: siteUrl,
    tel: s.phone.replace(/[^\d+]/g, ''),
    hero_image: img(s.hero_image),
    line_qr: img(s.line_qr),
    founded_year: founded.getFullYear(),
    founded_en: `${founded.getDate()} ${EN_MONTHS[founded.getMonth()]} ${founded.getFullYear()}`,
    years: now.getFullYear() - founded.getFullYear(),
    equipment_count: equipment.items.length,
    year: now.getFullYear(),
    map_query_enc: encodeURIComponent(s.map_query || s.address),
  };

  const names = clients.items.map(n => `<span>${esc(n)}</span>`).join('');
  const blocks = {
    // the marquee scrolls by -50%, so the list is repeated once
    clients: names + names,
    equipment: equipment.items.map(e => {
      const c = CATEGORIES.includes(e.category) ? e.category : 'elec';
      return `      <figure class="eq" data-c="${c}"><img src="${img(e.image)}" alt="${esc(e.title)}" loading="lazy"><figcaption><b>${esc(e.title)}</b><span>${esc(e.detail)}</span></figcaption></figure>`;
    }).join('\n'),
    works: works.items.map((w, i) =>
      `      <figure class="${i === 0 ? 'g1 ' : ''}reveal"><img src="${img(w.image)}" alt="${esc(w.caption)}" loading="lazy"><figcaption>${esc(w.caption)}</figcaption></figure>`
    ).join('\n'),
    report_items: reports.items.map(t => `          <li>${esc(t)}</li>`).join('\n'),
    report_images: reports.images.slice(0, 3).map(p =>
      `        <img src="${img(p)}" alt="ตัวอย่างรายงานการซ่อม" loading="lazy">`).join('\n'),
    canonical: siteUrl ? `<link rel="canonical" href="${siteUrl}/">\n<meta property="og:url" content="${siteUrl}/">` : '',
    jsonld: `<script type="application/ld+json">\n${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: s.company_th,
      alternateName: s.company_en,
      description: s.hero_lead,
      ...(siteUrl && { url: siteUrl + '/', image: siteUrl + '/assets/img/og.jpg', logo: siteUrl + '/assets/img/logo.png' }),
      telephone: '+66' + vars.tel.replace(/^0/, ''),
      email: s.email,
      foundingDate: s.founded_date,
      taxID: s.tax_id,
      address: { '@type': 'PostalAddress', streetAddress: s.address, addressCountry: 'TH' },
      areaServed: ['ชลบุรี', 'ระยอง', 'ฉะเชิงเทรา', 'EEC'],
      sameAs: [s.line_url],
    }, null, 2)}\n</script>`,
  };

  let html = await readFile(r('src', 'index.html'), 'utf8');
  html = html.replace(/<!--@(\w+)-->/g, (_, k) => {
    if (!(k in blocks)) throw new Error(`unknown block @${k}`);
    return blocks[k];
  });
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unknown variable {{${k}}}`);
    return esc(vars[k]);
  });
  return { html, siteUrl };
}

// Photos uploaded from phones are often 4000px / 5MB; shrink them for the web.
async function copyImages() {
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { console.warn('! sharp not installed, copying images as-is'); }
  const src = r('assets', 'img'), out = path.join(DEPLOY, 'assets', 'img');
  await mkdir(out, { recursive: true });
  for (const f of await readdir(src)) {
    const from = path.join(src, f), to = path.join(out, f);
    const ext = path.extname(f).toLowerCase();
    if (sharp && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && (await stat(from)).size > 250_000) {
      const pipe = sharp(from).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
      const fmt = ext === '.png' ? pipe.png({ compressionLevel: 9, palette: true })
        : ext === '.webp' ? pipe.webp({ quality: 80 }) : pipe.jpeg({ quality: 80, mozjpeg: true });
      await fmt.toFile(to);
    } else {
      await cp(from, to);
    }
  }
}

async function buildSingleFile(html) {
  await mkdir(r('dist'), { recursive: true });
  const css = await readFile(r('assets', 'style.css'), 'utf8');
  const js = await readFile(r('assets', 'main.js'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="assets/style.css">', () => `<style>\n${css}\n</style>`)
    .replace('<script src="assets/main.js"></script>', () => `<script>\n${js}\n</script>`);
  // og.jpg is only for social previews, which never read a local file
  const refs = [...new Set(html.match(/assets\/img\/(?!og\.)[\w.-]+\.(?:jpe?g|png|webp)/g) || [])];
  for (const ref of refs) {
    const buf = await readFile(path.join(DEPLOY, ref));
    const mime = ref.endsWith('.png') ? 'image/png' : ref.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    html = html.split(ref).join(`data:${mime};base64,${buf.toString('base64')}`);
  }
  await writeFile(r('dist', 'PMS-Website.html'), html);
}

const { html, siteUrl } = await renderHtml();
await rm(DEPLOY, { recursive: true, force: true });
await mkdir(path.join(DEPLOY, 'assets'), { recursive: true });
await copyImages();
await cp(r('assets', 'style.css'), path.join(DEPLOY, 'assets', 'style.css'));
await cp(r('assets', 'main.js'), path.join(DEPLOY, 'assets', 'main.js'));
await writeFile(path.join(DEPLOY, 'index.html'), html);

let robots = 'User-agent: *\nAllow: /\n';
if (siteUrl) {
  robots += `Sitemap: ${siteUrl}/sitemap.xml\n`;
  await writeFile(path.join(DEPLOY, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n</urlset>\n`);
}
await writeFile(path.join(DEPLOY, 'robots.txt'), robots);

if (!process.env.CI) await buildSingleFile(html);
console.log(`built deploy/${siteUrl ? '' : '  (site_url not set)'}`);
