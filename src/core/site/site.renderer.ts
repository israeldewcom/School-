// src/core/site/site.renderer.ts
//
// Server-rendered school website. Works immediately at /s/<school-name> with no
// frontend build; a separate Next/Vite frontend can instead consume the same
// data from GET /api/v1/public/sites/:slug.
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

function blockHtml(b: any, p: any): string {
  const d = b.data || {};
  switch (b.type) {
    case 'HERO': {
      const bg = safeUrl(d.image) || safeUrl(p.theme.heroImage);
      return `<header class="hero" style="${bg ? `background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${esc(bg)}')` : ''}">
  <div class="wrap">${p.school.logo ? img(p.school.logo, p.school.name, 'logo') : ''}
  <h1>${esc(d.headline || p.school.name)}</h1><p class="lead">${esc(d.subheadline || '')}</p>
  ${p.admissions.open ? `<a class="btn" href="#apply">${esc(d.ctaLabel || 'Apply for admission')}</a>` : '<span class="pill">Admissions are currently closed</span>'}
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
        ? `<section class="cta"><div class="wrap"><h2>${esc(d.title || 'Admissions are open')}</h2><p>${esc(d.text || '')}</p><a class="btn alt" href="#apply">${esc(d.ctaLabel || 'Start application')}</a></div></section>`
        : '';
    case 'CONTACT':
      return `<section class="wrap" id="contact"><h2>${esc(d.title || 'Contact us')}</h2><div class="card">
        ${p.school.address ? `<p>📍 ${esc(p.school.address)}${p.school.city ? ', ' + esc(p.school.city) : ''}${p.school.state ? ', ' + esc(p.school.state) : ''}</p>` : ''}
        ${p.school.phone ? `<p>📞 <a href="tel:${esc(p.school.phone)}">${esc(p.school.phone)}</a></p>` : ''}
        ${p.school.email ? `<p>✉️ <a href="mailto:${esc(p.school.email)}">${esc(p.school.email)}</a></p>` : ''}</div></section>`;
    default:
      return '';
  }
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

export function renderSiteHtml(p: any): string {
  const t = p.theme;
  const api = `/api/v1/public/sites/${encodeURIComponent(p.slug)}`;
  const groups: Array<[string, string]> = [['applicant', "Child's details"], ['parent', 'Parent / guardian'], ['custom', 'Additional information']];
  const form = p.admissions.open
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
    : '';

  const status = `<section class="wrap" id="status"><h2>Check application status</h2><form id="statusForm" class="card fgrid">
<div class="field"><label>Application number</label><input name="applicationNumber" placeholder="APP-2026-XXXXXX" required></div>
<div class="field"><label>Parent phone number</label><input name="phone" type="tel" required></div>
<div class="field" style="align-self:end"><button class="btn" type="submit">Check</button></div></form><div id="statusOut"></div></section>`;

  const social = Object.entries(p.socials || {}).filter(([, v]) => safeUrl(v)).map(([k, v]) => `<a href="${esc(safeUrl(v))}" rel="noopener" target="_blank">${esc(k)}</a>`).join(' · ');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.seo.title)}</title><meta name="description" content="${esc(p.seo.description)}">
<link rel="canonical" href="${esc(p.canonicalUrl)}">
<meta property="og:title" content="${esc(p.seo.title)}"><meta property="og:description" content="${esc(p.seo.description)}">
${p.school.logo ? `<link rel="icon" href="${esc(p.school.logo)}">` : ''}
<style>
:root{--p:${esc(t.primaryColor)};--s:${esc(t.secondaryColor)}}
*{box-sizing:border-box}body{margin:0;font-family:${esc(t.fontFamily)};color:#1f2937;line-height:1.6;background:#fafafa}
.wrap{max-width:1040px;margin:0 auto;padding:40px 20px}h1{font-size:clamp(28px,5vw,48px);margin:.2em 0}h2{color:var(--p);margin:0 0 16px}
.hero{background:var(--p);color:#fff;text-align:center;background-size:cover;background-position:center}.hero .wrap{padding:72px 20px}.hero .lead{font-size:1.15rem;opacity:.95;max-width:640px;margin:0 auto 24px}
.logo{width:88px;height:88px;object-fit:contain;background:#fff;border-radius:16px;padding:6px}
.btn{display:inline-block;background:var(--s);color:#111;padding:12px 26px;border-radius:999px;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:1rem}.btn.alt{background:#fff}
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
footer{text-align:center;padding:28px 20px;color:#6b7280;font-size:.9rem}a{color:var(--p)}
@media(max-width:720px){.two{grid-template-columns:1fr}.hero .wrap{padding:48px 20px}}
</style></head><body>
${p.blocks.map((b: any) => blockHtml(b, p)).join('\n')}
${form}
${status}
<footer>${social ? social + '<br>' : ''}© ${new Date().getFullYear()} ${esc(p.school.name)} · Powered by SchoolFlow</footer>
<script>
(function(){
var API=${JSON.stringify(api)};
function resize(file,cb){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var m=800,w=im.width,h=im.height;if(w>m||h>m){var k=Math.min(m/w,m/h);w=Math.round(w*k);h=Math.round(h*k)}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);cb(c.toDataURL('image/jpeg',0.85))};im.onerror=function(){cb(null)};im.src=r.result};r.readAsDataURL(file)}
var f=document.getElementById('applyForm');
if(f)f.addEventListener('submit',function(e){e.preventDefault();var msg=document.getElementById('msg');msg.className='';msg.textContent='Submitting…';
 var body={};new FormData(f).forEach(function(v,k){if(typeof v==='string')body[k]=v});
 var ph=f.querySelector('input[data-photo]');
 function send(){fetch(API+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(j){
  if(j.success){f.innerHTML='<h3 class="ok">Application received ✔</h3><p>'+(j.data.message||'')+'</p><p>Your application number is <b>'+j.data.applicationNumber+'</b>. Keep it to check your status.</p>'}
  else{msg.className='err';msg.textContent=j.message||'Could not submit. Please check the form.'}}).catch(function(){msg.className='err';msg.textContent='Network error. Please try again.'})}
 if(ph&&ph.files&&ph.files[0]){resize(ph.files[0],function(d){if(d)body[ph.name]=d;send()})}else send()});
var s=document.getElementById('statusForm');
if(s)s.addEventListener('submit',function(e){e.preventDefault();var o=document.getElementById('statusOut');var q=new URLSearchParams(new FormData(s));
 fetch(API+'/status?'+q.toString()).then(function(r){return r.json()}).then(function(j){
  if(j.success){var d=j.data;o.innerHTML='<div class="card"><b>'+d.applicantName+'</b> — <span class="ok">'+d.statusLabel+'</span><p>'+d.message+'</p></div>'}
  else{o.innerHTML='<p class="err">'+(j.message||'Not found')+'</p>'}})});
})();
</script></body></html>`;
}

export function renderNotFoundHtml(message = 'We could not find that school.'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School not found</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f3f4f6;color:#1f2937;text-align:center}div{padding:24px}</style></head>
<body><div><h1>School not found</h1><p>${esc(message)}</p><p>Check the spelling of the school's link and try again.</p></div></body></html>`;
}
