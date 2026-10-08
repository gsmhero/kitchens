/* Home page and the Admin panel.
   The Home page is a list of blocks, edited by the site administrator (the owner) in the Admin tab with the same tools as About Us
   and the Blog (js/blocks.js): title, hero image, rich text, gallery, documents, video. The blocks are stored on the server
   (table site_pages), so every visitor sees them. With no visible blocks the default welcome section is shown. */
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
  const norm = b => { b.gallery = b.gallery || []; b.docs = b.docs || []; b.video = b.video || ''; b.html = b.html || ''; b.title = b.title || ''; b.hero = b.hero || ''; return b; };

  function blockEditor(b, i, n) {
    const open = !collapsed.has(b.id);
    return `
    <section class="cblock ab-block ${b.visible ? '' : 'is-hidden'}">
      <header>
        <h3>${esc(b.title) || 'Untitled block'}</h3>
        ${b.visible ? '' : '<span class="pill">hidden</span>'}
        <button class="btn small" data-hm="up" data-b="${b.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="btn small" data-hm="down" data-b="${b.id}" ${i === n - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="btn small" data-hm="vis" data-b="${b.id}" title="Show or hide on the Home page">${b.visible ? 'Hide' : 'Show'}</button>
        <button class="link danger-t" data-hm="del" data-b="${b.id}">delete</button>
        <button class="chev" data-hm="toggle" data-b="${b.id}" aria-label="Collapse">${open ? '▲' : '▼'}</button>
      </header>
      ${open ? `<div class="cb-body">${B().bodyHtml(norm(b))}</div>` : ''}
    </section>`;
  }

  window.KitchensPages.Admin = () => {
    const u = K().getUser(), list = blocks();
    list.forEach(norm);
    return `
    <h1>Admin</h1>
    <p class="sub">Site administration. You are signed in as <b>${esc(u.name)}</b> (${esc(u.email)}), the site administrator.</p>

    <div class="section-head"><h2>Home page <span class="count">${list.length}</span></h2>
      <div class="actions"><a class="btn" href="#home" target="_blank" rel="noopener">Open the Home page ↗</a><button class="btn primary" data-hm="add">+ Add block</button></div></div>
    <p class="sub">The Home page is built from blocks, each with text, a hero image, a gallery, documents and a video. Changes are saved automatically and are visible to all visitors at once.
      With no visible blocks the standard welcome section is shown. <span id="abStatus" class="ab-status">${B().status}</span></p>
    ${list.map((b, i) => blockEditor(b, i, list.length)).join('') || '<div class="placeholder">No blocks yet, so visitors see the standard welcome section. Click “Add block” to make your own Home page.</div>'}`;
  };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-hm]');
    if (!el) return;
    const d = el.dataset, list = blocks(), i = list.findIndex(b => b.id === d.b);
    switch (d.hm) {
      case 'add': { const b = B().newBlock('New block', ''); list.push(b); provider.commit(); redraw(); break; }
      case 'toggle': collapsed.has(d.b) ? collapsed.delete(d.b) : collapsed.add(d.b); redraw(); break;
      case 'up': case 'down': { const j = d.hm === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= list.length) break; [list[i], list[j]] = [list[j], list[i]]; provider.commit(); redraw(); break; }
      case 'vis': if (i >= 0) { list[i].visible = !list[i].visible; provider.commit(); redraw(); } break;
      case 'del': if (i >= 0 && confirm('Delete this block with all its images and documents?')) { list.splice(i, 1); provider.commit(); redraw(); } break;
    }
  });
  window.addEventListener('hashchange', () => { B().status = ''; });
})();
