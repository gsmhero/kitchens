/* Profiles — "About Us" (editor tab), the public About Us page and public profile pages.
   Every registered user has a profile (name, position, short bio, photo, contacts) that they edit in the About Us tab,
   plus any number of BLOCKS. A block has: a title, a hero image, rich text (WYSIWYG editor), a photo gallery,
   documents to download, and a link to a video (YouTube / Vimeo are embedded). The block tools themselves
   (editor, uploads, rendering) are shared with the Blog and live in js/blocks.js.
   Public routes:  #about (cards of all published profiles)  ·  #profile/<name> (one profile with its blocks)
   Prototype: stored in localStorage. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const B = () => window.KitchensBlocks;
  const esc = s => window.KitchensForms.esc(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || '';
  const slugOf = name => String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'user';
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  /* ---------- data ---------- */
  let db; // { [slug]: profile }
  const save = () => { try { localStorage.setItem('profiles', JSON.stringify(db)); return true; } catch (e) { return false; } };

  const block = (title, html) => B().newBlock(title, html);
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
    // published profiles of people who are currently employees (or the owner); a person who left the team disappears from About Us
    list: () => { init(); return Object.entries(db).filter(([, p]) => p.published && window.KitchensRoles.isEmployee({ name: p.owner })).map(([slug, p]) => ({ slug, ...p })); }
  };

  // tell the shared block tools where profile blocks live
  const provider = {
    find: id => { init(); for (const p of Object.values(db)) { const b = p.blocks.find(x => x.id === id); if (b) return b; } return null; },
    commit: () => save()
  };
  B().register(provider);

  /* ---------- public rendering ---------- */
  const avatar = (p, cls = '') => p.avatar ? `<img class="pf-avatar ${cls}" src="${p.avatar}" alt="">` : `<span class="pf-avatar ph-av ${cls}">${esc(initials(p.name))}</span>`;
  const snippet = (t, n = 150) => t.length > n ? t.slice(0, n).trimEnd() + '…' : t;

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
        <div class="pf-contacts">${p.email ? `<a class="pill" href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ''}${p.phone ? `<span class="pill">☎ ${esc(p.phone)}</span>` : ''}
          ${me() && p.owner !== me() ? `<a class="btn small" href="#messages/${encodeURIComponent(p.owner)}">💬 Send a message</a>` : ''}</div></div>
    </header>
    ${p.blocks.filter(b => b.visible).map(b => B().publicHtml(b)).join('')}
    ${prods.length ? `<section class="pf-block"><h2>Products by ${esc(p.name)}</h2><div class="grid g4">${prods.map(x => `<a class="card pf-prod" href="#catalogue"><b>${esc(x.name)}</b><div class="sub">${esc(x.typeName)}</div><div class="pub-price">${x.price === '' ? 'Price on request' : K().fmt(+x.price) + ' ₽'}</div></a>`).join('')}</div></section>` : ''}`;
  };

  /* ---------- editor (About Us tab) ---------- */
  let target = '';                 // slug being edited
  const collapsed = new Set();
  window.addEventListener('hashchange', () => { target = ''; B().status = ''; });

  const editable = () => { // own profile always; other profiles for people who may edit About Us (Edit permission)
    const own = slugOf(me());
    if (!target) target = own;
    if (target !== own && window.KitchensRoles.level(K().getUser(), 'About Us') < 2) target = own;
    return target;
  };

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
      ${open ? `<div class="cb-body">${B().bodyHtml(b)}</div>` : ''}
    </section>`;
  }

  window.KitchensPages['About Us'] = () => {
    init();
    const user = me(), slug = editable();
    if (!db[slug]) { db[slug] = blank(slug === slugOf(user) ? user : slug); save(); }
    const p = db[slug], mgr = window.KitchensRoles.level(K().getUser(), 'About Us') >= 2;
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
        <p class="sub"><a class="link" href="#profile/${esc(slug)}">View public profile →</a> <span id="abStatus" class="ab-status">${B().status}</span></p>
      </div>
    </div>

    <div class="section-head"><h2>Blocks <span class="count">${p.blocks.length}</span></h2><button class="btn primary" data-ab="add">+ Add block</button></div>
    ${p.blocks.map((b, i) => blockEditor(p, b, i)).join('') || '<div class="placeholder">No blocks yet. A block can hold text, a hero image, a gallery, documents and a video. Click “Add block”.</div>'}`;
  };

  /* ---------- events (profile level; block content is handled by js/blocks.js) ---------- */
  const cur = () => db[editable()];
  const commit = () => B().commit(provider);
  const commitSoon = () => B().commitSoon(provider);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ab]');
    if (!el || !db) return;
    const d = el.dataset, p = cur(), i = p ? p.blocks.findIndex(b => b.id === d.b) : -1;
    switch (d.ab) {
      case 'add': { const b = block('', ''); b.title = 'New block'; p.blocks.push(b); commit(); redraw(); break; }
      case 'toggle': collapsed.has(d.b) ? collapsed.delete(d.b) : collapsed.add(d.b); redraw(); break;
      case 'up': case 'down': { const j = d.ab === 'up' ? i - 1 : i + 1;[p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]]; commit(); redraw(); break; }
      case 'vis': p.blocks[i].visible = !p.blocks[i].visible; commit(); redraw(); break;
      case 'del': if (confirm('Delete this block with all its images and documents?')) { p.blocks.splice(i, 1); commit(); redraw(); } break;
      case 'rm-avatar': p.avatar = ''; commit(); redraw(); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (db && t.dataset && t.dataset.abp && t.type !== 'checkbox') { cur()[t.dataset.abp] = t.value; commitSoon(); }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'abWho') { target = t.value; redraw(); return; }
    if (!db || !t.dataset) return;
    if (t.dataset.abp === 'published') { cur().published = t.checked; commit(); return; }
    if (t.dataset.abu === 'avatar') {
      const files = [...t.files]; t.value = '';
      const img = await B().readImage(files[0], 300, 0.8);
      if (img) { cur().avatar = img; commit(); redraw(); }
    }
  });
})();
