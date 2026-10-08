/* Shared "content block" tools, used by the About Us profiles and by the Blog.
   A block (or a blog post) has: title, hero image, rich text (WYSIWYG), gallery, documents, video link.
   - bodyHtml(b)        the editor for one block's content
   - publicHtml(b)      how it looks to visitors
   - register(provider) a page tells this module where its blocks live: { find(id) -> block, commit() -> saved? }
   All editor events (toolbar, typing, uploads, removals, lightbox) are handled here for every registered provider.
   Prototype: images are downscaled and documents limited in size because the browser storage is small (~5 MB for the whole site). */
(function () {
  'use strict';

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const MAX_DOC = 600 * 1024;       // bytes per document
  const MAX_GALLERY = 12;
  const providers = [];
  const find = id => { for (const p of providers) { const b = p.find(id); if (b) return { b, p }; } return null; };

  /* ---------- text sanitising (rich text is stored as HTML, so only a safe subset is kept) ---------- */
  const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO']);
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html'), out = document.createElement('div');
    const walk = (src, dst) => src.childNodes.forEach(n => {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.textContent)); return; }
      if (n.nodeType !== 1 || DROP.has(n.tagName)) return;
      if (ALLOWED.has(n.tagName)) {
        const el = document.createElement(n.tagName.toLowerCase());
        if (n.tagName === 'A') {
          const h = (n.getAttribute('href') || '').trim();
          if (/^(https?:|mailto:)/i.test(h)) { el.setAttribute('href', h); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
        }
        walk(n, el); dst.appendChild(el);
      } else if (n.tagName === 'DIV') { const p = document.createElement('p'); walk(n, p); dst.appendChild(p); }
      else walk(n, dst); // unknown tag (span, font…): keep the text only
    });
    walk(doc.body, out);
    // a heading / paragraph may not contain lists, quotes or other blocks (editor commands can produce that): unwrap it
    for (let guard = 0; guard < 20; guard++) {
      const bad = [...out.querySelectorAll('h2,h3,h4,p')].find(el => el.querySelector('ul,ol,blockquote,h2,h3,h4,p'));
      if (!bad) break;
      bad.replaceWith(...bad.childNodes);
    }
    return out.innerHTML;
  }

  /* ---------- video links ---------- */
  function videoOf(url) {
    url = (url || '').trim();
    let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${m[1]}`, host: 'YouTube' };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: 'embed', src: `https://player.vimeo.com/video/${m[1]}`, host: 'Vimeo' };
    if (/^https?:\/\//i.test(url)) return { kind: 'link', src: url, host: 'link' };
    return null;
  }
  const videoHtml = url => {
    const v = videoOf(url);
    if (!v) return '';
    return v.kind === 'embed'
      ? `<div class="pf-video"><iframe src="${esc(v.src)}" title="Video" loading="lazy" allowfullscreen allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
      : `<p><a class="link" href="${esc(v.src)}" target="_blank" rel="noopener noreferrer">▶ Watch the video</a></p>`;
  };
  const previewVideo = url => !url ? '' : videoOf(url) ? videoHtml(url) : '<p class="hint" style="color:var(--bad)">This does not look like a link (it must start with https://).</p>';

  /* ---------- files ---------- */
  // ratio (optional, width / height): the picture is cropped around its centre to that shape
  const readImage = (file, max, quality, ratio) => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ratio) { // crop to the wanted shape
          if (sw / sh > ratio) { sw = Math.round(sh * ratio); sx = Math.round((img.width - sw) / 2); }
          else { sh = Math.round(sw / ratio); sy = Math.round((img.height - sh) / 2); }
        }
        const s = Math.min(1, max / Math.max(sw, sh)), cv = document.createElement('canvas');
        cv.width = Math.round(sw * s); cv.height = Math.round(sh * s);
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
  const readFile = file => new Promise(res => { const fr = new FileReader(); fr.onerror = () => res(null); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
  const sizeOf = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';

  const newBlock = (title, html, extra = {}) => ({ id: uid(), title, html, hero: '', gallery: [], docs: [], video: '', visible: true, ...extra });

  /* ---------- rendering ---------- */
  const TOOLBAR = [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'], ['h2', 'H2', 'Heading'], ['h3', 'H3', 'Subheading'], ['p', '¶', 'Paragraph'],
    ['ul', '• List', 'Bulleted list'], ['ol', '1. List', 'Numbered list'], ['quote', '❝', 'Quote'], ['link', '🔗', 'Insert link'], ['unlink', '⛓', 'Remove link'], ['clear', '✕ Format', 'Clear formatting']];

  // editor for the content of one block; opts.title === false hides the title field (the page shows its own)
  function bodyHtml(b, opts = {}) {
    if (isBanner(b)) return bannerBody(b);
    return `
        ${opts.title === false ? '' : `<label class="stack">Title<input data-abf="title" data-b="${b.id}" value="${esc(b.title)}" maxlength="120" placeholder="Title"></label>`}

        <div class="ab-sec"><h4>Hero image</h4>
          ${b.hero ? `<div class="ab-hero"><img src="${b.hero}" alt=""><button class="x" data-ab="rm-hero" data-b="${b.id}" title="Remove">×</button></div>` : ''}
          <label class="btn small">${b.hero ? 'Replace image' : 'Upload hero image'}<input type="file" accept="image/*" hidden data-abu="hero" data-b="${b.id}"></label></div>

        <div class="ab-sec"><h4>Text</h4>
          <div class="wy-bar" data-b="${b.id}">${TOOLBAR.map(([c, l, t]) => `<button type="button" class="wy-btn" data-wy="${c}" title="${t}">${l}</button>`).join('')}</div>
          <div class="wy rich" contenteditable="true" data-wyed="${b.id}" data-placeholder="Write something…">${sanitize(b.html)}</div></div>

        <div class="ab-sec"><h4>Gallery <small class="sub">${b.gallery.length}/${MAX_GALLERY}</small></h4>
          <div class="p-photos">${b.gallery.map((g, k) => `<div class="ph"><img src="${g}" alt=""><button class="x" data-ab="rm-photo" data-b="${b.id}" data-k="${k}" title="Remove">×</button></div>`).join('')}
            ${b.gallery.length < MAX_GALLERY ? `<label class="ph add" title="Add photos">+<input type="file" accept="image/*" multiple hidden data-abu="gallery" data-b="${b.id}"></label>` : ''}</div></div>

        <div class="ab-sec"><h4>Documents <small class="sub">PDF, Word, Excel… up to ${sizeOf(MAX_DOC)} each</small></h4>
          ${b.docs.map(d => `<div class="ab-doc">📄 <span>${esc(d.name)}</span> <small class="sub">${sizeOf(d.size)}</small><button class="x" data-ab="rm-doc" data-b="${b.id}" data-did="${d.id}" title="Remove">×</button></div>`).join('')}
          <label class="btn small">+ Upload documents<input type="file" multiple hidden data-abu="docs" data-b="${b.id}"></label></div>

        <div class="ab-sec"><h4>Video</h4>
          <input data-abf="video" data-b="${b.id}" value="${esc(b.video)}" placeholder="Link from YouTube or Vimeo, e.g. https://youtu.be/…">
          <div id="vp-${b.id}">${previewVideo(b.video)}</div></div>`;
  }

  const wrap = (i, n) => (i + n) % n;
  let lb = null; // photo open full size: { b, i }
  function showLightbox() {
    let m = document.getElementById('prModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'prModal'; document.body.appendChild(m); }
    const n = lb.b.gallery.length;
    m.innerHTML = `<div class="modal-card lightbox"><button type="button" class="close" data-close>×</button>
      ${n > 1 ? '<button class="sl-btn prev" data-lb-go="-1" aria-label="Previous photo">‹</button><button class="sl-btn next" data-lb-go="1" aria-label="Next photo">›</button>' : ''}
      <img src="${lb.b.gallery[lb.i]}" alt=""><span class="sl-count">${n > 1 ? `${lb.i + 1} / ${n}` : ''}</span></div>`;
    m.hidden = false;
  }
  /* ---------- banner: sliding 16:9 images with a big text over each (Home page and About Us profiles) ---------- */
  const MAX_SLIDES = 12;
  const emptySlide = () => ({ image: '', title: '', text: '', button: '', link: '' });
  const isBanner = b => !!b && b.type === 'banner';
  const newBanner = () => newBlock('Banner', '', { type: 'banner', slides: [emptySlide()], interval: 5 });
  const linkOk = l => /^(https?:\/\/\S+|#[\w\/-]+)$/.test(l || '');
  // tag: the heading level of the big text (H1 on the Home page, H2 on pages that have their own H1)
  function bannerHtml(b, tag = 'h1') {
    const slides = (b.slides || []).filter(s => s.image || s.title);
    if (!slides.length) return '';
    return `<section class="bn" data-bn="${esc(b.id)}" data-n="${slides.length}" data-i="0" data-every="${+b.interval || 5}" data-t="0" aria-roledescription="carousel">
      ${slides.map((s, i) => `<div class="bn-slide ${i === 0 ? 'on' : ''}">
        ${s.image ? `<img src="${s.image}" alt="" ${i ? 'loading="lazy"' : ''}>` : ''}
        <div class="bn-cap">
          ${s.title ? `<${tag}>${esc(s.title)}</${tag}>` : ''}
          ${s.text ? `<p>${esc(s.text)}</p>` : ''}
          ${s.button && linkOk(s.link) ? `<a class="btn primary" href="${esc(s.link)}" ${s.link[0] === '#' ? '' : 'target="_blank" rel="noopener noreferrer"'}>${esc(s.button)}</a>` : ''}
        </div></div>`).join('')}
      ${slides.length > 1 ? `<button class="sl-btn prev" data-bn-go="-1" aria-label="Previous slide">‹</button><button class="sl-btn next" data-bn-go="1" aria-label="Next slide">›</button>
        <div class="bn-dots">${slides.map((s, i) => `<button class="${i === 0 ? 'on' : ''}" data-bn-to="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
    </section>`;
  }
  function bnShow(el, i) {
    const n = +el.dataset.n; i = (i + n) % n;
    el.dataset.i = i; el.dataset.t = 0;
    el.querySelectorAll('.bn-slide').forEach((s, k) => s.classList.toggle('on', k === i));
    el.querySelectorAll('.bn-dots button').forEach((d, k) => d.classList.toggle('on', k === i));
  }
  // one timer for every banner on the page (a banner that is not in the page any more simply is not found); pauses under the mouse
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setInterval(() => {
    if (still || document.hidden) return;
    document.querySelectorAll('.bn').forEach(el => {
      if (+el.dataset.n < 2 || el.matches(':hover, :focus-within')) return;
      el.dataset.t = +el.dataset.t + 1;
      if (+el.dataset.t >= +el.dataset.every) bnShow(el, +el.dataset.i + 1);
    });
  }, 1000);

  function slideEditor(b, s, k) {
    return `<div class="bn-ed">
      <div class="bn-ed-img">${s.image ? `<img src="${s.image}" alt="">` : '<div class="no-photo">16:9</div>'}
        <label class="btn small">${s.image ? 'Replace image' : 'Upload image'}<input type="file" accept="image/*" hidden data-hmu="slide" data-b="${b.id}" data-s="${k}"></label></div>
      <div class="bn-ed-fields">
        <label class="stack">Big text over the image<input data-hms="title" data-b="${b.id}" data-s="${k}" value="${esc(s.title)}" maxlength="200" placeholder="e.g. Kitchens made to measure"></label>
        <label class="stack">Smaller text (optional)<input data-hms="text" data-b="${b.id}" data-s="${k}" value="${esc(s.text)}" maxlength="400"></label>
        <div class="two"><label class="stack">Button text (optional)<input data-hms="button" data-b="${b.id}" data-s="${k}" value="${esc(s.button)}" maxlength="60" placeholder="e.g. Send a request"></label>
          <label class="stack">Button link<input data-hms="link" data-b="${b.id}" data-s="${k}" value="${esc(s.link)}" placeholder="#request or https://…"></label></div>
      </div>
      <div class="bn-ed-act"><button class="btn small" data-bx="s-up" data-b="${b.id}" data-s="${k}" ${k === 0 ? 'disabled' : ''} title="Move earlier">←</button>
        <button class="btn small" data-bx="s-down" data-b="${b.id}" data-s="${k}" ${k === b.slides.length - 1 ? 'disabled' : ''} title="Move later">→</button>
        <button class="link danger-t" data-bx="s-del" data-b="${b.id}" data-s="${k}">remove</button></div>
    </div>`;
  }
  // editor for a banner block (the page puts its own header with move / hide / delete around it)
  function bannerBody(b) {
    b.slides = b.slides || []; b.interval = +b.interval || 5;
    return `<label class="stack">Name (only you see it)<input data-abf="title" data-b="${b.id}" value="${esc(b.title)}" maxlength="120"></label>
    <div class="ab-sec"><h4>Slides <small class="sub">${b.slides.length}/${MAX_SLIDES} · images are cut to 16:9</small></h4>
      ${b.slides.map((s, k) => slideEditor(b, s, k)).join('')}
      ${b.slides.length < MAX_SLIDES ? `<button class="btn small" data-bx="s-add" data-b="${b.id}">+ Add slide</button>` : ''}</div>
    <div class="ab-sec"><h4>Autoplay</h4>
      <label class="inline-sel">Change the slide every <select data-hmi="${b.id}">${[3, 4, 5, 6, 8, 10, 15].map(n => `<option ${n === b.interval ? 'selected' : ''}>${n}</option>`).join('')}</select> seconds</label></div>`;
  }

  // how a block looks to visitors; opts.title === false leaves the title out (a post page has its own heading)
  function publicHtml(b, opts = {}) {
    if (isBanner(b)) return bannerHtml(b, opts.bannerTag || 'h1');
    const text = sanitize(b.html);
    return `<section class="pf-block">
      ${b.hero ? `<img class="pf-hero" src="${b.hero}" alt="">` : ''}
      ${b.title && opts.title !== false ? `<h2>${esc(b.title)}</h2>` : ''}
      ${text ? `<div class="rich">${text}</div>` : ''}
      ${b.gallery.length ? `<div class="pf-gallery">${b.gallery.map((g, i) => `<button class="pf-thumb" data-pr="zoom" data-b="${b.id}" data-i="${i}" aria-label="Open photo"><img src="${g}" alt=""></button>`).join('')}</div>` : ''}
      ${videoHtml(b.video)}
      ${b.docs.length ? `<div class="pf-docs"><h4>Documents</h4>${b.docs.map(d => `<a class="pf-doc" href="${d.data}" download="${esc(d.name)}">📄 <span>${esc(d.name)}</span> <small>${sizeOf(d.size)}</small></a>`).join('')}</div>` : ''}
    </section>`;
  }

  /* ---------- saving ---------- */
  let timer;
  const setStatus = (ok, msg) => {
    const text = msg || (ok ? 'Saved ✓' : '⚠ Not saved: the browser storage is full. Remove some images or documents.');
    const el = document.getElementById('abStatus'); if (el) { el.textContent = text; el.style.color = ok ? '' : 'var(--bad)'; }
    api.status = text;
  };
  const commit = p => setStatus(p.commit());
  const commitSoon = p => { clearTimeout(timer); timer = setTimeout(() => commit(p), 400); };
  const redraw = () => K().render();

  /* ---------- rich-text editor commands ---------- */
  const syncEditor = ed => { const f = find(ed.dataset.wyed); if (f) { f.b.html = sanitize(ed.innerHTML); commitSoon(f.p); } };
  function exec(cmd, ed) {
    ed.focus();
    switch (cmd) {
      case 'bold': case 'italic': case 'underline': document.execCommand(cmd); break;
      case 'h2': case 'h3': case 'p': document.execCommand('formatBlock', false, cmd.toUpperCase()); break;
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'quote': document.execCommand('formatBlock', false, 'BLOCKQUOTE'); break;
      case 'unlink': document.execCommand('unlink'); break;
      case 'clear': document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'P'); break;
      case 'link': {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { alert('Select the text to turn into a link first.'); break; }
        const url = prompt('Link address (https://…)', 'https://');
        if (url && /^(https?:|mailto:)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
        else if (url) alert('The link must start with https:// or mailto:');
        break;
      }
    }
    syncEditor(ed);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const lgo = e.target.closest('[data-lb-go]');
    if (lgo && lb) { lb.i = wrap(lb.i + +lgo.dataset.lbGo, lb.b.gallery.length); showLightbox(); return; }
    const zoom = e.target.closest('[data-pr=zoom]');
    if (zoom) { // photo full size
      const f = find(zoom.dataset.b);
      if (!f) return;
      lb = { b: f.b, i: +zoom.dataset.i || 0 };
      showLightbox();
      return;
    }
    const wy = e.target.closest('[data-wy]');
    if (wy) { exec(wy.dataset.wy, document.querySelector(`[data-wyed="${wy.closest('.wy-bar').dataset.b}"]`)); return; }

    const el = e.target.closest('[data-ab]');
    if (!el || !['rm-hero', 'rm-photo', 'rm-doc'].includes(el.dataset.ab)) return;
    const d = el.dataset, f = find(d.b);
    if (!f) return;
    if (d.ab === 'rm-hero') f.b.hero = '';
    if (d.ab === 'rm-photo') f.b.gallery.splice(+d.k, 1);
    if (d.ab === 'rm-doc') f.b.docs = f.b.docs.filter(x => x.id !== d.did);
    commit(f.p); redraw();
  });

  // arrow keys flip the photo open full size
  document.addEventListener('keydown', e => {
    const m = document.getElementById('prModal');
    if (!lb || !m || m.hidden || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    lb.i = wrap(lb.i + (e.key === 'ArrowRight' ? 1 : -1), lb.b.gallery.length); showLightbox();
  });

  // banner: arrows and dots on the page
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-bn-go], [data-bn-to]');
    if (go) {
      const el = go.closest('.bn');
      bnShow(el, go.dataset.bnTo !== undefined ? +go.dataset.bnTo : +el.dataset.i + +go.dataset.bnGo);
      return;
    }
    const x = e.target.closest('[data-bx]'); // slide buttons in the editor
    if (!x) return;
    const f = find(x.dataset.b), k = +x.dataset.s;
    if (!f || !f.b.slides) return;
    const s = f.b.slides;
    switch (x.dataset.bx) {
      case 's-add': if (s.length >= MAX_SLIDES) return; s.push(emptySlide()); break;
      case 's-del': if (!confirm('Remove this slide?')) return; s.splice(k, 1); break;
      case 's-up': case 's-down': { const j = x.dataset.bx === 's-up' ? k - 1 : k + 1; if (j < 0 || j >= s.length) return; [s[k], s[j]] = [s[j], s[k]]; break; }
      default: return;
    }
    commit(f.p); redraw();
  });
  // banner: text fields, autoplay time and slide images in the editor
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset || t.dataset.hms === undefined) return;
    const f = find(t.dataset.b), s = f && f.b.slides && f.b.slides[+t.dataset.s];
    if (s) { s[t.dataset.hms] = t.value; commitSoon(f.p); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.hmi) { const f = find(t.dataset.hmi); if (f) { f.b.interval = +t.value; commit(f.p); } return; }
    if (t.dataset.hmu === 'slide') {
      const f = find(t.dataset.b), s = f && f.b.slides && f.b.slides[+t.dataset.s], file = t.files[0]; t.value = '';
      if (!s || !file) return;
      const img = await readImage(file, 1600, 0.72, 16 / 9);
      if (img) { s.image = img; commit(f.p); redraw(); } else alert('This file could not be read as an image.');
    }
  });

  // keep the editor selection when a toolbar button is pressed
  document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('[data-wy]')) e.preventDefault(); });

  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.wyed) { syncEditor(t); return; }
    if (t.dataset.abf) { // title / video link
      const f = find(t.dataset.b);
      if (!f) return;
      f.b[t.dataset.abf] = t.value; commitSoon(f.p);
      if (t.dataset.abf === 'video') document.getElementById('vp-' + f.b.id).innerHTML = previewVideo(t.value);
      if (t.dataset.abf === 'title') { const h = t.closest('.ab-block') && t.closest('.ab-block').querySelector('header h3'); if (h) h.textContent = t.value || 'Untitled block'; }
    }
  });

  // paste and drop as plain text into the editor: no foreign styles, scripts or event handlers can get in
  document.addEventListener('paste', e => {
    const ed = e.target.closest && e.target.closest('[data-wyed]');
    if (!ed) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  document.addEventListener('drop', e => {
    const ed = e.target.closest && e.target.closest('[data-wyed]');
    if (!ed) return;
    e.preventDefault();
    const text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (text) { ed.focus(); document.execCommand('insertText', false, text); }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (!t.dataset || !['hero', 'gallery', 'docs'].includes(t.dataset.abu)) return;
    const f = find(t.dataset.b);
    if (!f) return;
    const kind = t.dataset.abu, files = [...t.files], b = f.b; t.value = '';
    if (kind === 'hero') { const img = await readImage(files[0], 1400, 0.75, 16 / 9); if (img) { b.hero = img; commit(f.p); redraw(); } }
    if (kind === 'gallery') {
      const room = MAX_GALLERY - b.gallery.length;
      const imgs = (await Promise.all(files.slice(0, room).map(x => readImage(x, 900, 0.7)))).filter(Boolean);
      if (imgs.length) { b.gallery.push(...imgs); commit(f.p); redraw(); }
    }
    if (kind === 'docs') {
      const big = [];
      for (const x of files) {
        if (x.size > MAX_DOC) { big.push(x.name); continue; }
        const data = await readFile(x);
        if (data) b.docs.push({ id: uid(), name: x.name, size: x.size, type: x.type, data });
      }
      if (big.length) alert(`These files are too large (max ${sizeOf(MAX_DOC)} each): ${big.join(', ')}`);
      commit(f.p); redraw();
    }
  });

  const api = {
    status: '', register: p => providers.push(p), find, sanitize, videoOf, videoHtml, sizeOf, readImage, newBlock, newBanner, isBanner, bodyHtml, publicHtml, setStatus, commitSoon, commit, MAX_GALLERY
  };
  window.KitchensBlocks = api;
})();
