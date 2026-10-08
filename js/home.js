/* Home page and the Admin panel.
   The Home page is a list of blocks, edited by the site administrator (the owner) in the Admin tab. Two kinds of block:
   - content block: title, hero image (16:9), rich text, gallery, documents, video (the same tools as About Us and the Blog, js/blocks.js)
   - banner: sliding images (16:9) with a big H1 text over each, an optional line of text and a button; arrows, dots and autoplay
   The blocks are stored on the server (table site_pages), so every visitor sees them. With no visible blocks the default welcome section is shown. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const B = () => window.KitchensBlocks;
  const A = () => window.KitchensApi;
  const esc = s => window.KitchensForms.esc(s);
  const redraw = () => K().render();
  const home = () => A().state.home || (A().state.home = { blocks: [] });
  const blocks = () => home().blocks || (home().blocks = []);
  const MAX_SLIDES = 12;
  const emptySlide = () => ({ image: '', title: '', text: '', button: '', link: '' });

  /* ---------- saving to the server (a moment after the last change) ---------- */
  let timer, saving = false, again = false;
  async function push() {
    if (saving) { again = true; return; }
    saving = true;
    try {
      const body = { slug: 'home', blocks: blocks() };
      if (JSON.stringify(body).length > 11 * 1024 * 1024) throw new Error('The page is too large. Remove some images.');
      await A().call('page_save', body);
      B().setStatus(true, 'Saved ✓ (visible to visitors now)');
    } catch (e) { B().setStatus(false, '⚠ Not saved: ' + e.message); }
    saving = false;
    if (again) { again = false; push(); }
  }
  const provider = {
    find: id => blocks().find(b => b.id === id) || null,
    commit: () => { clearTimeout(timer); timer = setTimeout(push, 700); return true; } // the real result is reported by push()
  };
  B().register(provider);

  /* ---------- banner (public) ---------- */
  const isBanner = b => b.type === 'banner';
  const linkOk = l => /^(https?:\/\/\S+|#[\w\/-]+)$/.test(l || '');
  function bannerHtml(b) {
    const slides = (b.slides || []).filter(s => s.image || s.title);
    if (!slides.length) return '';
    return `<section class="bn" data-bn="${esc(b.id)}" data-n="${slides.length}" data-i="0" data-every="${+b.interval || 5}" data-t="0" aria-roledescription="carousel">
      ${slides.map((s, i) => `<div class="bn-slide ${i === 0 ? 'on' : ''}">
        ${s.image ? `<img src="${s.image}" alt="" ${i ? 'loading="lazy"' : ''}>` : ''}
        <div class="bn-cap">
          ${s.title ? `<h1>${esc(s.title)}</h1>` : ''}
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

  /* ---------- public Home page ---------- */
  window.KitchensPages.PublicHome = fallback => {
    const list = blocks().filter(b => b.visible);
    return list.length ? list.map(b => isBanner(b) ? bannerHtml(b) : B().publicHtml(b)).join('') : fallback();
  };

  /* ---------- Admin panel ---------- */
  const collapsed = new Set();
  const norm = b => {
    b.gallery = b.gallery || []; b.docs = b.docs || []; b.video = b.video || ''; b.html = b.html || ''; b.title = b.title || ''; b.hero = b.hero || '';
    if (isBanner(b)) { b.slides = b.slides || []; b.interval = +b.interval || 5; }
    return b;
  };

  function slideEditor(b, s, k) {
    return `<div class="bn-ed">
      <div class="bn-ed-img">${s.image ? `<img src="${s.image}" alt="">` : '<div class="no-photo">16:9</div>'}
        <label class="btn small">${s.image ? 'Replace image' : 'Upload image'}<input type="file" accept="image/*" hidden data-hmu="slide" data-b="${b.id}" data-s="${k}"></label></div>
      <div class="bn-ed-fields">
        <label class="stack">Big text (H1) over the image<input data-hms="title" data-b="${b.id}" data-s="${k}" value="${esc(s.title)}" maxlength="200" placeholder="e.g. Kitchens made to measure"></label>
        <label class="stack">Smaller text (optional)<input data-hms="text" data-b="${b.id}" data-s="${k}" value="${esc(s.text)}" maxlength="400"></label>
        <div class="two"><label class="stack">Button text (optional)<input data-hms="button" data-b="${b.id}" data-s="${k}" value="${esc(s.button)}" maxlength="60" placeholder="e.g. Send a request"></label>
          <label class="stack">Button link<input data-hms="link" data-b="${b.id}" data-s="${k}" value="${esc(s.link)}" placeholder="#request or https://…"></label></div>
      </div>
      <div class="bn-ed-act"><button class="btn small" data-hm="s-up" data-b="${b.id}" data-s="${k}" ${k === 0 ? 'disabled' : ''} title="Move earlier">←</button>
        <button class="btn small" data-hm="s-down" data-b="${b.id}" data-s="${k}" ${k === b.slides.length - 1 ? 'disabled' : ''} title="Move later">→</button>
        <button class="link danger-t" data-hm="s-del" data-b="${b.id}" data-s="${k}">remove</button></div>
    </div>`;
  }
  const bannerBody = b => `
    <div class="ab-sec"><h4>Slides <small class="sub">${b.slides.length}/${MAX_SLIDES} · images are cut to 16:9</small></h4>
      ${b.slides.map((s, k) => slideEditor(b, s, k)).join('')}
      ${b.slides.length < MAX_SLIDES ? `<button class="btn small" data-hm="s-add" data-b="${b.id}">+ Add slide</button>` : ''}</div>
    <div class="ab-sec"><h4>Autoplay</h4>
      <label class="inline-sel">Change the slide every <select data-hmi="${b.id}">${[3, 4, 5, 6, 8, 10, 15].map(n => `<option ${n === b.interval ? 'selected' : ''}>${n}</option>`).join('')}</select> seconds</label></div>`;

  function blockEditor(b, i, n) {
    const open = !collapsed.has(b.id);
    return `
    <section class="cblock ab-block ${b.visible ? '' : 'is-hidden'}">
      <header>
        <h3>${isBanner(b) ? '🖼 ' : ''}${esc(b.title) || 'Untitled block'}</h3>
        ${b.visible ? '' : '<span class="pill">hidden</span>'}
        <button class="btn small" data-hm="up" data-b="${b.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="btn small" data-hm="down" data-b="${b.id}" ${i === n - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="btn small" data-hm="vis" data-b="${b.id}" title="Show or hide on the Home page">${b.visible ? 'Hide' : 'Show'}</button>
        <button class="link danger-t" data-hm="del" data-b="${b.id}">delete</button>
        <button class="chev" data-hm="toggle" data-b="${b.id}" aria-label="Collapse">${open ? '▲' : '▼'}</button>
      </header>
      ${open ? `<div class="cb-body">${isBanner(b)
        ? `<label class="stack">Name (only you see it)<input data-abf="title" data-b="${b.id}" value="${esc(b.title)}" maxlength="120"></label>${bannerBody(b)}`
        : B().bodyHtml(b)}</div>` : ''}
    </section>`;
  }

  window.KitchensPages.Admin = () => {
    const u = K().getUser(), list = blocks();
    list.forEach(norm);
    return `
    <h1>Admin</h1>
    <p class="sub">Site administration. You are signed in as <b>${esc(u.name)}</b> (${esc(u.email)}), the site administrator.</p>

    <div class="section-head"><h2>Home page <span class="count">${list.length}</span></h2>
      <div class="actions"><a class="btn" href="#home">Open the Home page ↗</a><button class="btn" data-hm="add-banner">+ Add banner</button><button class="btn primary" data-hm="add">+ Add block</button></div></div>
    <p class="sub">The Home page is built from blocks. A <b>banner</b> is a row of sliding images with a big H1 text over each; a <b>block</b> holds text, a hero image, a gallery, documents and a video.
      Changes are saved automatically and are visible to all visitors at once. With no visible blocks the standard welcome section is shown. <span id="abStatus" class="ab-status">${B().status}</span></p>
    ${list.map((b, i) => blockEditor(b, i, list.length)).join('') || '<div class="placeholder">No blocks yet, so visitors see the standard welcome section. Click “Add banner” or “Add block” to make your own Home page.</div>'}`;
  };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-bn-go], [data-bn-to]');
    if (go) { // arrows and dots of a banner on the page
      const el = go.closest('.bn');
      bnShow(el, go.dataset.bnTo !== undefined ? +go.dataset.bnTo : +el.dataset.i + +go.dataset.bnGo);
      return;
    }
    const el = e.target.closest('[data-hm]');
    if (!el) return;
    const d = el.dataset, list = blocks(), i = list.findIndex(b => b.id === d.b), b = list[i], k = +d.s;
    switch (d.hm) {
      case 'add': list.push(B().newBlock('New block', '')); break;
      case 'add-banner': list.push(B().newBlock('Banner', '', { type: 'banner', slides: [emptySlide()], interval: 5 })); break;
      case 'toggle': collapsed.has(d.b) ? collapsed.delete(d.b) : collapsed.add(d.b); redraw(); return;
      case 'up': case 'down': { const j = d.hm === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; break; }
      case 'vis': if (!b) return; b.visible = !b.visible; break;
      case 'del': if (!b || !confirm('Delete this block with all its images and documents?')) return; list.splice(i, 1); break;
      case 's-add': if (!b || b.slides.length >= MAX_SLIDES) return; b.slides.push(emptySlide()); break;
      case 's-del': if (!b || !confirm('Remove this slide?')) return; b.slides.splice(k, 1); break;
      case 's-up': case 's-down': { const j = d.hm === 's-up' ? k - 1 : k + 1; if (!b || j < 0 || j >= b.slides.length) return; [b.slides[k], b.slides[j]] = [b.slides[j], b.slides[k]]; break; }
      default: return;
    }
    provider.commit(); redraw();
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset || t.dataset.hms === undefined) return; // text fields of a slide
    const b = blocks().find(x => x.id === t.dataset.b), s = b && b.slides[+t.dataset.s];
    if (!s) return;
    s[t.dataset.hms] = t.value; provider.commit();
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.hmi) { const b = blocks().find(x => x.id === t.dataset.hmi); if (b) { b.interval = +t.value; provider.commit(); } return; }
    if (t.dataset.hmu === 'slide') {
      const b = blocks().find(x => x.id === t.dataset.b), s = b && b.slides[+t.dataset.s], file = t.files[0]; t.value = '';
      if (!s || !file) return;
      const img = await B().readImage(file, 1600, 0.72, 16 / 9);
      if (img) { s.image = img; provider.commit(); redraw(); } else alert('This file could not be read as an image.');
    }
  });
  window.addEventListener('hashchange', () => { B().status = ''; });
})();
