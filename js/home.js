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
  const isBanner = b => B().isBanner(b);

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

  /* ---------- public Home page ---------- */
  window.KitchensPages.PublicHome = fallback => {
    const list = blocks().filter(b => b.visible);
    return list.length ? list.map(b => B().publicHtml(b)).join('') : fallback();
  };

  /* ---------- Admin panel ---------- */
  const collapsed = new Set();
  const norm = b => {
    b.gallery = b.gallery || []; b.docs = b.docs || []; b.video = b.video || ''; b.html = b.html || ''; b.title = b.title || ''; b.hero = b.hero || '';
    if (isBanner(b)) { b.slides = b.slides || []; b.interval = +b.interval || 5; }
    return b;
  };

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
      ${open ? `<div class="cb-body">${B().bodyHtml(b)}</div>` : ''}
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
    const el = e.target.closest('[data-hm]');
    if (!el) return;
    const d = el.dataset, list = blocks(), i = list.findIndex(b => b.id === d.b), b = list[i];
    switch (d.hm) {
      case 'add': list.push(B().newBlock('New block', '')); break;
      case 'add-banner': list.push(B().newBanner()); break;
      case 'toggle': collapsed.has(d.b) ? collapsed.delete(d.b) : collapsed.add(d.b); redraw(); return;
      case 'up': case 'down': { const j = d.hm === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; break; }
      case 'vis': if (!b) return; b.visible = !b.visible; break;
      case 'del': if (!b || !confirm('Delete this block with all its images and documents?')) return; list.splice(i, 1); break;
      default: return;
    }
    provider.commit(); redraw();
  });

  window.addEventListener('hashchange', () => { B().status = ''; });
})();
