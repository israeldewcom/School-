// src/core/site/site.renderer.ts
//
// Server-rendered, multi-page school website. Works immediately at /s/<school-name>
// (home, about, programs, gallery, admissions, contact) with no frontend build; a separate
// frontend can instead consume the same data from GET /api/v1/public/sites/:slug.
import { safeUrl } from './site.service';

const esc = (v: any): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Paragraphs, **bold**, and https links only — everything is escaped first.
function rich(text: any): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');
}

const img = (u: any, alt = '', cls = '') => {
  const s = safeUrl(u);
  return s ? `<img class="${cls}" src="${esc(s)}" alt="${esc(alt)}" loading="lazy">` : '';
};


// ---------------------------------------------------------------------------
// Colour maths: whatever colour a school picks (even bright yellow), text must stay readable.
// ---------------------------------------------------------------------------
export const clampHex = (v: any, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : fallback);
const rgbOf = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hexOf = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
const lum = (h: string) => {
  const [r, g, b] = rgbOf(h).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const mix = (a: string, b: string, t: number) => { const A = rgbOf(a), B = rgbOf(b); return hexOf(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** Text colour that reads well on top of `bg`. */
export const onColor = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#111827') ? '#ffffff' : '#111827');
/** Version of `c` dark enough to use as text/links on a white page. */
export function inkOf(c: string): string {
  let out = c, i = 0;
  while (contrast(out, '#ffffff') < 4.5 && i++ < 30) out = mix(out, '#000000', 0.08);
  return out;
}

const ICONS = [
  '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15zM20 18v3H6.5"/>',
  '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .2 5 2.4 5 5.3"/>',
  '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
];
const icon = (i: number) =>
  `<svg class="ico" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i % ICONS.length]}</svg>`;

const initials = (name: string) =>
  String(name || 'S').split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';

export const SITE_TEMPLATES = ['modern', 'classic', 'bold'] as const;

export const SITE_PAGES = ['home', 'about', 'programs', 'gallery', 'admissions', 'contact'];

const PAGE_LABEL: Record<string, string> = {
  home: 'Home', about: 'About', programs: 'Programs', gallery: 'Gallery', admissions: 'Admissions', contact: 'Contact',
};

const pageHref = (slug: string, page: string) => `/s/${encodeURIComponent(slug)}${page === 'home' ? '' : '/' + page}`;

const hasBlock = (p: any, ...types: string[]) => (p.blocks || []).some((b: any) => types.includes(b.type));

/** Which pages appear in the menu for this school (empty pages are hidden). */
function availablePages(p: any): string[] {
  return SITE_PAGES.filter((pg) => {
    if (pg === 'programs') return hasBlock(p, 'PROGRAMS');
    if (pg === 'gallery') return hasBlock(p, 'GALLERY');
    return true;
  });
}

function blockHtml(b: any, p: any): string {
  const d = b.data || {};
  const apply = pageHref(p.slug, 'admissions');
  switch (b.type) {
    case 'HERO': {
      const bg = safeUrl(d.image) || safeUrl(p.theme.heroImage);
      const logo = p.school.logo
        ? img(p.school.logo, p.school.name, 'herologo').replace('loading="lazy"', '')
        : `<div class="herologo mono" aria-hidden="true">${esc(initials(p.school.name))}</div>`;
      return `<header class="hero${bg ? ' has-img' : ''}">
  ${bg ? `<div class="heroimg" style="background-image:url('${esc(bg)}')"></div>` : ''}
  <div class="wrap herogrid">
    <div class="herotext">
      <span class="eyebrow">${esc(p.school.city || p.school.state || 'Welcome')}</span>
      <h1>${esc(d.headline || p.school.name)}</h1>
      <p class="lead">${esc(d.subheadline || '')}</p>
      <div class="actions">${p.admissions.open ? `<a class="btn" href="${apply}">${esc(d.ctaLabel || 'Apply for admission')}</a>` : '<span class="pill">Admissions are currently closed</span>'}
      ${p.portalUrl ? `<a class="btn ghost" href="${esc(p.portalUrl)}">Parent / Staff login</a>` : ''}</div>
    </div>
    <div class="herocard">${logo}<b>${esc(p.school.name)}</b>${p.school.motto ? `<small>${esc(p.school.motto)}</small>` : ''}</div>
  </div></header>`;
    }
    case 'ABOUT':
      return `<section class="wrap two"><div><span class="kicker">Who we are</span><h2>${esc(d.title || 'About us')}</h2><div class="prose">${rich(d.body)}</div></div>${img(d.image, 'About ' + p.school.name, 'rounded')}</section>`;
    case 'STATS':
      return (d.items || []).length
        ? `<section class="stats"><div class="wrap grid">${(d.items || []).map((i: any) => `<div class="stat"><b>${esc(i.value)}</b><span>${esc(i.label)}</span></div>`).join('')}</div></section>`
        : '';
    case 'FEATURES':
      return `<section class="wrap"><span class="kicker">Why us</span><h2>${esc(d.title || '')}</h2><div class="grid cards">${(d.items || []).map((i: any, n: number) => `<div class="card feat"><div class="icowrap">${icon(n)}</div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join('')}</div></section>`;
    case 'PROGRAMS':
      return `<section class="wrap"><span class="kicker">Academics</span><h2>${esc(d.title || 'Classes')}</h2><div class="chips">${(d.items || []).map((i: any) => `<span class="chip">${esc(i.title)}</span>`).join('')}</div></section>`;
    case 'GALLERY':
      return `<section class="wrap"><h2>${esc(d.title || 'Gallery')}</h2><div class="grid gallery">${(d.items || []).map((i: any) => img(i.image, i.caption || '', 'rounded')).join('')}</div></section>`;
    case 'TESTIMONIALS':
      return `<section class="wrap"><span class="kicker">Parents</span><h2>${esc(d.title || 'What parents say')}</h2><div class="grid cards">${(d.items || []).map((i: any) => `<figure class="card quote"><blockquote>“${esc(i.text)}”</blockquote><figcaption>${esc(i.name)}</figcaption></figure>`).join('')}</div></section>`;
    case 'TEXT':
      return `<section class="wrap">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}<div class="prose">${rich(d.body)}</div></section>`;
    case 'ADMISSION_CTA':
      return p.admissions.open
        ? `<section class="cta"><div class="wrap"><h2>${esc(d.title || 'Admissions are open')}</h2><p>${esc(d.text || '')}</p><a class="btn alt" href="${apply}">${esc(d.ctaLabel || 'Start application')}</a></div></section>`
        : '';
    case 'CONTACT':
      return contactHtml(p, d.title);
    default:
      return '';
  }
}

function contactHtml(p: any, title?: string): string {
  const s = p.school;
  const addr = [s.address, s.city, s.state].filter(Boolean).join(', ');
  const wa = String(s.phone || '').replace(/[^\d]/g, '');
  const waNum = wa.startsWith('0') ? '234' + wa.slice(1) : wa;
  return `<section class="wrap" id="contact"><span class="kicker">Get in touch</span><h2>${esc(title || 'Contact us')}</h2><div class="grid cards">
  <div class="card">
    ${addr ? `<p><b>Address</b><br>${esc(addr)}</p><p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Open in Google Maps</a></p>` : ''}
    ${s.phone ? `<p><b>Phone</b><br><a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></p>` : ''}
    ${s.email ? `<p><b>Email</b><br><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` : ''}
    ${waNum.length >= 10 ? `<p><a class="btn wa" href="https://wa.me/${esc(waNum)}" target="_blank" rel="noopener">Chat on WhatsApp</a></p>` : ''}
  </div>
  <div class="card"><h3>Visiting hours</h3><p>Monday – Friday<br>8:00 am – 4:00 pm</p><p>For admissions enquiries, <a href="${pageHref(p.slug, 'admissions')}">apply online</a> or call the school office.</p></div>
  </div></section>`;
}

function fieldHtml(f: any): string {
  const id = `f_${esc(f.key)}`;
  const req = f.required ? 'required' : '';
  const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <i>*</i>' : ''}</label>`;
  let input: string;
  if (f.key === 'classAppliedId') {
    input = `<select id="${id}" name="${esc(f.key)}" ${req}><option value="">Select class</option>${(f.choices || []).map((c: any) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'select') {
    input = `<select id="${id}" name="${esc(f.key)}" ${req}><option value="">Select</option>${(f.options || []).map((o: string) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${esc(f.key)}" rows="3" maxlength="3000" ${req}></textarea>`;
  } else if (f.type === 'photo') {
    // Passport photo: opens the camera on phones, shows a preview before submitting.
    return `<div class="field photo">${label}<div class="photobox"><img id="${id}_prev" alt="" class="photoprev" hidden><div class="photoadd" id="${id}_ph">No photo yet</div></div>
<input id="${id}" name="${esc(f.key)}" type="file" accept="image/*" capture="user" data-photo="1" ${req}><small>A clear, front-facing photo of the child.</small></div>`;
  } else {
    const t = f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
    input = `<input id="${id}" name="${esc(f.key)}" type="${t}" placeholder="${esc(f.placeholder || '')}" maxlength="300" ${req}>`;
  }
  return `<div class="field">${label}${input}</div>`;
}

const BLOCKS_BY_PAGE: Record<string, string[]> = {
  home: ['HERO', 'STATS', 'ABOUT', 'FEATURES', 'ADMISSION_CTA', 'TESTIMONIALS'],
  about: ['ABOUT', 'TEXT'],
  programs: ['PROGRAMS', 'ADMISSION_CTA'],
  gallery: ['GALLERY'],
  admissions: [],
  contact: ['CONTACT'],
};

function pageTitle(page: string, p: any): string {
  return page === 'home' ? p.seo.title : `${PAGE_LABEL[page]} · ${p.school.name}`;
}

export function sitemapXml(p: any, base: string): string {
  const urls = availablePages(p)
    .map((pg) => `  <url><loc>${esc(base + pageHref(p.slug, pg))}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function siteCss(p: any): string {
  const t = p.theme || {};
  const prim = clampHex(t.primaryColor, '#0f766e');
  const sec = clampHex(t.secondaryColor, '#f59e0b');
  const pInk = inkOf(prim);                       // headings / links on white
  const onP = onColor(prim);                      // text on primary backgrounds
  const pDeep = mix(prim, '#000000', 0.28);       // gradient end
  // A secondary that is too close to the primary would make buttons vanish on the hero.
  const btnBg = contrast(prim, sec) >= 1.8 ? sec : (onP === '#ffffff' ? '#ffffff' : '#111827');
  const onBtn = onColor(btnBg);
  const tint = mix(prim, '#ffffff', 0.92);
  const tint2 = mix(prim, '#ffffff', 0.84);
  const font = esc(t.fontFamily || 'Inter, system-ui, sans-serif');
  return `:root{--p:${prim};--pi:${pInk};--onp:${onP};--pd:${pDeep};--s:${btnBg};--ons:${onBtn};--tint:${tint};--tint2:${tint2};--r:18px;--head:${font}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:${font};color:#1f2937;line-height:1.65;background:#f8fafc;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto}a{color:var(--pi)}
.wrap{max-width:1120px;margin:0 auto;padding:56px 20px}
h1,h2,h3{font-family:var(--head);line-height:1.2}
h1{font-size:clamp(30px,5.4vw,54px);margin:.25em 0 .35em;letter-spacing:-.02em}
h2{color:var(--pi);font-size:clamp(24px,3.6vw,34px);margin:0 0 20px;letter-spacing:-.01em}
.kicker,.eyebrow{display:block;text-transform:uppercase;letter-spacing:.14em;font-size:.74rem;font-weight:800;color:var(--pi);margin-bottom:8px}
.prose p{margin:0 0 1em}
/* navigation */
.nav{position:-webkit-sticky;position:sticky;top:0;z-index:30;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid #e5e7eb}
.navin{max-width:1120px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;color:#111827;text-decoration:none;min-width:0}
.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:62vw}
.navlogo{width:40px;height:40px;object-fit:contain;border-radius:10px;flex:none}
.navmono{width:40px;height:40px;border-radius:12px;background:var(--p);color:var(--onp);display:grid;place-items:center;font-weight:800;flex:none}
.links{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.links a{padding:9px 14px;border-radius:999px;text-decoration:none;color:#374151;font-weight:600;font-size:.95rem}
.links a.on,.links a:hover{background:var(--tint2);color:var(--pi)}
.links a.portal{background:var(--p);color:var(--onp);margin-left:6px}.links a.portal:hover{opacity:.9}
.menu-toggle{position:absolute;left:0;top:0;width:1px;height:1px;min-height:0;padding:0;border:0;opacity:0;pointer-events:none}.burger{display:none;width:44px;height:44px;border-radius:12px;align-items:center;justify-content:center;cursor:pointer;font-size:24px;background:var(--tint)}
/* hero */
.hero{position:relative;overflow:hidden;color:var(--onp);background:linear-gradient(135deg,var(--p),var(--pd))}
.hero .heroimg{position:absolute;left:0;right:0;top:0;bottom:0;background-size:cover;background-position:center;opacity:.28}
.hero:before{content:"";position:absolute;right:-120px;top:-120px;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,.08)}
.hero:after{content:"";position:absolute;left:-80px;bottom:-140px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.06)}
.herogrid{position:relative;z-index:1;display:grid;grid-template-columns:1.35fr 1fr;gap:40px;align-items:center;padding-top:72px;padding-bottom:72px}
.hero .eyebrow{color:var(--onp);opacity:.85}.hero .lead{font-size:1.15rem;opacity:.95;max-width:560px;margin:0 0 28px}
.hero h1{color:var(--onp)}
.herocard{background:rgba(255,255,255,.96);color:#111827;border-radius:24px;padding:28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.22)}
.herocard b{display:block;font-size:1.15rem;margin-top:12px}.herocard small{display:block;color:#6b7280;margin-top:4px}
.herologo{width:112px;height:112px;object-fit:contain;border-radius:20px;margin:0 auto;display:block}
.herologo.mono{background:var(--p);color:var(--onp);display:grid;place-items:center;font-size:2.4rem;font-weight:800}
.banner{background:linear-gradient(135deg,var(--p),var(--pd));color:var(--onp)}.banner .wrap{padding:36px 20px}.banner h1{margin:0;color:var(--onp);font-size:clamp(26px,4vw,38px)}
.actions{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-block;background:var(--s);color:var(--ons);padding:14px 28px;border-radius:999px;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:1rem;box-shadow:0 6px 16px rgba(0,0,0,.14);transition:transform .15s}
.btn:hover{transform:translateY(-1px)}
.btn.alt{background:#fff;color:var(--pi)}.btn.ghost{background:transparent;color:var(--onp);border:2px solid var(--onp);box-shadow:none}.btn.wa{background:#25d366;color:#052e16}
.pill{background:rgba(255,255,255,.2);padding:8px 16px;border-radius:999px}
/* content */
.two{display:grid;gap:36px;grid-template-columns:1fr 1fr;align-items:center}.rounded{width:100%;border-radius:var(--r);object-fit:cover;box-shadow:0 10px 30px rgba(15,23,42,.12)}
.stats{background:#fff;border-bottom:1px solid #e5e7eb}.stats .wrap{padding:28px 20px}.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.stat{text-align:center}.stat b{display:block;font-size:2.2rem;color:var(--pi);line-height:1.1}.stat span{color:#6b7280;font-weight:600}
.card{background:#fff;border-radius:var(--r);padding:24px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.04);border:1px solid #eef2f7}
.card h3{margin:.2em 0 .4em;color:#111827}.card p{margin:.3em 0;color:#4b5563}
.feat .icowrap{width:52px;height:52px;border-radius:14px;background:var(--tint2);color:var(--pi);display:grid;place-items:center;margin-bottom:10px}
.quote blockquote{margin:0 0 12px;font-size:1.05rem;color:#111827}.quote figcaption{color:var(--pi);font-weight:700}.quote{margin:0}
.chips{display:flex;flex-wrap:wrap;gap:10px}.chip{background:#fff;border:1px solid var(--tint2);color:var(--pi);padding:8px 18px;border-radius:999px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.cta{background:linear-gradient(135deg,var(--p),var(--pd));color:var(--onp);text-align:center}.cta h2{color:var(--onp)}.cta p{max-width:560px;margin:0 auto 24px;opacity:.95}
.gallery img{height:220px}
/* forms */
fieldset{border:0;padding:0;margin:0 0 24px}legend{font-weight:800;color:var(--pi);margin-bottom:12px;font-size:1.05rem}
.fgrid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.field label{display:block;font-size:.9rem;font-weight:600;margin-bottom:5px}.field i{color:#dc2626;font-style:normal}
.field small{color:#6b7280}
input,select,textarea{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;background:#fff;color:#111827;min-height:46px}
input:focus,select:focus,textarea:focus{outline:3px solid var(--tint2);border-color:var(--pi)}
.photobox{display:flex;align-items:center;gap:14px;margin-bottom:8px}.photoprev{width:96px;height:96px;object-fit:cover;border-radius:16px;border:2px solid var(--tint2)}.photoadd{width:96px;height:96px;border-radius:16px;border:2px dashed #cbd5e1;display:grid;place-items:center;color:#9ca3af;font-size:.75rem;text-align:center;padding:6px}
#msg{margin:12px 0;font-weight:600}.err{color:#b91c1c}.ok{color:#047857}
/* footer */
footer{background:#0f172a;color:#cbd5e1;margin-top:32px}footer a{color:#fff}.fgrid2{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));padding:40px 20px}
.copy{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:1120px;margin:0 auto;padding:16px 20px;border-top:1px solid #1e293b;font-size:.82rem;color:#94a3b8}
.copy .pw{opacity:.8}.copy .pw a{color:#94a3b8;text-decoration:none;font-weight:600}
/* template variants chosen by the school */
body[data-t="classic"]{--head:Georgia,'Times New Roman',serif;--r:6px}
body[data-t="classic"] .hero{background:var(--p)}body[data-t="classic"] .hero:before,body[data-t="classic"] .hero:after{display:none}
body[data-t="classic"] .btn,body[data-t="classic"] .chip,body[data-t="classic"] .links a{border-radius:6px}
body[data-t="bold"]{--r:28px}body[data-t="bold"] h1{font-weight:900}body[data-t="bold"] .herocard{transform:rotate(1.5deg)}
body[data-t="bold"] .hero{background:var(--p)}body[data-t="bold"] .stat b{font-size:2.8rem}
@media(max-width:820px){.herogrid{grid-template-columns:1fr;padding-top:44px;padding-bottom:44px;gap:28px}.two{grid-template-columns:1fr}.wrap{padding:40px 18px}
.burger{display:flex}.links{display:none;width:100%;flex-direction:column;align-items:stretch;padding-bottom:8px}.links a{padding:13px 14px}.links a.portal{margin:6px 0 0;text-align:center}
.menu-toggle:checked~.links{display:flex}.hero .lead{font-size:1.02rem}.btn{width:100%;text-align:center}.actions{flex-direction:column}.copy{flex-direction:column;text-align:center}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;
}

export function renderSiteHtml(p: any, page: string = 'home'): string {
  const t = p.theme || {};
  const template = (SITE_TEMPLATES as readonly string[]).includes(t.template) ? t.template : 'modern';
  const api = `/api/v1/public/sites/${encodeURIComponent(p.slug)}`;
  const groups: Array<[string, string]> = [['applicant', "Child's details"], ['parent', 'Parent / guardian'], ['custom', 'Additional information']];
  const pages = availablePages(p);
  const themeColor = clampHex(t.primaryColor, '#0f766e');

  // ---- body for this page ----
  let body = '';
  const wanted = BLOCKS_BY_PAGE[page] || [];
  const blocks = (p.blocks || []).filter((b: any) => wanted.includes(b.type));
  if (page !== 'home') {
    body += `<header class="banner"><div class="wrap"><h1>${esc(PAGE_LABEL[page])}</h1></div></header>`;
  }
  // On the home page, About is a short teaser; STATS only shows when it has something to show.
  body += blocks.map((b: any) => blockHtml(b, p)).join('\n');

  if (page !== 'admissions' && page !== 'contact' && !blocks.length) {
    body += `<section class="wrap"><div class="card"><p>This page is being updated. Please check back soon.</p></div></section>`;
  }
  if (page === 'contact' && !blocks.length) body += contactHtml(p);

  if (page === 'admissions') {
    body += p.admissions.open
      ? `<section class="wrap" id="apply"><span class="kicker">Admissions</span><h2>Apply for admission</h2>${p.admissions.intro ? `<p>${esc(p.admissions.intro)}</p>` : ''}
<form id="applyForm" class="card" novalidate>
${groups.map(([sec, title]) => {
  const fs = p.admissions.fields.filter((f: any) => f.section === sec);
  return fs.length ? `<fieldset><legend>${title}</legend><div class="fgrid">${fs.map(fieldHtml).join('')}</div></fieldset>` : '';
}).join('')}
<input type="text" name="website_url" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<div id="msg" role="alert"></div>
<button class="btn" type="submit" id="applyBtn">Submit application</button>
</form></section>`
      : `<section class="wrap"><div class="card"><h3>Admissions are currently closed</h3><p>Please check back later or <a href="${pageHref(p.slug, 'contact')}">contact the school</a>.</p></div></section>`;

    body += `<section class="wrap" id="status"><span class="kicker">Already applied?</span><h2>Check application status</h2><form id="statusForm" class="card fgrid">
<div class="field"><label for="appNo">Application number</label><input id="appNo" name="applicationNumber" placeholder="APP-2026-XXXXXX" required></div>
<div class="field"><label for="appPhone">Parent phone number</label><input id="appPhone" name="phone" type="tel" required></div>
<div class="field" style="align-self:end"><button class="btn" type="submit">Check</button></div></form><div id="statusOut"></div></section>`;
  }

  // ---- chrome: school identity everywhere, platform credit only in the footer bar ----
  const brandMark = p.school.logo ? img(p.school.logo, '', 'navlogo').replace('loading="lazy"', '') : `<span class="navmono" aria-hidden="true">${esc(initials(p.school.name))}</span>`;
  const nav = `<nav class="nav" aria-label="Main"><div class="navin">
  <a class="brand" href="${pageHref(p.slug, 'home')}">${brandMark}<span>${esc(p.school.name)}</span></a>
  <input type="checkbox" id="menu" class="menu-toggle" aria-label="Toggle menu"><label for="menu" class="burger" aria-hidden="true">☰</label>
  <div class="links">
    ${pages.map((pg) => `<a href="${pageHref(p.slug, pg)}"${pg === page ? ' class="on" aria-current="page"' : ''}>${PAGE_LABEL[pg]}</a>`).join('')}
    ${p.portalUrl ? `<a class="portal" href="${esc(p.portalUrl)}">Portal login</a>` : ''}
  </div></div></nav>`;

  const social = Object.entries(p.socials || {}).filter(([, v]) => safeUrl(v)).map(([k, v]) => `<a href="${esc(safeUrl(v))}" rel="noopener" target="_blank">${esc(k)}</a>`).join(' · ');
  const footer = `<footer><div class="wrap fgrid2">
  <div><b>${esc(p.school.name)}</b>${p.school.motto ? `<br><small>${esc(p.school.motto)}</small>` : ''}${social ? `<br><small>${social}</small>` : ''}</div>
  <div>${pages.map((pg) => `<a href="${pageHref(p.slug, pg)}">${PAGE_LABEL[pg]}</a>`).join(' · ')}${p.portalUrl ? ` · <a href="${esc(p.portalUrl)}">Portal</a>` : ''}</div>
  <div>${p.school.phone ? `<a href="tel:${esc(p.school.phone)}">${esc(p.school.phone)}</a>` : ''}${p.school.email ? `<br><a href="mailto:${esc(p.school.email)}">${esc(p.school.email)}</a>` : ''}</div>
  </div>
  <div class="copy"><span>© ${new Date().getFullYear()} ${esc(p.school.name)}</span><span class="pw">Powered by <a href="https://schoolflow.ng" rel="noopener" target="_blank">SchoolFlow</a></span></div></footer>`;

  const canonical = p.canonicalUrl + (page === 'home' ? '' : '/' + page);
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'School', name: p.school.name, url: p.canonicalUrl,
    logo: p.school.logo || undefined,
    telephone: p.school.phone || undefined, email: p.school.email || undefined,
    address: p.school.address ? { '@type': 'PostalAddress', streetAddress: p.school.address, addressLocality: p.school.city || undefined, addressRegion: p.school.state || undefined } : undefined,
  }).replace(/</g, '\\u003c');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(pageTitle(page, p))}</title><meta name="description" content="${esc(p.seo.description)}"><meta name="theme-color" content="${esc(themeColor)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(pageTitle(page, p))}"><meta property="og:description" content="${esc(p.seo.description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(p.school.name)}">
${p.school.logo ? `<link rel="icon" href="${esc(p.school.logo)}"><meta property="og:image" content="${esc(p.school.logo)}">` : ''}
<script type="application/ld+json">${ld}</script>
<style>
${siteCss(p)}
</style></head><body data-t="${template}">
${nav}
${body}
${footer}
<script>
(function(){
var API=${JSON.stringify(api)};
function resize(file,cb){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var m=800,w=im.width,h=im.height;if(w>m||h>m){var k=Math.min(m/w,m/h);w=Math.round(w*k);h=Math.round(h*k)}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);cb(c.toDataURL('image/jpeg',0.85))};im.onerror=function(){cb(null)};im.src=r.result};r.readAsDataURL(file)}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
var f=document.getElementById('applyForm');
if(f){
 var pi=f.querySelector('input[data-photo]');
 if(pi)pi.addEventListener('change',function(){var file=pi.files&&pi.files[0];if(!file)return;resize(file,function(d){if(!d)return;var pv=document.getElementById(pi.id+'_prev'),ph=document.getElementById(pi.id+'_ph');if(pv){pv.src=d;pv.hidden=false}if(ph)ph.style.display='none'})});
 f.addEventListener('submit',function(e){e.preventDefault();var msg=document.getElementById('msg'),btn=document.getElementById('applyBtn');msg.className='';msg.textContent='Submitting…';btn.disabled=true;
 var body={};new FormData(f).forEach(function(v,k){if(typeof v==='string')body[k]=v});
 var ph=f.querySelector('input[data-photo]');
 function send(){fetch(API+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(j){
  if(j.success){while(f.firstChild)f.removeChild(f.firstChild);f.appendChild(el('h3','ok','Application received ✔'));f.appendChild(el('p','',j.data.message||''));var p=el('p','','Your application number is ');p.appendChild(el('b','',String(j.data.applicationNumber)));p.appendChild(document.createTextNode('. Keep it to check your status.'));f.appendChild(p)}
  else{btn.disabled=false;msg.className='err';msg.textContent=j.message||'Could not submit. Please check the form.'}}).catch(function(){btn.disabled=false;msg.className='err';msg.textContent='Network error. Please try again.'})}
 if(ph&&ph.files&&ph.files[0]){resize(ph.files[0],function(d){if(d)body[ph.name]=d;send()})}else send()});
}
var s=document.getElementById('statusForm');
if(s)s.addEventListener('submit',function(e){e.preventDefault();var o=document.getElementById('statusOut');var q=new URLSearchParams(new FormData(s));
 fetch(API+'/status?'+q.toString()).then(function(r){return r.json()}).then(function(j){
  while(o.firstChild)o.removeChild(o.firstChild);
  if(j.success){var d=j.data,c=el('div','card');c.appendChild(el('b','',String(d.applicantName||'')));c.appendChild(document.createTextNode(' — '));c.appendChild(el('span','ok',String(d.statusLabel||'')));c.appendChild(el('p','',String(d.message||'')));o.appendChild(c)}
  else{o.appendChild(el('p','err',j.message||'Not found'))}})});
})();
</script></body></html>`;
}

export function renderNotFoundHtml(message = 'We could not find that school.'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School not found</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f3f4f6;color:#1f2937;text-align:center}div{padding:24px}</style></head>
<body><div><h1>School not found</h1><p>${esc(message)}</p><p>Check the spelling of the school's link and try again.</p></div></body></html>`;
}
