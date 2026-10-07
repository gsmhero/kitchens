/* "Request" page (main menu, open to guests and registered users).
   - Anyone picks a registered user from a list and fills in THAT user's request form
     (the default is the "Client brief" form; every registered user can customise their own copy).
   - The request is stored in the chosen user's profile (their inbox), where they see it on this page.
   Prototype: everything lives in localStorage, keyed by user name. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const TEMPLATE = 'Client brief';
  const SEED_USERS = [
    { name: 'A. Smith', role: 'Manager' },
    { name: 'B. Jones', role: 'Designer' },
    { name: 'C. Brown', role: 'Workshop' }
  ];
  const FF = () => window.KitchensForms;
  const esc = s => FF().esc(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => window.Kitchens.render();
  const me = () => window.Kitchens.getUser();
  const keyOf = (name, what) => 'request:' + encodeURIComponent(name) + ':' + what;

  const users = () => {
    const extra = load('users', []).filter(u => !SEED_USERS.some(s => s.name === u.name));
    return [...SEED_USERS, ...extra.map(u => ({ name: u.name, role: 'Member' }))];
  };
  const formOf = name => load(keyOf(name, 'form'), null) || FF().template(TEMPLATE);
  const inbox = name => load(keyOf(name, 'subs'), []);
  const isCustom = name => !!load(keyOf(name, 'form'), null);

  let target = '';      // user the visitor sends a request to
  let sent = '';        // name of the user the last request was sent to (confirmation banner)
  let mode = 'fill';    // fill | build (own form editor)
  let draft = null;
  window.addEventListener('hashchange', () => { mode = 'fill'; draft = null; sent = ''; });

  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const val = (fl, v) => fl.type === 'checkbox' ? (v ? 'Yes' : 'No') : (esc(v) || '—');
  const fieldRow = (fl, preview) => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label) || '<i>(no label)</i>'}${fl.required ? ' <b class="req">*</b>' : ''}</span>${FF().inputFor(preview ? { ...fl, required: false } : fl)}</label>`;

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
          <b>${esc(u.name)}</b><small>${esc(u.role)}</small>
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
        <h3>${esc(form.name)}</h3>
        ${form.fields.map(fl => fieldRow(fl)).join('')}
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
      <button class="btn" data-rq="customize">⚙ Customize my form</button></div>
    <p class="sub">${form.fields.length} fields. Visitors who choose you see exactly this form.</p>

    <div class="section-head"><h2>Incoming requests <span class="count">${items.length}</span></h2></div>
    ${items.map(s => `
      <div class="card req-item">
        <div class="req-top"><b>${esc(s.from.name)}</b> <span class="pill">${esc(s.from.contact)}</span>
          <span class="pill">${s.from.guest ? 'guest' : 'registered user'}</span>
          <span class="sub">${fmtDate(s.at)}</span>
          <button class="link danger-t" data-rq="del-sub" data-id="${s.id}">delete</button></div>
        <dl>${s.fields.map(fl => `<dt>${esc(fl.label)}</dt><dd>${val(fl, s.values[fl.id])}</dd>`).join('')}</dl>
      </div>`).join('') || '<div class="placeholder">No requests yet.</div>'}`;
  }

  function buildView() {
    const T = FF().TYPES;
    return `
    <button class="link back" data-rq="cancel">← Back to request</button>
    <h1>Customize my form</h1>
    <p class="sub">Changes apply only to your own form (the one visitors fill in when they choose you). Requests you already received stay as they are.</p>
    <div class="grid g2 build">
      <div class="card">
        <h3>Fields</h3>
        ${draft.fields.map((fl, i) => `
          <div class="fld">
            <input data-i="${i}" data-k="label" value="${esc(fl.label)}" placeholder="Field label">
            <select data-i="${i}" data-k="type">${Object.entries(T).map(([k, l]) => `<option value="${k}" ${k === fl.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <label class="inline"><input type="checkbox" data-i="${i}" data-k="required" ${fl.required ? 'checked' : ''}> req.</label>
            <span class="fld-btns">
              <button type="button" class="btn small" data-rq="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn small" data-rq="down" data-i="${i}" ${i === draft.fields.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn small danger" data-rq="rm" data-i="${i}">×</button>
            </span>
            ${fl.type === 'select' ? `<input class="opts" data-i="${i}" data-k="options" value="${esc(fl.options)}" placeholder="Options, comma separated">` : ''}
          </div>`).join('')}
        <button class="btn" data-rq="add-field">+ Add field</button>
        <div class="actions end">
          <button class="btn primary" data-rq="save">Save my form</button>
          <button class="btn" data-rq="cancel">Cancel</button>
          <button class="btn danger" data-rq="reset">Reset to default</button>
        </div>
      </div>
      <div class="card"><h3>Preview</h3>
        <form class="fill" onsubmit="return false">
          ${draft.fields.map(fl => fieldRow(fl, true)).join('') || '<p class="sub">Add fields to see the preview.</p>'}
        </form></div>
    </div>`;
  }

  window.KitchensPages.Request = () => {
    if (mode === 'build' && (!draft || !me())) mode = 'fill';
    if (mode === 'build') return buildView();
    return `
    <h1>Request</h1>
    <p class="sub">Send a request for a new kitchen to one of our people. No account needed.</p>
    ${sendSection()}
    ${me() ? profileSection() : ''}`;
  };

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-rq]');
    if (!el) return;
    const i = +el.dataset.i;
    switch (el.dataset.rq) {
      case 'pick': target = el.dataset.name; sent = ''; redraw(); break;
      case 'customize': draft = { fields: formOf(me().name).fields }; mode = 'build'; redraw(); break;
      case 'cancel': draft = null; mode = 'fill'; redraw(); break;
      case 'add-field': draft.fields.push(FF().f('')); redraw(); break;
      case 'rm': draft.fields.splice(i, 1); redraw(); break;
      case 'up': case 'down': {
        const j = el.dataset.rq === 'up' ? i - 1 : i + 1;
        [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]]; redraw(); break;
      }
      case 'save':
        draft.fields = draft.fields.filter(x => x.label.trim());
        save(keyOf(me().name, 'form'), { ...FF().template(TEMPLATE), fields: draft.fields });
        draft = null; mode = 'fill'; redraw();
        break;
      case 'reset':
        if (confirm('Reset your form to the default Client brief?')) {
          try { localStorage.removeItem(keyOf(me().name, 'form')); } catch (err) {}
          draft = null; mode = 'fill'; redraw();
        }
        break;
      case 'del-sub':
        save(keyOf(me().name, 'subs'), inbox(me().name).filter(s => s.id !== el.dataset.id)); redraw();
        break;
    }
  });

  document.addEventListener('input', e => {
    if (mode !== 'build' || !draft || !e.target.dataset.k) return;
    const t = e.target;
    draft.fields[+t.dataset.i][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
  });
  document.addEventListener('change', e => {
    if (mode === 'build' && draft && e.target.dataset.k === 'type') redraw();
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
    // the field list is stored with the request so it stays readable if the form is customised later
    save(keyOf(to, 'subs'), [...inbox(to), { id: FF().uid(), at: Date.now(), from, values, fields: form.fields.map(({ id, label, type }) => ({ id, label, type })) }]);
    sent = to; target = '';
    redraw();
    window.scrollTo(0, 0);
  });
})();
