/* "Request" page (main menu, open to guests and registered users).
   - Anyone picks a registered user from a list and fills in THAT user's request form.
   - Every registered user edits their own form in the Forms tab (editor lives in forms.js);
     the default is the "Client brief" form.
   - The request is stored in the chosen user's profile (their inbox), shown on this page.
   Prototype: everything lives in localStorage, keyed by user name. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const TEMPLATE = 'Client brief';
  const FF = () => window.KitchensForms;
  const esc = s => FF().esc(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => window.Kitchens.render();
  const me = () => window.Kitchens.getUser();
  const keyOf = (name, what) => 'request:' + encodeURIComponent(name) + ':' + what;

  // people a request can be sent to: employees (people with a role in Staff) and the owner. Customers are not listed.
  const roleText = name => {
    if (window.KitchensRoles.isOwner({ name })) return 'Owner';
    const r = window.KitchensRoles.list().find(x => x.id === window.KitchensRoles.roleIdOf({ name }));
    return r ? r.name : 'Employee';
  };
  const users = () => {
    const names = new Set([...window.KitchensStaff.names(), window.KitchensRoles.ownerName()].filter(Boolean));
    return [...names].filter(n => window.KitchensRoles.isEmployee({ name: n })).sort((a, b) => a.localeCompare(b)).map(n => ({ name: n, role: roleText(n) }));
  };
  const isCustom = name => !!load(keyOf(name, 'form'), null);
  const formOf = name => load(keyOf(name, 'form'), null) || FF().template(TEMPLATE);
  // entries saved by early prototype versions lack `from` / `fields`; ignore them instead of breaking pages
  const inbox = name => load(keyOf(name, 'subs'), []).filter(s => s && s.from && Array.isArray(s.fields) && s.values);

  /* API used by the Forms tab editor */
  window.KitchensRequest = {
    getForm: formOf,
    isCustom,
    saveForm: (name, form) => save(keyOf(name, 'form'), form),
    resetForm: name => { try { localStorage.removeItem(keyOf(name, 'form')); } catch (e) {} },
    // requests of every recipient, for the Flow tab: [{ to, sub }] (sub.stage = stage id; missing/unknown = first stage)
    all: () => {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const m = /^request:(.+):subs$/.exec(localStorage.key(i));
          if (m) { const to = decodeURIComponent(m[1]); inbox(to).forEach(sub => out.push({ to, sub })); }
        }
      } catch (e) {}
      return out;
    },
    users,
    // save a changed request back; false if the browser storage is full
    replace: (to, sub) => {
      try { localStorage.setItem(keyOf(to, 'subs'), JSON.stringify(inbox(to).map(s => s.id === sub.id ? sub : s))); return true; } catch (e) { return false; }
    },
    // archivedAt: time the request was archived (0 when it is not in the Archive stage)
    setStage: (to, id, stage, archivedAt = 0) => save(keyOf(to, 'subs'), inbox(to).map(s => s.id === id ? { ...s, stage, archivedAt, prevStage: archivedAt ? (s.archivedAt ? s.prevStage : s.stage) : s.prevStage } : s)),
    // permanently delete a request (used by the Archive tab)
    remove: (to, id) => save(keyOf(to, 'subs'), inbox(to).filter(s => s.id !== id))
  };

  let target = '';      // user the visitor sends a request to
  let sent = '';        // name of the user the last request was sent to (confirmation banner)
  window.addEventListener('hashchange', () => { sent = ''; });

  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const val = (fl, v) => fl.type === 'checkbox' ? (v ? 'Yes' : 'No') : (esc(v) || '—');
  const fieldRow = fl => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label)}${fl.required ? ' <b class="req">*</b>' : ''}</span>${FF().inputFor(fl)}</label>`;

  /* ---------- Sending a request ---------- */
  function sendSection() {
    const list = users();
    const t = list.find(u => u.name === target);
    const user = me();
    return `
    <div class="section-head"><h2>1. Choose who to send your request to</h2></div>
    <div class="grid g4 pick">
      ${list.map(u => `
        <button class="card pick-card ${u.name === target ? 'sel' : ''}" data-rq="pick" data-name="${esc(u.name)}">
          <span class="avatar">${esc(u.name[0].toUpperCase())}</span>
          <b>${esc(u.name)}${user && user.name === u.name ? ' (you)' : ''}</b><small>${esc(u.role)}${isCustom(u.name) ? ' · custom form' : ''}</small>
        </button>`).join('')}
    </div>
    ${sent ? `<div class="notice ok">✔ Your request was sent to <b>${esc(sent)}</b>. They will see it in their profile.</div>` : ''}
    ${t ? (() => {
      const form = formOf(t.name);
      return `
      <div class="section-head"><h2>2. Fill in ${esc(t.name)}'s request form</h2></div>
      <form class="card fill" id="requestForm" data-target="${esc(t.name)}">
        <label><span>Your name <b class="req">*</b></span><input name="__name" required value="${user ? esc(user.name) : ''}"></label>
        <label><span>Phone or email <b class="req">*</b></span><input name="__contact" required></label>
        <hr>
        <h3>${esc(form.name)} <span class="count">${isCustom(t.name) ? 'customised by ' + esc(t.name) : 'default form'}</span></h3>
        ${form.desc ? `<p class="sub">${esc(form.desc)}</p>` : ''}
        ${form.fields.map(fieldRow).join('')}
        <div class="actions"><button class="btn primary">Send request</button></div>
      </form>`;
    })() : '<p class="sub">Select a person above to see their request form.</p>'}`;
  }

  /* ---------- Own profile (registered users) ---------- */
  function profileSection() {
    const user = me();
    const items = inbox(user.name).sort((a, b) => b.at - a.at);
    const form = formOf(user.name);
    return `
    <hr class="sep">
    <h1>My profile — ${esc(user.name)}</h1>
    <div class="section-head"><h2>My request form <span class="count">${esc(form.name)}${isCustom(user.name) ? ' · customised' : ' · default'}</span></h2>
      <button class="btn" data-rq="edit-form">⚙ Edit my form in Forms tab</button></div>
    <p class="sub">${form.fields.length} fields. Visitors who choose you fill in exactly this form.</p>

    <div class="section-head"><h2>Incoming requests <span class="count">${items.length}</span></h2></div>
    ${items.map(s => `
      <div class="card req-item">
        <div class="req-top"><b>${esc(s.from.name)}</b> <span class="pill">${esc(s.from.contact)}</span>
          <span class="pill">${s.from.guest ? 'guest' : 'registered user'}</span>
          <a class="link" href="#case/${s.id}">Open</a>
          <a class="pill ok" href="#tab/flow">Stage: ${esc(window.Kitchens.getStages()[window.Kitchens.stageIndex(s.stage)].name)}</a>
          <span class="sub">${fmtDate(s.at)}</span>
          <button class="link danger-t" data-rq="del-sub" data-id="${s.id}">delete</button></div>
        <dl>${s.fields.map(fl => `<dt>${esc(fl.label)}</dt><dd>${val(fl, s.values[fl.id])}</dd>`).join('')}</dl>
      </div>`).join('') || '<div class="placeholder">No requests yet.</div>'}`;
  }

  window.KitchensPages.Request = () => `
    <h1>Request</h1>
    <p class="sub">Send a request for a new kitchen to one of our people. No account needed.</p>
    ${sendSection()}
    ${me() && window.KitchensRoles.isEmployee(me()) ? profileSection() : ''}`;

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-rq]');
    if (!el) return;
    switch (el.dataset.rq) {
      case 'pick': target = el.dataset.name; sent = ''; redraw(); break;
      case 'edit-form': FF().openRequestEditor(); break;
      case 'del-sub':
        save(keyOf(me().name, 'subs'), inbox(me().name).filter(s => s.id !== el.dataset.id)); redraw();
        break;
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'requestForm') return;
    e.preventDefault();
    const to = e.target.dataset.target;
    const form = formOf(to);
    const values = {};
    form.fields.forEach(fl => {
      const el = e.target.elements[fl.id];
      values[fl.id] = fl.type === 'checkbox' ? el.checked : el.value;
    });
    const from = { name: e.target.elements.__name.value.trim(), contact: e.target.elements.__contact.value.trim(), guest: !me() };
    // the field list is stored with the request so it stays readable if the form is edited later
    const newId = FF().uid();
    save(keyOf(to, 'subs'), [...inbox(to), { id: newId, at: Date.now(), stage: null, from, values, fields: form.fields.map(({ id, label, type }) => ({ id, label, type })) }]);
    window.KitchensNotify.push(to, { type: 'request', title: 'New request', text: `${from.name} (${from.contact}) sent you a request`, link: '#case/' + newId });
    sent = to; target = '';
    redraw();
    window.scrollTo(0, 0);
  });
})();
