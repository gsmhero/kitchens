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
  // The last stage is always "Archive" (id "archive", or any stage named Archive): requests in it leave the Flow board and
  // are listed in the Archive tab. It cannot be deleted or moved; other stages can be added, renamed and reordered.
  const DEFAULT_STAGES = ['Request', 'Offer', 'Measure', 'Design', 'Payment', 'Production', 'Assembly', 'Archive']
    .map(name => ({ id: name.toLowerCase(), name }));
  const isArchiveStage = s => !!s && (s.id === 'archive' || String(s.name).trim().toLowerCase() === 'archive');
  const withArchiveLast = list => { // keeps exactly one archive stage and puts it at the end (also upgrades older saved lists)
    const arch = list.find(isArchiveStage) || { id: 'archive', name: 'Archive' };
    return [...list.filter(s => !isArchiveStage(s)), arch];
  };
  let stages = withArchiveLast(store.get('stages') || DEFAULT_STAGES.map(s => ({ ...s })));
  const stageIndex = ref => {
    if (typeof ref === 'number') ref = (DEFAULT_STAGES[ref] || {}).id; // legacy: stage stored as a position
    const i = stages.findIndex(s => s.id === ref);
    return i < 0 ? 0 : i;
  };
  const setStages = list => { stages = withArchiveLast(list); store.set('stages', stages); };
  const isArchive = ref => isArchiveStage(stages[stageIndex(ref)]);
  const ORDERS = []; // no demo orders: the Flow board shows real requests only
  const fmt = n => n.toLocaleString('en-US').replace(/,/g, ' ');
  const pill = s => `<span class="pill ${s}">${{ ok: 'On track', warn: 'At risk', bad: 'Delayed' }[s]}</span>`;


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
    catalogue: () => window.KitchensPages.PublicCatalogue(), // js/catalogue.js: published products
    about: () => window.KitchensPages.PublicAbout(), // js/profiles.js: cards of the team profiles
    blog: () => window.KitchensPages.PublicBlog(), // js/blog.js: published posts
    contacts: () => `<h1>Contacts</h1><div class="card"><p>Email: info@example.com<br>Phone: +7 000 000-00-00</p></div>`
  };

  /* ---------- Registered tab pages ---------- */
  const TAB_PAGES = {
    // 'Dashboard' lives in js/dashboard.js
    // 'Flow' lives in js/flow.js
    // 'Archive' lives in js/archive.js
    // 'Stages' lives in js/stages.js
    // 'Staff' lives in js/staff.js
    // 'Warehouse' lives in js/warehouse.js
    // 'Product Catalogue' (manager) lives in js/catalogue.js
    // 'About Us' (profile editor) lives in js/profiles.js
    // 'Blog' (post editor) lives in js/blog.js
    // 'Price offers' lives in js/offers.js
    // 'Costs' lives in js/costs.js
    // 'ToDo' lives in js/todo.js
  };
  const placeholder = t => `<h1>${t}</h1><div class="placeholder">“${t}” section — to be built.</div>`;

  /* ---------- State ---------- */
  let user = null; // the logged-in person, from the server session (js/api.js)

  /* ---------- Rendering ---------- */
  const RR = () => window.KitchensRoles;
  // "Owner", "Employee · Designer" or "User" (a customer without employee rights)
  function roleLabel() {
    if (RR().isOwner(user)) return 'Owner';
    const rid = RR().roleIdOf(user);
    if (!rid) return 'User';
    const r = RR().list().find(x => x.id === rid);
    return 'Employee' + (r ? ' · ' + r.name : '');
  }
  // where a logged-in person lands: employees on the dashboard, customers on the request page
  const homeRoute = () => (user && RR().isEmployee(user) ? 'tab/dashboard' : user ? 'request' : 'home');
  const noAccess = what => `<h1>No access</h1><div class="placeholder">${what} is not available for your account (${roleLabel()}).<br><small>Employees get access from their role. The owner can change roles in Branches and Roles.</small></div>`;
  function currentRoute() { return decodeURIComponent(location.hash.slice(1)) || homeRoute(); }

  function render() {
    document.body.classList.toggle('is-auth', !!user);
    if (user) { $('#userName').textContent = user.name; $('#userAvatar').textContent = user.name[0].toUpperCase(); $('#userRole').textContent = roleLabel(); }
    renderTabs(); // the tabs a person sees depend on their role

    const route = currentRoute();
    const view = $('#view');
    $$('#mainMenu a').forEach(a => a.classList.toggle('active', route === a.dataset.page));

    const isShare = route.startsWith('share/'), isCase = route.startsWith('case/');
    try {
      if (route.startsWith('profile/')) { // public profile page (#profile/<name>), open to everyone
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = window.KitchensPages.Profile(route.slice(8));
      } else if (route.startsWith('post/')) { // public blog post (#post/<id>)
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = window.KitchensPages.Post(route.slice(5));
      } else if (route.startsWith('invite/')) { // invitation link for a new employee (#invite/<token>), works without login
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = window.KitchensPages.Invite(route.slice(7));
      } else if (user && (route === 'messages' || route.startsWith('messages/'))) { // direct messages (#messages or #messages/<person>)
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = window.KitchensPages.Messages(route.slice(9));
      } else if (user && route === 'notifications') { // all notifications of the logged-in user
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = window.KitchensPages.Notifications();
      } else if (isCase && user && !RR().canTab(user, 'Flow')) { // internal case pages need access to Flow
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = noAccess('This request page');
      } else if (isShare || (isCase && user)) { // case page: staff (#case/<id>) or the client's link (#share/<id>)
        $$('#tabsRow button').forEach(b => b.classList.toggle('active', isCase && b.dataset.tab === 'Flow'));
        view.innerHTML = window.KitchensPages.Case(route.slice(isShare ? 6 : 5), isShare);
      } else if (user && route.startsWith('tab/')) {
        const tab = TABS.find(t => slug(t) === route.slice(4)) || TABS[0];
        $$('#tabsRow button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        const ext = window.KitchensPages || {};
        view.innerHTML = !RR().canTab(user, tab) ? noAccess('“' + tab + '”')
          : (TAB_PAGES[tab] || ext[tab] || (() => placeholder(tab)))();
      } else {
        $$('#tabsRow button').forEach(b => b.classList.remove('active'));
        view.innerHTML = route === 'request' ? window.KitchensPages.Request()
          : isCase || route === 'notifications' || route.startsWith('messages') ? '<h1>Please log in</h1><div class="placeholder"><button class="link" data-open="loginModal">Log in</button> to open this page.</div>'
          : (GUEST[route] || GUEST.home)();
      }
    } catch (err) { // never leave a blank page: show the problem instead
      console.error(err);
      view.innerHTML = '<div class="placeholder">This page failed to load: ' + String(err.message).replace(/[<>&]/g, '') + '</div>';
    }
    renderNotifs();
  }

  function renderTabs() {
    const shown = user ? TABS.filter(t => RR().canTab(user, t)) : [];
    $('#tabsRow').innerHTML = shown.map(t => `<button role="tab" data-tab="${t}">${t}</button>`).join('');
    const cur = decodeURIComponent(location.hash.slice(1));
    $$('#tabsRow button').forEach(b => b.classList.toggle('active', cur === 'tab/' + slug(b.dataset.tab) || (cur.startsWith('case/') && b.dataset.tab === 'Flow')));
  }

  // the bell and the message badge are drawn by js/notify.js
  function renderNotifs() { if (window.KitchensNotify) window.KitchensNotify.renderBell(); }

  /* ---------- Auth ---------- */
  // Accounts live on the server (api/index.php): passwords are hashed there and the session is an HttpOnly cookie.
  // After login / registration / accepting an invitation the server answers with the session snapshot.
  async function setSession(snap) {
    await window.KitchensApi.setSession(snap);
    user = window.KitchensApi.state.user;
    location.hash = homeRoute();
    closeModals(); render();
    if (user && window.KitchensNotify) { window.KitchensNotify.welcome(user.name); window.KitchensNotify.checkReminders(); renderNotifs(); }
  }
  async function logout() { await window.KitchensApi.logout(); user = null; location.hash = 'home'; render(); }

  /* ---------- Events ---------- */
  const closeModals = () => $$('.modal').forEach(m => m.hidden = true);

  // In-app links (href="#...") are handled here instead of by the browser: on hosts that set a <base> URL
  // (e.g. the htmlpreview.github.io proxy) a plain "#route" link would leave the page and show the raw source.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const target = a.getAttribute('href').slice(1);
    if (location.hash.slice(1) === target) render(); else location.hash = target;
  }, true);

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) { closeModals(); $('#' + open.dataset.open).hidden = false; return; }
    if (e.target.matches('[data-close]') || e.target.classList.contains('modal')) closeModals();

    const tab = e.target.closest('#tabsRow button');
    if (tab) { location.hash = 'tab/' + slug(tab.dataset.tab); return; }
  });

  $('#logoutBtn').addEventListener('click', logout);
  const busy = (form, on) => { const b = form.querySelector('button.primary'); if (b) b.disabled = on; };
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('#loginErr');
    err.textContent = ''; busy(e.target, true);
    try { await setSession(await window.KitchensApi.call('login', { email: String(fd.get('email')).trim(), password: String(fd.get('password')) })); e.target.reset(); }
    catch (ex) { err.textContent = ex.message; }
    busy(e.target, false);
  });
  $('#regForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('#regErr');
    err.textContent = ''; busy(e.target, true);
    try { await setSession(await window.KitchensApi.call('register', { name: String(fd.get('name')).trim(), email: String(fd.get('email')).trim(), password: String(fd.get('password')) })); e.target.reset(); }
    catch (ex) { err.textContent = ex.message; }
    busy(e.target, false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  window.addEventListener('hashchange', render);

  window.Kitchens = {
    TABS, ORDERS, fmt, render, setSession, getUser: () => user,
    getStages: () => stages.map(s => ({ ...s })), setStages, stageIndex, defaultStages: () => DEFAULT_STAGES.map(s => ({ ...s })),
    flowStages: () => stages.filter(s => !isArchiveStage(s)).map(s => ({ ...s })), // stages shown on the Flow board
    isArchive, archiveStageId: () => stages.find(isArchiveStage).id
  };
  // ask the server who is logged in (session cookie), then draw the page
  $('#view').innerHTML = '<p class="sub">Loading…</p>';
  window.KitchensApi.boot().then(u => {
    user = u;
    render();
    if (window.KitchensApi.state.offline) $('#view').insertAdjacentHTML('afterbegin', '<div class="placeholder">The server does not answer. Some features are unavailable; please reload the page.</div>');
    if (user && window.KitchensNotify) { window.KitchensNotify.welcome(user.name); window.KitchensNotify.checkReminders(); renderNotifs(); }
  });
})();
