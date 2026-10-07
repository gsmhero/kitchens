/* Notifications — one list per user (stored under "notifs:<name>").
   Other pages create notifications with KitchensNotify.push(user, {...}) or pushAccess(permission, level, {...}):
   new requests, client comments, offer decisions, assigned tasks and measures, low stock, answers in Knowledge, and reminders
   for overdue / due-today tasks. This module draws the bell (badge, dropdown), the "all notifications" page (#notifications),
   small pop-up toasts, and refreshes when another browser tab changes the data.
   Prototype: everything lives in this browser's localStorage, so "another user" means another login in the same browser. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const me = () => (K() && K().getUser() || {}).name || '';
  const keyOf = name => 'notifs:' + encodeURIComponent(name);
  const uid = () => window.KitchensForms.uid();
  const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const TYPES = { request: ['📥', 'Requests'], comment: ['💬', 'Comments'], offer: ['💼', 'Offers'], task: ['✅', 'Tasks'], measure: ['📐', 'Measures'], stock: ['📦', 'Warehouse'], knowledge: ['❓', 'Knowledge'], staff: ['👥', 'Staff'], system: ['🔔', 'System'] };

  const ago = t => {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 172800) return 'yesterday';
    return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  /* ---------- data ---------- */
  const list = name => load(keyOf(name || me())).sort((a, b) => b.at - a.at);
  const unread = name => list(name).filter(n => !n.read).length;

  function push(to, n) {
    if (!to) return;
    if (to === me() && !n.force) return; // you do not notify yourself
    const items = load(keyOf(to));
    items.unshift({ id: uid(), type: n.type || 'system', title: n.title || '', text: n.text || '', link: n.link || '', at: Date.now(), read: false });
    store(keyOf(to), items.slice(0, 200));
    if (to === me()) renderBell();
  }
  // notify every employee whose role has at least `min` on the permission row (e.g. 'Warehouse', 1)
  function pushAccess(permission, min, n) {
    const names = new Set([...window.KitchensStaff.names()]);
    names.forEach(nm => { if (window.KitchensRoles.level({ name: nm }, permission) >= min) push(nm, n); });
  }
  const mutate = fn => { const items = load(keyOf(me())); fn(items); store(keyOf(me()), items); renderBell(); };

  /* ---------- toast ---------- */
  function toast(text, link) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = link ? `<a href="${esc(link)}">${esc(text)}</a>` : esc(text);
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 5000);
  }

  /* ---------- reminders for my tasks (once per task and day) ---------- */
  function checkReminders() {
    const name = me();
    if (!name || !window.KitchensTodo || window.KitchensRoles.level(K().getUser(), 'ToDo') < 1) return;
    const k = 'reminded:' + encodeURIComponent(name), today = todayISO();
    let r = {}; try { r = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { r = {}; }
    if (r.date !== today) r = { date: today, ids: [] };
    window.KitchensTodo.list().filter(t => t.assignee === name && t.status !== 'done' && (t.overdue || t.due === today)).forEach(t => {
      const tag = t.id + (t.overdue ? ':late' : ':today');
      if (r.ids.includes(tag)) return;
      r.ids.push(tag);
      push(name, { type: 'task', force: true, title: t.overdue ? 'Task overdue' : 'Task due today', text: t.title, link: '#tab/todo' });
    });
    store(k, r);
  }

  /* ---------- the bell ---------- */
  const item = n => `<li class="${n.read ? 'read' : ''}"><a href="${esc(n.link || '#notifications')}" data-nid="${n.id}">
    <span class="n-ico">${(TYPES[n.type] || TYPES.system)[0]}</span><span class="n-body"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${ago(n.at)}</small></span></a></li>`;

  function renderBell() {
    const name = me();
    if (!name) return;
    const items = list();
    const u = items.filter(n => !n.read).length;
    const b = document.getElementById('notifCount'); if (b) { b.textContent = u > 99 ? '99+' : u; b.classList.toggle('zero', !u); }
    const ul = document.getElementById('notifList');
    if (ul) ul.innerHTML = items.slice(0, 8).map(item).join('') || '<li class="empty">No notifications yet.</li>';
    const m = document.getElementById('msgCount');
    if (m && window.KitchensMessages) { const c = window.KitchensMessages.unread(); m.textContent = c > 99 ? '99+' : c; m.classList.toggle('zero', !c); }
  }

  /* ---------- the page ---------- */
  let filter = 'all', typeF = '';
  window.addEventListener('hashchange', () => { filter = 'all'; typeF = ''; });

  window.KitchensPages.Notifications = () => {
    const all = list(), shown = all.filter(n => (filter === 'all' || !n.read) && (!typeF || n.type === typeF));
    const types = [...new Set(all.map(n => n.type))];
    return `
    <h1>Notifications</h1>
    <p class="sub">What happened in the system and needs your attention. ${unread() ? `<b>${unread()} unread.</b>` : 'You are all caught up.'}</p>
    <div class="kb-bar">
      <span class="seg"><button class="btn small ${filter === 'all' ? 'primary' : ''}" data-nt="filter" data-v="all">All</button><button class="btn small ${filter === 'unread' ? 'primary' : ''}" data-nt="filter" data-v="unread">Unread</button></span>
      <select id="ntType" aria-label="Type"><option value="">All types</option>${types.map(t => `<option value="${t}" ${t === typeF ? 'selected' : ''}>${(TYPES[t] || TYPES.system)[1]}</option>`).join('')}</select>
      <button class="btn" data-nt="read-all">Mark all as read</button>
      <button class="btn danger" data-nt="clear">Clear all</button>
    </div>
    <div class="card nt-list">
      ${shown.map(n => `<div class="nt-row ${n.read ? 'read' : ''}">
        <span class="n-ico">${(TYPES[n.type] || TYPES.system)[0]}</span>
        <a class="n-body" href="${esc(n.link || '#notifications')}" data-nid="${n.id}"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${new Date(n.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · ${ago(n.at)}</small></a>
        ${n.read ? '' : '<span class="dot" title="Unread"></span>'}
        <button class="x" data-nt="del" data-id="${n.id}" title="Delete">×</button></div>`).join('') || '<div class="placeholder">Nothing here.</div>'}
    </div>`;
  };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const panel = document.getElementById('notifPanel');
    if (e.target.closest('#notifBtn')) { panel.hidden = !panel.hidden; if (!panel.hidden) renderBell(); return; }
    const link = e.target.closest('[data-nid]');
    if (link) { const id = link.dataset.nid; mutate(items => { const n = items.find(x => x.id === id); if (n) n.read = true; }); if (panel) panel.hidden = true; return; }
    if (e.target.closest('#notifClear')) { mutate(items => items.forEach(n => { n.read = true; })); return; }
    if (e.target.closest('#notifAll')) { panel.hidden = true; return; }
    if (panel && !panel.hidden && !e.target.closest('#notifPanel')) panel.hidden = true;

    const el = e.target.closest('[data-nt]');
    if (!el) return;
    const d = el.dataset;
    if (d.nt === 'filter') { filter = d.v; K().render(); }
    if (d.nt === 'read-all') { mutate(items => items.forEach(n => { n.read = true; })); K().render(); }
    if (d.nt === 'clear') { if (confirm('Delete all your notifications?')) { store(keyOf(me()), []); K().render(); } }
    if (d.nt === 'del') { mutate(items => { items.splice(items.findIndex(x => x.id === d.id), 1); }); K().render(); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'ntType') { typeF = e.target.value; K().render(); } });

  // another browser tab changed this user's data: refresh the badges, show a toast for new notifications
  window.addEventListener('storage', e => {
    const name = me();
    if (!name || !e.key) return;
    if (e.key === keyOf(name)) {
      let before = [], after = [];
      try { before = JSON.parse(e.oldValue) || []; after = JSON.parse(e.newValue) || []; } catch (x) { /* ignore */ }
      const known = new Set(before.map(n => n.id));
      after.filter(n => !known.has(n.id) && !n.read).slice(0, 3).forEach(n => toast(n.title + (n.text ? ': ' + n.text : ''), n.link));
      renderBell();
      if (location.hash === '#notifications') K().render();
    }
  });

  window.KitchensNotify = { push, pushAccess, list, unread, toast, renderBell, checkReminders, TYPES,
    // first visit of a user: a welcome note, so the bell is not mysteriously empty
    welcome: name => { if (localStorage.getItem(keyOf(name)) === null) push(name, { type: 'system', force: true, title: 'Welcome', text: 'Notifications about requests, offers, tasks and messages appear here.', link: '#notifications' }); } };

  // (the first-visit note and the task reminders are started by app.js once every script has loaded and a user is known)
})();
