/* Kitchens — front-end prototype (no backend; auth is simulated via localStorage) */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- Registered-user tabs (from wireframe) ---------- */
  const TABS = [
    'Dashboard', 'Flow', 'Archive', 'Stages', 'Forms', 'Branches and Roles', 'Staff', 'Knowledge',
    'Warehouse', 'Product Catalogue', 'About Us', 'Blog', 'Price offers', 'Costs', 'ToDo', 'Agents'
  ];
  const slug = t => t.toLowerCase().replace(/\s+/g, '-');

  /* ---------- Demo data ---------- */
  // production pipeline, in order; stage 0 ("Request") receives requests sent from the Request page
  // Stages are editable (Stages tab) and saved as [{ id, name }]. Items refer to a stage by id, so renaming and
  // reordering never breaks them; an item whose stage id no longer exists falls back to the first stage.
  const DEFAULT_STAGES = ['Request', 'Offer', 'Measure', 'Design', 'Payment', 'Production', 'Assembly']
    .map(name => ({ id: name.toLowerCase(), name }));
  let stages = store.get('stages') || DEFAULT_STAGES.map(s => ({ ...s }));
  const stageIndex = ref => {
    if (typeof ref === 'number') ref = (DEFAULT_STAGES[ref] || {}).id; // legacy: stage stored as a position
    const i = stages.findIndex(s => s.id === ref);
    return i < 0 ? 0 : i;
  };
  const setStages = list => { stages = list; store.set('stages', stages); };
  const ORDERS = [
    { id: 1042, client: 'Ivanov', stage: 'offer', sum: 180000, status: 'ok' },
    { id: 1043, client: 'Petrova', stage: 'measure', sum: 150000, status: 'ok' },
    { id: 1044, client: 'Sidorov', stage: 'production', sum: 200000, status: 'warn' },
    { id: 1045, client: 'Kozlova', stage: 'design', sum: 100000, status: 'ok' },
    { id: 1046, client: 'Morozov', stage: 'assembly', sum: 90000, status: 'bad' },
    { id: 1047, client: 'Smirnova', stage: 'payment', sum: 50000, status: 'ok' }
  ];
  const fmt = n => n.toLocaleString('en-US').replace(/,/g, ' ');
  const pill = s => `<span class="pill ${s}">${{ ok: 'On track', warn: 'At risk', bad: 'Delayed' }[s]}</span>`;

  const INITIAL_NOTIFS = [
    { t: 'New order #1047 created', s: '5 min ago' },
    { t: 'Order #1046 is delayed at Assembly', s: '1 h ago' },
    { t: 'Warehouse: MDF 18mm below minimum', s: '3 h ago' },
    { t: 'Price offer #88 accepted by client', s: 'yesterday' }
  ];

  /* ---------- Guest pages ---------- */
  const GUEST = {
    home: () => `
      <section class="hero">
        <h1>Custom kitchens, made in our own workshop</h1>
        <p>From measurement to installation — transparent stages, fair prices, reliable deadlines.</p>
        <button class="btn primary" data-open="regModal">Get started</button>
      </section>
      <div class="grid g3">
        ${['Design', 'Production', 'Installation'].map((t, i) => `
          <div class="card"><h3>${i + 1}. ${t}</h3><p class="sub">Placeholder text describing the ${t.toLowerCase()} stage of your project.</p></div>`).join('')}
      </div>`,
    catalogue: () => `
      <h1>Catalogue</h1><p class="sub">A selection of our work. Register to request a price offer.</p>
      <div class="grid g4">${['Modern', 'Classic', 'Loft', 'Scandi', 'Minimal', 'Country', 'Corner', 'Island'].map(n => `
        <div class="card"><div class="product"></div><b>${n} kitchen</b><div class="sub">from ${fmt(90000 + n.length * 12000)} ₽</div></div>`).join('')}</div>`,
    about: () => `<h1>About Us</h1><p class="sub">Small family workshop producing kitchens and cabinet furniture.</p>
      <div class="card"><p>Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat.</p></div>`,
    blog: () => `<h1>Blog</h1><p class="sub">News and tips.</p>
      <div class="grid g3">${[1, 2, 3].map(i => `<div class="card"><h3>Post title ${i}</h3><p class="sub">Short announcement placeholder.</p></div>`).join('')}</div>`,
    contacts: () => `<h1>Contacts</h1><div class="card"><p>Email: info@example.com<br>Phone: +7 000 000-00-00</p></div>`
  };

  /* ---------- Registered tab pages ---------- */
  const TAB_PAGES = {
    'Dashboard': () => {
      const total = ORDERS.reduce((a, o) => a + o.sum, 0);
      const inStage = i => ORDERS.filter(o => stageIndex(o.stage) === i).length;
      const maxN = Math.max(...stages.map((_, i) => inStage(i)), 1);
      return `
      <h1>Dashboard</h1><p class="sub">Overview of production and finance.</p>
      <div class="grid g4">
        <div class="card kpi"><div class="l">Active orders</div><div class="n">${ORDERS.length}</div><div class="d up">+2 this week</div></div>
        <div class="card kpi"><div class="l">Portfolio</div><div class="n">${fmt(total)} ₽</div><div class="d up">+8%</div></div>
        <div class="card kpi"><div class="l">Delayed</div><div class="n">${ORDERS.filter(o => o.status === 'bad').length}</div><div class="d down">needs attention</div></div>
        <div class="card kpi"><div class="l">Open tasks</div><div class="n">9</div><div class="d">3 due today</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>Orders by stage</h3>
          <div class="bars">${stages.map((s, i) => { const c = inStage(i); return `<div style="height:${c / maxN * 100}%"><span>${s.name.replace(/[<>&]/g, '')} (${c})</span></div>`; }).join('')}</div></div>
        <div class="card"><h3>Latest orders</h3><table>
          <tr><th>#</th><th>Client</th><th>Stage</th><th>Sum</th><th>Status</th></tr>
          ${ORDERS.map(o => `<tr><td>${o.id}</td><td>${o.client}</td><td>${stages[stageIndex(o.stage)].name.replace(/[<>&]/g, '')}</td><td>${fmt(o.sum)}</td><td>${pill(o.status)}</td></tr>`).join('')}</table></div>
      </div>`;
    },
    // 'Flow' lives in js/flow.js
    'Archive': () => `<h1>Archive</h1><p class="sub">Completed orders.</p><div class="card"><table>
      <tr><th>#</th><th>Client</th><th>Closed</th><th>Sum</th></tr>
      ${[[1031, 'Orlov', '2026-08-14', 210000], [1029, 'Volkova', '2026-08-02', 135000], [1024, 'Lebedev', '2026-07-19', 98000]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${fmt(r[3])}</td></tr>`).join('')}</table></div>`,
    // 'Stages' lives in js/stages.js
    'Staff': () => `<h1>Staff</h1><div class="card"><table><tr><th>Name</th><th>Role</th><th>Branch</th></tr>
      ${[['A. Smith', 'Manager', 'Main'], ['B. Jones', 'Designer', 'Main'], ['C. Brown', 'Carpenter', 'Workshop'], ['D. Davis', 'Installer', 'Workshop']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>`,
    'Warehouse': () => `<h1>Warehouse</h1><div class="card"><table><tr><th>Material</th><th>In stock</th><th>Min</th><th></th></tr>
      ${[['MDF 18mm', 12, 20, 'bad'], ['Hinges Blum', 340, 100, 'ok'], ['Edge tape white', 45, 40, 'warn'], ['Handles M2', 120, 50, 'ok']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td><span class="pill ${r[3]}">${{ ok: 'OK', warn: 'Low', bad: 'Reorder' }[r[3]]}</span></td></tr>`).join('')}</table></div>`,
    'Product Catalogue': () => GUEST.catalogue(),
    'About Us': () => GUEST.about(),
    'Blog': () => GUEST.blog(),
    'Price offers': () => `<h1>Price offers</h1><div class="card"><table><tr><th>#</th><th>Client</th><th>Sum</th><th>Status</th></tr>
      ${[[88, 'Petrova', 150000, 'ok'], [89, 'Romanov', 175000, 'warn'], [90, 'Frolova', 95000, 'warn']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${fmt(r[2])}</td><td><span class="pill ${r[3]}">${r[3] === 'ok' ? 'Accepted' : 'Sent'}</span></td></tr>`).join('')}</table></div>`,
    'Costs': () => `<h1>Costs</h1><div class="grid g3">
      ${[['Materials', 420000], ['Salaries', 310000], ['Rent & utilities', 85000]].map(r => `<div class="card kpi"><div class="l">${r[0]}</div><div class="n">${fmt(r[1])} ₽</div></div>`).join('')}</div>`,
    'ToDo': () => {
      const tasks = store.get('todo') || [['Call supplier about MDF', false], ['Send offer #89', false], ['Check Assembly team schedule', true]];
      return `<h1>ToDo</h1><div class="card"><ul class="clean todo" id="todoList">
        ${tasks.map((t, i) => `<li><label><input type="checkbox" data-i="${i}" ${t[1] ? 'checked' : ''}><span>${t[0]}</span></label></li>`).join('')}</ul></div>`;
    }
  };
  const placeholder = t => `<h1>${t}</h1><div class="placeholder">“${t}” section — to be built.</div>`;

  /* ---------- State ---------- */
  let user = store.get('user');
  let notifs = store.get('notifs') || INITIAL_NOTIFS.map(n => ({ ...n, read: false }));

  /* ---------- Rendering ---------- */
  function currentRoute() { return decodeURIComponent(location.hash.slice(1)) || (user ? 'tab/dashboard' : 'home'); }

  function render() {
    document.body.classList.toggle('is-auth', !!user);
    if (user) { $('#userName').textContent = user.name; $('#userAvatar').textContent = user.name[0].toUpperCase(); }

    const route = currentRoute();
    const view = $('#view');
    $$('#mainMenu a').forEach(a => a.classList.toggle('active', route === a.dataset.page));

    try {
      if (user && route.startsWith('tab/')) {
        const tab = TABS.find(t => slug(t) === route.slice(4)) || TABS[0];
        $$('#tabsRow button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        const ext = window.KitchensPages || {};
        view.innerHTML = (TAB_PAGES[tab] || ext[tab] || (() => placeholder(tab)))();
      } else {
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = route === 'request' ? window.KitchensPages.Request() : (GUEST[route] || GUEST.home)();
      }
    } catch (err) { // never leave a blank page: show the problem instead
      console.error(err);
      view.innerHTML = '<div class="placeholder">This page failed to load: ' + String(err.message).replace(/[<>&]/g, '') + '</div>';
    }
    renderNotifs();
  }

  function renderTabs() {
    $('#tabsRow').innerHTML = TABS.map(t => `<button role="tab" data-tab="${t}">${t}</button>`).join('');
  }

  function renderNotifs() {
    const unread = notifs.filter(n => !n.read).length;
    const b = $('#notifCount'); b.textContent = unread; b.classList.toggle('zero', !unread);
    $('#notifList').innerHTML = notifs.map(n => `<li class="${n.read ? 'read' : ''}">${n.t}<small>${n.s}</small></li>`).join('');
  }

  /* ---------- Auth ---------- */
  function login(name) {
    user = { name };
    store.set('user', user);
    const known = store.get('users') || []; // registry of registered users (Request page lists them)
    if (!known.some(u => u.name === name)) { known.push({ name }); store.set('users', known); }
    location.hash = 'tab/dashboard';
    closeModals(); render();
  }
  function logout() { user = null; store.del('user'); location.hash = 'home'; render(); }

  /* ---------- Events ---------- */
  const closeModals = () => $$('.modal').forEach(m => m.hidden = true);

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) { closeModals(); $('#' + open.dataset.open).hidden = false; return; }
    if (e.target.matches('[data-close]') || e.target.classList.contains('modal')) closeModals();

    const tab = e.target.closest('#tabsRow button');
    if (tab) { location.hash = 'tab/' + slug(tab.dataset.tab); return; }

    if (e.target.closest('#notifBtn')) { $('#notifPanel').hidden = !$('#notifPanel').hidden; return; }
    if (!e.target.closest('#notifPanel')) $('#notifPanel').hidden = true;
  });

  $('#notifClear').addEventListener('click', () => { notifs.forEach(n => n.read = true); store.set('notifs', notifs); renderNotifs(); });
  $('#logoutBtn').addEventListener('click', logout);
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    login(new FormData(e.target).get('email').split('@')[0]);
  });
  $('#regForm').addEventListener('submit', e => {
    e.preventDefault();
    login(new FormData(e.target).get('name'));
  });
  document.addEventListener('change', e => {
    if (e.target.closest('#todoList')) {
      const tasks = $$('#todoList li').map(li => [$('span', li).textContent, $('input', li).checked]);
      store.set('todo', tasks);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  window.addEventListener('hashchange', render);

  window.Kitchens = {
    TABS, ORDERS, fmt, render, getUser: () => user,
    getStages: () => stages.map(s => ({ ...s })), setStages, stageIndex, defaultStages: () => DEFAULT_STAGES.map(s => ({ ...s }))
  };
  renderTabs();
  render();
})();
