/* Profiles — "About Us" (editor tab), the public About Us page and public profile pages.
   Every registered user has a profile (name, position, short bio, photo, contacts) that they edit in the About Us tab,
   plus any number of BLOCKS. A block has: a title, a hero image, rich text (WYSIWYG editor), a photo gallery,
   documents to download, and a link to a video (YouTube / Vimeo are embedded).
   Public routes:  #about (cards of all published profiles)  ·  #profile/<name> (one profile with its blocks)
   Prototype: stored in localStorage; images are downscaled and documents limited in size because the browser
   storage is small (about 5 MB for the whole site). */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || '';
  const slugOf = name => String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'user';
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const MAX_DOC = 600 * 1024;       // bytes per document
  const MAX_GALLERY = 12;

  /* ---------- data ---------- */
  let db; // { [slug]: profile }
  const save = () => { try { localStorage.setItem('profiles', JSON.stringify(db)); return true; } catch (e) { return false; } };

  const block = (title, html, extra = {}) => ({ id: uid(), title, html, hero: '', gallery: [], docs: [], video: '', visible: true, ...extra });
  const seed = () => ({
    [slugOf('A. Smith')]: { owner: 'A. Smith', name: 'Alexey Smith', position: 'Sales manager', bio: 'I help clients choose a kitchen, prepare offers and keep every project on schedule.', email: 'a.smith@example.com', phone: '+7 000 000-00-01', avatar: '', published: true,
      blocks: [block('How I work with clients', '<p>Every project starts with a conversation. I ask about the family, the cooking habits and the budget, then prepare a clear price offer with options.</p><ul><li>Reply within one working day</li><li>Fixed price in the offer</li><li>One contact person from measure to assembly</li></ul>')] },
    [slugOf('B. Jones')]: { owner: 'B. Jones', name: 'Boris Jones', position: 'Kitchen designer', bio: 'Designer of modern and Scandinavian kitchens. I turn measurements and wishes into a working layout.', email: 'b.jones@example.com', phone: '+7 000 000-00-02', avatar: '', published: true,
      blocks: [block('My design approach', '<p>A good kitchen is planned around <b>movement</b>: the work triangle, free space near the stove, and storage where you reach for things most.</p><blockquote>Beautiful and convenient are not opposites.</blockquote>')] },
    [slugOf('C. Brown')]: { owner: 'C. Brown', name: 'Constantin Brown', position: 'Workshop foreman', bio: 'I lead the workshop: cutting, edging, drilling and quality control before delivery.', email: 'c.brown@example.com', phone: '+7 000 000-00-03', avatar: '', published: true,
      blocks: [block('Quality in the workshop', '<p>Every part is checked twice: after cutting and before packing. We use soft-close hardware and PUR glue for edges as standard.</p>')] }
  });
  const init = () => { if (!db) { db = load('profiles', null) || seed(); save(); } };

  const blank = name => ({ owner: name, name, position: '', bio: '', email: '', phone: '', avatar: '', published: true, blocks: [] });

  window.KitchensProfiles = {
    slug: slugOf,
    url: name => '#profile/' + slugOf(name),
    get: name => { init(); return db[slugOf(name)] || null; },
    owners: () => { init(); return Object.values(db).map(p => p.owner); },
    list: () => { init(); return Object.entries(db).filter(([, p]) => p.published).map(([slug, p]) => ({ slug, ...p })); }
  };

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

  /* ---------- public rendering ---------- */
  const avatar = (p, cls = '') => p.avatar ? `<img class="pf-avatar ${cls}" src="${p.avatar}" alt="">` : `<span class="pf-avatar ph-av ${cls}">${esc(initials(p.name))}</span>`;
  const snippet = (t, n = 150) => t.length > n ? t.slice(0, n).trimEnd() + '…' : t;

  function blockPublic(b) {
    const text = sanitize(b.html);
    return `<section class="pf-block">
      ${b.hero ? `<img class="pf-hero" src="${b.hero}" alt="">` : ''}
      ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
      ${text ? `<div class="rich">${text}</div>` : ''}
      ${b.gallery.length ? `<div class="pf-gallery">${b.gallery.map((g, i) => `<button class="pf-thumb" data-pr="zoom" data-b="${b.id}" data-i="${i}" aria-label="Open photo"><img src="${g}" alt=""></button>`).join('')}</div>` : ''}
      ${videoHtml(b.video)}
      ${b.docs.length ? `<div class="pf-docs"><h4>Documents</h4>${b.docs.map(d => `<a class="pf-doc" href="${d.data}" download="${esc(d.name)}">📄 <span>${esc(d.name)}</span> <small>${sizeOf(d.size)}</small></a>`).join('')}</div>` : ''}
    </section>`;
  }

  window.KitchensPages.PublicAbout = () => {
    init();
    const list = window.KitchensProfiles.list();
    return `
    <section class="hero small"><h1>About Us</h1><p>We are a small furniture workshop. Every kitchen is planned, built and installed by the people below.</p></section>
    <div class="grid g3">
      ${list.map(p => `<article class="card pf-card">
        ${avatar(p, 'lg')}
        <h3>${esc(p.name)}</h3>
        <div class="sub">${esc(p.position)}</div>
        <p>${esc(snippet(p.bio))}</p>
        <a class="btn" href="#profile/${esc(p.slug)}">View profile</a>
      </article>`).join('') || '<div class="placeholder">No team profiles yet.</div>'}
    </div>`;
  };

  window.KitchensPages.Profile = slug => {
    init();
    const p = db[slug];
    if (!p) return '<h1>Profile not found</h1><p><a class="link" href="#about">← About Us</a></p>';
    const prods = window.KitchensCatalogue.products().filter(x => x.published && x.author === p.owner);
    return `
    <p><a class="link" href="#about">← About Us</a></p>
    <header class="pf-head card">
      ${avatar(p, 'xl')}
      <div><h1>${esc(p.name)}</h1><div class="sub">${esc(p.position)}</div>
        <p>${esc(p.bio)}</p>
        <div class="pf-contacts">${p.email ? `<a class="pill" href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ''}${p.phone ? `<span class="pill">☎ ${esc(p.phone)}</span>` : ''}</div></div>
    </header>
    ${p.blocks.filter(b => b.visible).map(blockPublic).join('')}
    ${prods.length ? `<section class="pf-block"><h2>Products by ${esc(p.name)}</h2><div class="grid g4">${prods.map(x => `<a class="card pf-prod" href="#catalogue"><b>${esc(x.name)}</b><div class="sub">${esc(x.typeName)}</div><div class="pub-price">${x.price === '' ? 'Price on request' : K().fmt(+x.price) + ' ₽'}</div></a>`).join('')}</div></section>` : ''}`;
  };

  /* ---------- editor (About Us tab) ---------- */
  let target = '';                 // slug being edited
  const collapsed = new Set();
  let status = '';
  window.addEventListener('hashchange', () => { target = ''; status = ''; });

  const editable = () => { // own profile always; other profiles for people who may edit About Us (Edit permission)
    const own = slugOf(me());
    if (!target) target = own;
    if (target !== own && window.KitchensRoles.level(K().getUser(), 'About Us') < 2) target = own;
    return target;
  };

  const TOOLBAR = [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'], ['h2', 'H2', 'Heading'], ['h3', 'H3', 'Subheading'], ['p', '¶', 'Paragraph'],
    ['ul', '• List', 'Bulleted list'], ['ol', '1. List', 'Numbered list'], ['quote', '❝', 'Quote'], ['link', '🔗', 'Insert link'], ['unlink', '⛓', 'Remove link'], ['clear', '✕ Format', 'Clear formatting']];

  function blockEditor(p, b, i) {
    const open = !collapsed.has(b.id);
    return `
    <section class="cblock ab-block ${b.visible ? '' : 'is-hidden'}">
      <header>
        <h3>${esc(b.title) || 'Untitled block'}</h3>
        ${b.visible ? '' : '<span class="pill">hidden</span>'}
        <button class="btn small" data-ab="up" data-b="${b.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="btn small" data-ab="down" data-b="${b.id}" ${i === p.blocks.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="btn small" data-ab="vis" data-b="${b.id}" title="Show or hide on the public profile">${b.visible ? 'Hide' : 'Show'}</button>
        <button class="link danger-t" data-ab="del" data-b="${b.id}">delete</button>
        <button class="chev" data-ab="toggle" data-b="${b.id}" aria-label="Collapse">${open ? '▲' : '▼'}</button>
      </header>
      ${open ? `<div class="cb-body">
        <label class="stack">Title<input data-abf="title" data-b="${b.id}" value="${esc(b.title)}" maxlength="120" placeholder="Block title"></label>

        <div class="ab-sec"><h4>Hero image</h4>
          ${b.hero ? `<div class="ab-hero"><img src="${b.hero}" alt=""><button class="x" data-ab="rm-hero" data-b="${b.id}" title="Remove">×</button></div>` : ''}
          <label class="btn small">${b.hero ? 'Replace image' : 'Upload hero image'}<input type="file" accept="image/*" hidden data-abu="hero" data-b="${b.id}"></label></div>

        <div class="ab-sec"><h4>Text</h4>
          <div class="wy-bar" data-b="${b.id}">${TOOLBAR.map(([c, l, t]) => `<button type="button" class="wy-btn" data-wy="${c}" title="${t}">${l}</button>`).join('')}</div>
          <div class="wy rich" contenteditable="true" data-wyed="${b.id}" data-placeholder="Write something about your work…">${sanitize(b.html)}</div></div>

        <div class="ab-sec"><h4>Gallery <small class="sub">${b.gallery.length}/${MAX_GALLERY}</small></h4>
          <div class="p-photos">${b.gallery.map((g, k) => `<div class="ph"><img src="${g}" alt=""><button class="x" data-ab="rm-photo" data-b="${b.id}" data-k="${k}" title="Remove">×</button></div>`).join('')}
            ${b.gallery.length < MAX_GALLERY ? `<label class="ph add" title="Add photos">+<input type="file" accept="image/*" multiple hidden data-abu="gallery" data-b="${b.id}"></label>` : ''}</div></div>

        <div class="ab-sec"><h4>Documents <small class="sub">PDF, Word, Excel… up to ${sizeOf(MAX_DOC)} each</small></h4>
          ${b.docs.map(d => `<div class="ab-doc">📄 <span>${esc(d.name)}</span> <small class="sub">${sizeOf(d.size)}</small><button class="x" data-ab="rm-doc" data-b="${b.id}" data-did="${d.id}" title="Remove">×</button></div>`).join('')}
          <label class="btn small">+ Upload documents<input type="file" multiple hidden data-abu="docs" data-b="${b.id}"></label></div>

        <div class="ab-sec"><h4>Video</h4>
          <input data-abf="video" data-b="${b.id}" value="${esc(b.video)}" placeholder="Link from YouTube or Vimeo, e.g. https://youtu.be/…">
          <div id="vp-${b.id}">${previewVideo(b.video)}</div></div>
      </div>` : ''}
    </section>`;
  }
  const previewVideo = url => !url ? '' : videoOf(url) ? videoHtml(url) : '<p class="hint" style="color:var(--bad)">This does not look like a link (it must start with https://).</p>';

  window.KitchensPages['About Us'] = () => {
    init();
    const user = me(), slug = editable();
    if (!db[slug]) { db[slug] = blank(slug === slugOf(user) ? user : slug); save(); }
    const p = db[slug], own = slug === slugOf(user), mgr = window.KitchensRoles.level(K().getUser(), 'About Us') >= 2;
    return `
    <h1>About Us</h1>
    <p class="sub">Your public profile. The info and blocks below appear on the <a class="link" href="#about">About Us</a> page and on <a class="link" href="#profile/${esc(slug)}">your profile page</a>, which is also linked from your products in the catalogue.</p>
    ${mgr ? `<label class="inline-sel ag-all">Editing the profile of
      <select id="abWho">${Object.entries(db).map(([s, x]) => `<option value="${esc(s)}" ${s === slug ? 'selected' : ''}>${esc(x.name || x.owner)}${s === slugOf(user) ? ' (you)' : ''}</option>`).join('')}</select></label>` : ''}
    <div class="card ab-info">
      <div class="ab-av">${avatar(p, 'xl')}<label class="btn small">Upload photo<input type="file" accept="image/*" hidden data-abu="avatar"></label>${p.avatar ? '<button class="link danger-t" data-ab="rm-avatar">remove</button>' : ''}</div>
      <div class="ab-fields">
        <div class="two"><label class="stack">Name<input data-abp="name" value="${esc(p.name)}" maxlength="80"></label>
          <label class="stack">Position<input data-abp="position" value="${esc(p.position)}" maxlength="80" placeholder="e.g. Kitchen designer"></label></div>
        <label class="stack">Short bio <small class="sub">(shown on the About Us card)</small><textarea data-abp="bio" rows="3" maxlength="400">${esc(p.bio)}</textarea></label>
        <div class="two"><label class="stack">Email<input data-abp="email" type="email" value="${esc(p.email)}"></label>
          <label class="stack">Phone<input data-abp="phone" value="${esc(p.phone)}"></label></div>
        <label class="inline"><input type="checkbox" data-abp="published" ${p.published ? 'checked' : ''}> Show this profile on the About Us page</label>
        <p class="sub"><a class="link" href="#profile/${esc(slug)}">View public profile →</a> <span id="abStatus" class="ab-status">${status}</span></p>
      </div>
    </div>

    <div class="section-head"><h2>Blocks <span class="count">${p.blocks.length}</span></h2><button class="btn primary" data-ab="add">+ Add block</button></div>
    ${p.blocks.map((b, i) => blockEditor(p, b, i)).join('') || '<div class="placeholder">No blocks yet. A block can hold text, a hero image, a gallery, documents and a video. Click “Add block”.</div>'}`;
  };

  /* ---------- events ---------- */
  let timer;
  const setStatus = (ok) => {
    status = ok ? 'Saved ✓' : '⚠ Not saved: the browser storage is full. Remove some images or documents.';
    const el = document.getElementById('abStatus'); if (el) { el.textContent = status; el.style.color = ok ? '' : 'var(--bad)'; }
  };
  const commit = () => setStatus(save());
  const commitSoon = () => { clearTimeout(timer); timer = setTimeout(commit, 400); };
  const cur = () => db[editable()];
  const blk = id => cur().blocks.find(b => b.id === id);

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
  const syncEditor = ed => { const b = blk(ed.dataset.wyed); if (b) { b.html = sanitize(ed.innerHTML); commitSoon(); } };

  document.addEventListener('click', e => {
    const lb = e.target.closest('[data-pr=zoom]');
    if (lb) { // lightbox on the public profile
      const p = Object.values(db).flatMap(x => x.blocks).find(b => b.id === lb.dataset.b);
      let m = document.getElementById('prModal');
      if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'prModal'; document.body.appendChild(m); }
      m.innerHTML = `<div class="modal-card lightbox"><button type="button" class="close" data-close>×</button><img src="${p.gallery[+lb.dataset.i]}" alt=""></div>`;
      m.hidden = false;
      return;
    }
    const wy = e.target.closest('[data-wy]');
    if (wy) { exec(wy.dataset.wy, document.querySelector(`[data-wyed="${wy.closest('.wy-bar').dataset.b}"]`)); return; }

    const el = e.target.closest('[data-ab]');
    if (!el || !db) return;
    const d = el.dataset, p = cur(), i = p.blocks.findIndex(b => b.id === d.b);
    switch (d.ab) {
      case 'add': { const b = block('', ''); b.title = 'New block'; p.blocks.push(b); commit(); redraw(); break; }
      case 'toggle': collapsed.has(d.b) ? collapsed.delete(d.b) : collapsed.add(d.b); redraw(); break;
      case 'up': case 'down': { const j = d.ab === 'up' ? i - 1 : i + 1;[p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]]; commit(); redraw(); break; }
      case 'vis': p.blocks[i].visible = !p.blocks[i].visible; commit(); redraw(); break;
      case 'del': if (confirm('Delete this block with all its images and documents?')) { p.blocks.splice(i, 1); commit(); redraw(); } break;
      case 'rm-hero': blk(d.b).hero = ''; commit(); redraw(); break;
      case 'rm-photo': blk(d.b).gallery.splice(+d.k, 1); commit(); redraw(); break;
      case 'rm-doc': { const b = blk(d.b); b.docs = b.docs.filter(x => x.id !== d.did); commit(); redraw(); break; }
      case 'rm-avatar': p.avatar = ''; commit(); redraw(); break;
    }
  });

  // keep the editor selection when a toolbar button is pressed
  document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('[data-wy]')) e.preventDefault(); });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.wyed) { syncEditor(t); return; }
    if (!db || !t.dataset) return;
    if (t.dataset.abp && t.type !== 'checkbox') { cur()[t.dataset.abp] = t.value; commitSoon(); }
    if (t.dataset.abf) {
      const b = blk(t.dataset.b); b[t.dataset.abf] = t.value; commitSoon();
      if (t.dataset.abf === 'video') document.getElementById('vp-' + b.id).innerHTML = previewVideo(t.value);
      if (t.dataset.abf === 'title') { const h = t.closest('.ab-block').querySelector('header h3'); if (h) h.textContent = t.value || 'Untitled block'; }
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
    if (t.id === 'abWho') { target = t.value; redraw(); return; }
    if (!db || !t.dataset) return;
    if (t.dataset.abp === 'published') { cur().published = t.checked; commit(); return; }
    const kind = t.dataset.abu;
    if (!kind) return;
    const files = [...t.files]; t.value = '';
    if (kind === 'avatar') { const img = await readImage(files[0], 300, 0.8); if (img) { cur().avatar = img; commit(); redraw(); } }
    if (kind === 'hero') { const img = await readImage(files[0], 1400, 0.75); if (img) { blk(t.dataset.b).hero = img; commit(); redraw(); } }
    if (kind === 'gallery') {
      const b = blk(t.dataset.b), room = MAX_GALLERY - b.gallery.length;
      const imgs = (await Promise.all(files.slice(0, room).map(f => readImage(f, 900, 0.7)))).filter(Boolean);
      if (imgs.length) { b.gallery.push(...imgs); commit(); redraw(); }
    }
    if (kind === 'docs') {
      const b = blk(t.dataset.b), big = [];
      for (const f of files) {
        if (f.size > MAX_DOC) { big.push(f.name); continue; }
        const data = await readFile(f);
        if (data) b.docs.push({ id: uid(), name: f.name, size: f.size, type: f.type, data });
      }
      if (big.length) alert(`These files are too large (max ${sizeOf(MAX_DOC)} each): ${big.join(', ')}`);
      commit(); redraw();
    }
  });
})();
