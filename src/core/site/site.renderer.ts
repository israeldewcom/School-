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
      return `<header class="hero" style="${bg ? `background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${esc(bg)}')` : ''}">
  <div class="wrap">${p.school.logo ? img(p.school.logo, p.school.name, 'logo') : ''}
  <h1>${esc(d.headline || p.school.name)}</h1><p class="lead">${esc(d.subheadline || '')}</p>
  <div class="actions">${p.admissions.open ? `<a class="btn" href="${apply}">${esc(d.ctaLabel || 'Apply for admission')}</a>` : '<span class="pill">Admissions are currently closed</span>'}
  ${p.portalUrl ? `<a class="btn ghost" href="${esc(p.portalUrl)}">Parent / Staff Portal</a>` : ''}</div>
  </div></header>`;
    }
    case 'ABOUT':
      return `<section class="wrap two"><div><h2>${esc(d.title || 'About us')}</h2>${rich(d.body)}</div>${img(d.image, 'About', 'rounded')}</section>`;
    case 'STATS':
      return `<section class="stats"><div class="wrap grid">${(d.items || []).map((i: any) => `<div class="stat"><b>${esc(i.value)}</b><span>${esc(i.label)}</span></div>`).join('')}</div></section>`;
    case 'FEATURES':
      return `<section class="wrap"><h2>${esc(d.title || '')}</h2><div class="grid cards">${(d.items || []).map((i: any) => `<div class="card"><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join('')}</div></section>`;
    case 'PROGRAMS':
      return `<section class="wrap"><h2>${esc(d.title || 'Classes')}</h2><div class="chips">${(d.items || []).map((i: any) => `<span class="chip">${esc(i.title)}</span>`).join('')}</div></section>`;
    case 'GALLERY':
      return `<section class="wrap"><h2>${esc(d.title || 'Gallery')}</h2><div class="grid gallery">${(d.items || []).map((i: any) => img(i.image, i.caption || '', 'rounded')).join('')}</div></section>`;
    case 'TESTIMONIALS':
      return `<section class="wrap"><h2>${esc(d.title || 'What parents say')}</h2><div class="grid cards">${(d.items || []).map((i: any) => `<div class="card"><p>“${esc(i.text)}”</p><small>${esc(i.name)}</small></div>`).join('')}</div></section>`;
    case 'TEXT':
      return `<section class="wrap">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${rich(d.body)}</section>`;
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
  return `<section class="wrap" id="contact"><h2>${esc(title || 'Contact us')}</h2><div class="grid cards">
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
    input = `<input id="${id}" name="${esc(f.key)}" type="file" accept="image/*" data-photo="1" ${req}>`;
  } else {
    const t = f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
    input = `<input id="${id}" name="${esc(f.key)}" type="${t}" placeholder="${esc(f.placeholder || '')}" maxlength="300" ${req}>`;
  }
  return `<div class="field">${label}${input}</div>`;
}

const BLOCKS_BY_PAGE: Record<string, string[]> = {
  home: ['HERO', 'STATS', 'FEATURES', 'ADMISSION_CTA', 'TESTIMONIALS'],
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

export function renderSiteHtml(p: any, page: string = 'home'): string {
  const t = p.theme;
  const api = `/api/v1/public/sites/${encodeURIComponent(p.slug)}`;
  const groups: Array<[string, string]> = [['applicant', "Child's details"], ['parent', 'Parent / guardian'], ['custom', 'Additional information']];
  const pages = availablePages(p);

  // ---- body for this page ----
  let body = '';
  const wanted = BLOCKS_BY_PAGE[page] || [];
  const blocks = (p.blocks || []).filter((b: any) => wanted.includes(b.type));
  // The hero only exists on the home page; other pages get a slim title banner instead.
  if (page !== 'home') {
    body += `<header class="banner"><div class="wrap"><h1>${esc(PAGE_LABEL[page])}</h1></div></header>`;
  }
  body += blocks.map((b: any) => blockHtml(b, p)).join('\n');

  // Pages with nothing to show yet get a friendly message instead of a blank screen.
  if (page !== 'admissions' && page !== 'contact' && !blocks.length) {
    body += `<section class="wrap"><div class="card"><p>This page is being updated. Please check back soon.</p></div></section>`;
  }

  if (page === 'contact' && !blocks.length) body += contactHtml(p);

  if (page === 'admissions') {
    body += p.admissions.open
      ? `<section class="wrap" id="apply"><h2>Apply for admission</h2>${p.admissions.intro ? `<p>${esc(p.admissions.intro)}</p>` : ''}
<form id="applyForm" class="card" novalidate>
${groups.map(([sec, title]) => {
  const fs = p.admissions.fields.filter((f: any) => f.section === sec);
  return fs.length ? `<fieldset><legend>${title}</legend><div class="fgrid">${fs.map(fieldHtml).join('')}</div></fieldset>` : '';
}).join('')}
<input type="text" name="website_url" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<div id="msg" role="alert"></div>
<button class="btn" type="submit">Submit application</button>
</form></section>`
      : `<section class="wrap"><div class="card"><h3>Admissions are currently closed</h3><p>Please check back later or <a href="${pageHref(p.slug, 'contact')}">contact the school</a>.</p></div></section>`;

    body += `<section class="wrap" id="status"><h2>Check application status</h2><form id="statusForm" class="card fgrid">
<div class="field"><label for="appNo">Application number</label><input id="appNo" name="applicationNumber" placeholder="APP-2026-XXXXXX" required></div>
<div class="field"><label for="appPhone">Parent phone number</label><input id="appPhone" name="phone" type="tel" required></div>
<div class="field" style="align-self:end"><button class="btn" type="submit">Check</button></div></form><div id="statusOut"></div></section>`;
  }

  // ---- chrome ----
  const nav = `<nav class="nav" aria-label="Main"><div class="navin">
  <a class="brand" href="${pageHref(p.slug, 'home')}">${p.school.logo ? img(p.school.logo, '', 'navlogo') : ''}<span>${esc(p.school.name)}</span></a>
  <input type="checkbox" id="menu" class="menu-toggle" aria-label="Toggle menu"><label for="menu" class="burger" aria-hidden="true">☰</label>
  <div class="links">
    ${pages.map((pg) => `<a href="${pageHref(p.slug, pg)}"${pg === page ? ' class="on" aria-current="page"' : ''}>${PAGE_LABEL[pg]}</a>`).join('')}
    ${p.portalUrl ? `<a class="portal" href="${esc(p.portalUrl)}">Portal login</a>` : ''}
  </div></div></nav>`;

  const social = Object.entries(p.socials || {}).filter(([, v]) => safeUrl(v)).map(([k, v]) => `<a href="${esc(safeUrl(v))}" rel="noopener" target="_blank">${esc(k)}</a>`).join(' · ');
  const footer = `<footer><div class="wrap fgrid2">
  <div><b>${esc(p.school.name)}</b>${p.school.motto ? `<br><small>${esc(p.school.motto)}</small>` : ''}</div>
  <div>${pages.map((pg) => `<a href="${pageHref(p.slug, pg)}">${PAGE_LABEL[pg]}</a>`).join(' · ')}${p.portalUrl ? ` · <a href="${esc(p.portalUrl)}">Portal</a>` : ''}</div>
  <div>${p.school.phone ? `<a href="tel:${esc(p.school.phone)}">${esc(p.school.phone)}</a>` : ''}${p.school.email ? `<br><a href="mailto:${esc(p.school.email)}">${esc(p.school.email)}</a>` : ''}</div>
  </div>
  <div class="copy">${social ? social + '<br>' : ''}© ${new Date().getFullYear()} ${esc(p.school.name)} · Powered by SchoolFlow</div></footer>`;

  const canonical = p.canonicalUrl + (page === 'home' ? '' : '/' + page);
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'School', name: p.school.name, url: p.canonicalUrl,
    telephone: p.school.phone || undefined, email: p.school.email || undefined,
    address: p.school.address ? { '@type': 'PostalAddress', streetAddress: p.school.address, addressLocality: p.school.city || undefined, addressRegion: p.school.state || undefined } : undefined,
  }).replace(/</g, '\\u003c');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle(page, p))}</title><meta name="description" content="${esc(p.seo.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(pageTitle(page, p))}"><meta property="og:description" content="${esc(p.seo.description)}"><meta property="og:type" content="website">
${p.school.logo ? `<link rel="icon" href="${esc(p.school.logo)}"><meta property="og:image" content="${esc(p.school.logo)}">` : ''}
<script type="application/ld+json">${ld}</script>
<style>
:root{--p:${esc(t.primaryColor)};--s:${esc(t.secondaryColor)}}
*{box-sizing:border-box}body{margin:0;font-family:${esc(t.fontFamily)};color:#1f2937;line-height:1.6;background:#fafafa}
.wrap{max-width:1040px;margin:0 auto;padding:40px 20px}h1{font-size:clamp(28px,5vw,48px);margin:.2em 0}h2{color:var(--p);margin:0 0 16px}
.nav{position:sticky;top:0;z-index:20;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.08)}.navin{max-width:1040px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--p);text-decoration:none}.navlogo{width:36px;height:36px;object-fit:contain}
.links{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.links a{padding:8px 12px;border-radius:8px;text-decoration:none;color:#374151;font-weight:600}.links a.on,.links a:hover{background:#f3f4f6;color:var(--p)}
.links a.portal{background:var(--p);color:#fff}.links a.portal:hover{opacity:.9;color:#fff}
.menu-toggle{display:none}.burger{display:none;font-size:26px;cursor:pointer}
.hero{background:var(--p);color:#fff;text-align:center;background-size:cover;background-position:center}.hero .wrap{padding:72px 20px}.hero .lead{font-size:1.15rem;opacity:.95;max-width:640px;margin:0 auto 24px}
.banner{background:var(--p);color:#fff;text-align:center}.banner .wrap{padding:28px 20px}.banner h1{margin:0;font-size:clamp(24px,4vw,36px)}
.actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.logo{width:88px;height:88px;object-fit:contain;background:#fff;border-radius:16px;padding:6px}
.btn{display:inline-block;background:var(--s);color:#111;padding:12px 26px;border-radius:999px;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:1rem}.btn.alt{background:#fff}.btn.ghost{background:transparent;color:#fff;border:2px solid #fff}.btn.wa{background:#25d366;color:#fff}
.pill{background:rgba(255,255,255,.2);padding:8px 16px;border-radius:999px}
.two{display:grid;gap:28px;grid-template-columns:1fr 1fr;align-items:center}.rounded{width:100%;border-radius:16px;object-fit:cover}
.stats{background:var(--p);color:#fff}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.stat{text-align:center}.stat b{display:block;font-size:2.2rem}
.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.08)}.card h3{margin-top:0;color:var(--p)}
.chips{display:flex;flex-wrap:wrap;gap:10px}.chip{background:#fff;border:1px solid var(--p);color:var(--p);padding:6px 14px;border-radius:999px}
.cta{background:var(--p);color:#fff;text-align:center}.gallery img{height:200px}
fieldset{border:0;padding:0;margin:0 0 20px}legend{font-weight:700;color:var(--p);margin-bottom:10px}
.fgrid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.field label{display:block;font-size:.9rem;margin-bottom:4px}.field i{color:#dc2626}
input,select,textarea{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font:inherit;background:#fff}
#msg{margin:10px 0;font-weight:600}.err{color:#b91c1c}.ok{color:#047857}
footer{background:#111827;color:#d1d5db;margin-top:24px}footer a{color:#fff}.fgrid2{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));padding:32px 20px}.copy{text-align:center;padding:16px 20px;border-top:1px solid #374151;font-size:.85rem;color:#9ca3af}
a{color:var(--p)}
@media(max-width:720px){.two{grid-template-columns:1fr}.hero .wrap{padding:48px 20px}.burger{display:block}.links{display:none;width:100%;flex-direction:column;align-items:stretch}.menu-toggle:checked~.links{display:flex}}
</style></head><body>
${nav}
${body}
${footer}
<script>
(function(){
var API=${JSON.stringify(api)};
function resize(file,cb){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var m=800,w=im.width,h=im.height;if(w>m||h>m){var k=Math.min(m/w,m/h);w=Math.round(w*k);h=Math.round(h*k)}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);cb(c.toDataURL('image/jpeg',0.85))};im.onerror=function(){cb(null)};im.src=r.result};r.readAsDataURL(file)}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
var f=document.getElementById('applyForm');
if(f)f.addEventListener('submit',function(e){e.preventDefault();var msg=document.getElementById('msg');msg.className='';msg.textContent='Submitting…';
 var body={};new FormData(f).forEach(function(v,k){if(typeof v==='string')body[k]=v});
 var ph=f.querySelector('input[data-photo]');
 function send(){fetch(API+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(j){
  if(j.success){while(f.firstChild)f.removeChild(f.firstChild);f.appendChild(el('h3','ok','Application received ✔'));f.appendChild(el('p','',j.data.message||''));var p=el('p','','Your application number is ');p.appendChild(el('b','',String(j.data.applicationNumber)));p.appendChild(document.createTextNode('. Keep it to check your status.'));f.appendChild(p)}
  else{msg.className='err';msg.textContent=j.message||'Could not submit. Please check the form.'}}).catch(function(){msg.className='err';msg.textContent='Network error. Please try again.'})}
 if(ph&&ph.files&&ph.files[0]){resize(ph.files[0],function(d){if(d)body[ph.name]=d;send()})}else send()});
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
