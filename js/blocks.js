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
  const readImage = (file, max, quality) => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
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

  // gallery on public pages: one big photo with arrows (and a counter); a click opens the photo full size
  const slider = b => {
    const n = b.gallery.length;
    return `<div class="pf-slider" data-sl="${b.id}">
      <button class="pf-thumb sl-main" data-pr="zoom" data-b="${b.id}" data-i="0" aria-label="Open photo"><img src="${b.gallery[0]}" alt=""></button>
      ${n > 1 ? `<button class="sl-btn prev" data-sl-go="-1" data-b="${b.id}" aria-label="Previous photo">‹</button>
        <button class="sl-btn next" data-sl-go="1" data-b="${b.id}" aria-label="Next photo">›</button>` : ''}
      <span class="sl-count">${n > 1 ? `1 / ${n}` : ''}</span>
    </div>`;
  };
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
  function slide(box, b, delta) { // move the in-page slider
    const main = box.querySelector('.sl-main'), i = wrap(+main.dataset.i + delta, b.gallery.length);
    main.dataset.i = i; main.querySelector('img').src = b.gallery[i];
    box.querySelector('.sl-count').textContent = `${i + 1} / ${b.gallery.length}`;
  }

  // how a block looks to visitors; opts.title === false leaves the title out (a post page has its own heading)
  function publicHtml(b, opts = {}) {
    const text = sanitize(b.html);
    return `<section class="pf-block">
      ${b.hero ? `<img class="pf-hero" src="${b.hero}" alt="">` : ''}
      ${b.title && opts.title !== false ? `<h2>${esc(b.title)}</h2>` : ''}
      ${text ? `<div class="rich">${text}</div>` : ''}
      ${b.gallery.length ? slider(b) : ''}
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
    const go = e.target.closest('[data-sl-go]');
    if (go) { // arrows of the in-page gallery
      const f = find(go.dataset.b);
      if (f) slide(go.closest('.pf-slider'), f.b, +go.dataset.slGo);
      return;
    }
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
    if (kind === 'hero') { const img = await readImage(files[0], 1400, 0.75); if (img) { b.hero = img; commit(f.p); redraw(); } }
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
    status: '', register: p => providers.push(p), find, sanitize, videoOf, videoHtml, sizeOf, readImage, newBlock, bodyHtml, publicHtml, setStatus, commitSoon, commit, MAX_GALLERY
  };
  window.KitchensBlocks = api;
})();
