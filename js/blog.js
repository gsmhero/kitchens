/* Blog — posts written in the Blog tab, shown on the public Blog page (#blog) and as pages (#post/<id>).
   A post has the same content tools as a block in About Us (js/blocks.js): title, hero image, rich text (WYSIWYG),
   gallery, documents and a video link. Extra post fields: excerpt, tags, date, author and published / draft.
   Permissions (roles table, "Blog" row): View = see the list, Edit = write, edit, publish and delete posts.
   Prototype: stored in localStorage as { posts[] }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const B = () => window.KitchensBlocks;
  const esc = s => window.KitchensForms.esc(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || '';
  const lvl = () => window.KitchensRoles.level(K().getUser(), 'Blog');
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const dayISO = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const plain = html => { const d = document.createElement('div'); d.innerHTML = B().sanitize(html); return d.textContent.replace(/\s+/g, ' ').trim(); };

  /* ---------- data ---------- */
  let db;
  const save = () => { try { localStorage.setItem('blog', JSON.stringify(db)); return true; } catch (e) { return false; } };

  const post = (o) => ({ ...B().newBlock(o.title || '', o.html || ''), author: me(), date: todayISO(), published: false, excerpt: '', tags: [], at: Date.now(), ...o });
  const seed = () => ({
    posts: [
      post({ title: 'How to choose a kitchen layout', author: 'B. Jones', date: dayISO(-4), published: true, tags: ['design', 'tips'], excerpt: 'Straight, L-shaped, U-shaped or an island: what fits your room and the way you cook.',
        html: '<p>The layout decides how the kitchen <b>feels every day</b>. Start with the room and the work triangle (sink, stove, fridge).</p><h3>Quick guide</h3><ul><li><b>Straight:</b> small rooms and studios</li><li><b>L-shaped:</b> the most flexible choice</li><li><b>U-shaped:</b> lots of storage, needs at least 2.4 m between the sides</li><li><b>Island:</b> only if there is 1 m of free space around it</li></ul><p>Not sure? Send us a request and we will draw two options for your room.</p>' }),
      post({ title: 'What goes into the price of a kitchen', author: 'A. Smith', date: dayISO(-12), published: true, tags: ['prices', 'tips'], excerpt: 'Facades, hardware, countertop and installation: where the money goes and where it is safe to save.',
        html: '<p>Three things make up most of the price: <b>facades</b>, <b>countertop</b> and <b>hardware</b>.</p><blockquote>Save on handles, not on hinges and drawer slides.</blockquote><p>An offer from us always lists every line, so you can compare it with any other quote.</p>' }),
      post({ title: 'A day in our workshop', author: 'C. Brown', date: dayISO(-25), published: true, tags: ['workshop'], excerpt: 'From a sheet of MDF to a finished cabinet: the steps we repeat hundreds of times a year.',
        html: '<p>Cutting, edging, drilling, assembling, checking. Every part is measured twice before it leaves the workshop.</p>' }),
      post({ title: 'Spring promotion (draft)', author: 'A. Smith', date: dayISO(5), published: false, tags: ['news'], excerpt: 'Draft: free delivery for orders signed before the end of the month.', html: '<p>Details to be confirmed.</p>' })
    ]
  });
  const init = () => { if (!db) { db = load('blog', null) || seed(); save(); } };
  const find = id => { init(); return db.posts.find(p => p.id === id) || null; };

  B().register({ find, commit: () => save() });

  window.KitchensBlog = { list: () => { init(); return db.posts.filter(p => p.published).map(p => ({ id: p.id, title: p.title, date: p.date, author: p.author })); } };

  /* ---------- public pages ---------- */
  const authorLink = name => { const p = window.KitchensProfiles.get(name); return p ? `<a class="link" href="${esc(window.KitchensProfiles.url(name))}">${esc(p.name || name)}</a>` : esc(name); };
  const published = () => { init(); return db.posts.filter(p => p.published && p.date <= dayISO(0) + '').sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at); };

  let pubQuery = '', pubTag = '';
  window.addEventListener('hashchange', () => { pubQuery = ''; pubTag = ''; mode = 'list'; editId = ''; qy = ''; stF = ''; B().status = ''; });

  function publicCards() {
    const t = pubQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const list = published().filter(p => !pubTag || p.tags.includes(pubTag))
      .filter(p => t.every(w => (p.title + ' ' + p.excerpt + ' ' + plain(p.html) + ' ' + p.tags.join(' ') + ' ' + p.author).toLowerCase().includes(w)));
    return list.map(p => `
      <article class="card blog-card">
        <a class="blog-img" href="#post/${esc(p.id)}">${p.hero ? `<img src="${p.hero}" alt="">` : '<div class="no-photo"></div>'}</a>
        <div class="sub">${fmtD(p.date)} · ${authorLink(p.author)}</div>
        <h3><a href="#post/${esc(p.id)}">${esc(p.title) || 'Untitled'}</a></h3>
        <p>${esc(p.excerpt || plain(p.html).slice(0, 150))}</p>
        <div class="blog-foot">${p.tags.map(g => `<span class="pill role">${esc(g)}</span>`).join('')}<a class="link" href="#post/${esc(p.id)}">Read →</a></div>
      </article>`).join('') || '<div class="placeholder">No posts found.</div>';
  }

  window.KitchensPages.PublicBlog = () => {
    const tags = [...new Set(published().flatMap(p => p.tags))].sort();
    return `
    <section class="hero small"><h1>Blog</h1><p>News, tips and stories from our workshop.</p></section>
    <div class="kb-bar"><input type="search" id="blSearch" placeholder="Search the blog…" value="${esc(pubQuery)}" autocomplete="off"></div>
    <div class="kb-tags">
      <button class="pill ${pubTag ? '' : 'ok'}" data-bl="tag" data-t="">All</button>
      ${tags.map(g => `<button class="pill ${pubTag === g ? 'ok' : ''}" data-bl="tag" data-t="${esc(g)}">${esc(g)}</button>`).join('')}
    </div>
    <div class="grid g3" id="blCards">${publicCards()}</div>`;
  };

  window.KitchensPages.Post = id => {
    const p = find(id);
    const live = p && p.published && p.date <= dayISO(0); // visitors only see published posts whose date has come
    const preview = p && !live && lvl() >= 1;              // staff may preview drafts and scheduled posts
    if (!p || (!live && !preview)) return '<h1>Post not found</h1><p><a class="link" href="#blog">← Blog</a></p>';
    const more = published().filter(x => x.id !== p.id).slice(0, 3);
    return `
    <p><a class="link" href="#blog">← Blog</a></p>
    ${preview ? `<div class="notice">${p.published ? 'This post is scheduled for ' + fmtD(p.date) + ': visitors cannot see it yet.' : 'This post is a draft: visitors cannot see it yet.'}</div>` : ''}
    <article class="blog-post">
      <h1>${esc(p.title) || 'Untitled'}</h1>
      <div class="sub">${fmtD(p.date)} · ${authorLink(p.author)}</div>
      ${p.tags.length ? `<div class="chips">${p.tags.map(g => `<span class="pill role">${esc(g)}</span>`).join('')}</div>` : ''}
      ${B().publicHtml(p, { title: false })}
    </article>
    ${more.length ? `<div class="section-head"><h2>More from the blog</h2></div><div class="grid g3">${more.map(x => `<a class="card pf-prod" href="#post/${esc(x.id)}"><b>${esc(x.title)}</b><div class="sub">${fmtD(x.date)}</div></a>`).join('')}</div>` : ''}`;
  };

  /* ---------- editor (Blog tab) ---------- */
  let mode = 'list', editId = '', qy = '', stF = '';

  const listRows = () => {
    const t = qy.toLowerCase().split(/\s+/).filter(Boolean);
    return db.posts.filter(p => !stF || (stF === 'pub' ? p.published : !p.published))
      .filter(p => t.every(w => (p.title + ' ' + p.author + ' ' + p.tags.join(' ')).toLowerCase().includes(w)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
      .map(p => `<tr>
        <td><b>${esc(p.title) || 'Untitled'}</b><br><small class="sub">${esc(p.excerpt || plain(p.html).slice(0, 90))}</small></td>
        <td>${esc(p.author)}</td><td>${fmtD(p.date)}</td>
        <td><span class="pill ${p.published ? 'ok' : ''}">${p.published ? (p.date > dayISO(0) ? 'Scheduled' : 'Published') : 'Draft'}</span></td>
        <td class="row-actions">
          <a class="btn small" href="#post/${esc(p.id)}">View</a>
          ${lvl() >= 2 ? `<button class="btn small" data-bl="edit" data-id="${p.id}">Edit</button>
            <button class="btn small" data-bl="pub" data-id="${p.id}">${p.published ? 'Unpublish' : 'Publish'}</button>
            <button class="link danger-t" data-bl="del" data-id="${p.id}">delete</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">No posts found.</td></tr>';
  };

  function listView() {
    const n = db.posts.filter(p => p.published).length;
    return `
    <h1>Blog</h1>
    <p class="sub">Write posts for the public <a class="link" href="#blog">Blog</a>. Each post can have a hero image, formatted text, a gallery, documents and a video.</p>
    <div class="grid g4">
      <div class="card kpi"><div class="l">Posts</div><div class="n">${db.posts.length}</div></div>
      <div class="card kpi"><div class="l">Published</div><div class="n up">${n}</div></div>
      <div class="card kpi"><div class="l">Drafts</div><div class="n">${db.posts.length - n}</div></div>
    </div>
    <div class="kb-bar">
      <input type="search" id="blqSearch" placeholder="Search posts…" value="${esc(qy)}" autocomplete="off">
      <select id="blqStatus" aria-label="Status"><option value="">All</option><option value="pub" ${stF === 'pub' ? 'selected' : ''}>Published</option><option value="draft" ${stF === 'draft' ? 'selected' : ''}>Drafts</option></select>
      ${lvl() >= 2 ? '<button class="btn primary" data-bl="new">+ New post</button>' : ''}
    </div>
    <div class="card"><div class="matrix-wrap"><table><thead><tr><th>Post</th><th>Author</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody id="blRows">${listRows()}</tbody></table></div></div>`;
  }

  function editView() {
    const p = find(editId);
    if (!p) { mode = 'list'; return listView(); }
    const authors = [...new Set([...window.KitchensStaff.names(), me(), p.author].filter(Boolean))].sort();
    return `
    <button class="link back" data-bl="back">← All posts</button>
    <div class="section-head"><h1>Edit post</h1><span><a class="btn" href="#post/${esc(p.id)}">View post</a></span></div>
    <div class="card bl-meta">
      <div class="two">
        <label class="stack">Date <small class="sub">(a future date schedules the post)</small><input type="date" data-bp="date" value="${esc(p.date)}"></label>
        <label class="stack">Author<select data-bp="author">${authors.map(a => `<option ${a === p.author ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      </div>
      <label class="stack">Excerpt <small class="sub">(a short summary for the blog list; empty = the start of the text)</small><textarea data-bp="excerpt" rows="2" maxlength="300">${esc(p.excerpt)}</textarea></label>
      <label class="stack">Tags <small class="sub">comma separated</small><input data-bp="tags" value="${esc(p.tags.join(', '))}" placeholder="design, tips"></label>
      <label class="inline"><input type="checkbox" data-bp="published" ${p.published ? 'checked' : ''}> Published on the public blog</label>
      <p class="sub"><span id="abStatus" class="ab-status">${B().status}</span></p>
    </div>
    <div class="card bl-body">${B().bodyHtml(p)}</div>`;
  }

  window.KitchensPages.Blog = () => {
    init();
    if (lvl() < 1) return '<h1>Blog</h1><div class="placeholder">Your role has no access to the blog editor. Ask the owner to change it in Branches and Roles.</div>';
    if (mode === 'edit' && lvl() < 2) mode = 'list';
    return mode === 'edit' ? editView() : listView();
  };

  /* ---------- events (block content is handled by js/blocks.js) ---------- */
  const commit = () => B().commit({ commit: save });
  const commitSoon = () => B().commitSoon({ commit: save });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-bl]');
    if (!el) return;
    const d = el.dataset;
    if (d.bl === 'tag') { pubTag = d.t; redraw(); return; }
    if (!db || lvl() < 1) return;
    const p = d.id ? find(d.id) : null;
    switch (d.bl) {
      case 'new': if (lvl() >= 2) { const np = post({ title: 'New post', html: '', author: me(), date: todayISO(), published: false }); db.posts.push(np); commit(); mode = 'edit'; editId = np.id; redraw(); } break;
      case 'edit': if (lvl() >= 2) { mode = 'edit'; editId = d.id; redraw(); } break;
      case 'back': mode = 'list'; editId = ''; redraw(); break;
      case 'pub': if (lvl() >= 2) { p.published = !p.published; commit(); redraw(); } break;
      case 'del': if (lvl() >= 2 && confirm(`Delete the post "${p.title}" with all its images and documents?`)) { db.posts = db.posts.filter(x => x !== p); commit(); redraw(); } break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'blSearch') { pubQuery = t.value; document.getElementById('blCards').innerHTML = publicCards(); return; }
    if (t.id === 'blqSearch') { qy = t.value; document.getElementById('blRows').innerHTML = listRows(); return; }
    if (mode === 'edit' && t.dataset && t.dataset.bp && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      const p = find(editId); if (!p || lvl() < 2) return;
      p[t.dataset.bp] = t.dataset.bp === 'tags' ? [...new Set(t.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean))] : t.value;
      commitSoon();
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'blqStatus') { stF = t.value; document.getElementById('blRows').innerHTML = listRows(); return; }
    if (mode === 'edit' && t.dataset && t.dataset.bp && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date')) {
      const p = find(editId); if (!p || lvl() < 2) return;
      p[t.dataset.bp] = t.type === 'checkbox' ? t.checked : t.value;
      commit();
    }
  });
})();
