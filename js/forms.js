/* "Forms" page — form builder, fill-in and submissions list (saved in localStorage) */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const TYPES = { text: 'Text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Checkbox', file: 'Uploader (images, documents)' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const REQ = '__request'; // pseudo form id: the user's own form shown on the Request page
  const f = (label, type = 'text', required = false, options = '') => ({ id: uid(), label, type, required, options });

  const defaultForms = () => [
    { id: 'f1', name: 'Measurement sheet', desc: 'Filled on site by the measurer.', fields: [
      f('Client name', 'text', true), f('Address'), f('Measure date', 'date', true), f('Room width, mm', 'number'),
      f('Room length, mm', 'number'), f('Ceiling height, mm', 'number'), f('Notes', 'textarea')] },
    { id: 'f2', name: 'Client brief', desc: 'Client wishes before design starts.', fields: [
      f('Style', 'select', true, 'Modern, Classic, Loft, Scandi, Minimal'), f('Budget, ₽', 'number'),
      f('Built-in appliances', 'checkbox'), f('Wishes', 'textarea')] },
    { id: 'f3', name: 'Handover act', desc: 'Signed when the kitchen is installed.', fields: [
      f('Order #', 'number', true), f('Installation date', 'date', true), f('Client satisfied', 'checkbox'), f('Comments', 'textarea')] }
  ];

  let forms, subs;
  const init = () => { if (forms) return; forms = load('forms', null) || defaultForms(); subs = load('formSubs', []); };
  const persist = () => { save('forms', forms); save('formSubs', subs); };
  const redraw = () => window.Kitchens.render();

  /* shared helpers for other pages (e.g. Request) */
  window.KitchensForms = {
    TYPES, esc, uid, f, inputFor: (...a) => inputFor(...a), uploaderHtml: (...a) => uploaderHtml(...a), filesHtml: v => filesHtml(v),
    // forms as plain data for other pages (e.g. product types use a form as their list of fields)
    list: () => { init(); return JSON.parse(JSON.stringify(forms)); },
    create: x => { init(); const form = { id: uid(), name: x.name, desc: x.desc || '', roles: [], fields: x.fields }; forms.push(form); persist(); return form.id; },
    // opens the editor for the current user's Request form (called from the Request page)
    openRequestEditor: () => { pendingReq = true; location.hash = 'tab/forms'; },
    template: name => { init(); const x = forms.find(v => v.name === name) || defaultForms().find(v => v.name === name); return x ? JSON.parse(JSON.stringify(x)) : null; }
  };

  /* view state: list | build | fill | subs */
  let view = { mode: 'list', id: null };
  let draft = null;
  const go = (mode, id = null) => { view = { mode, id }; redraw(); };
  let pendingReq = false;
  const me = () => window.Kitchens.getUser();
  const requestDraft = () => {
    const x = window.KitchensRequest.getForm(me().name);
    return { id: REQ, name: x.name, desc: x.desc || '', fields: x.fields };
  };
  window.addEventListener('hashchange', () => {
    if (pendingReq && me()) { pendingReq = false; draft = requestDraft(); view = { mode: 'build', id: REQ }; return; }
    pendingReq = false; view = { mode: 'list', id: null }; draft = null;
  });

  const count = id => subs.filter(s => s.formId === id).length;
  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  /* ---------- Roles: forms can be assigned to roles (none = everyone); roles are shared with Branches and Roles ---------- */
  let roleFilter = ''; // list filter: show forms available to this role id ('' = all forms)
  const roleList = () => window.KitchensRoles.list();
  const rolesOf = x => { const ids = roleList().map(r => r.id); return (x.roles || []).filter(id => ids.includes(id)); }; // drop deleted roles
  const roleNames = x => { const m = Object.fromEntries(roleList().map(r => [r.id, r.name])); return rolesOf(x).map(id => m[id]); };
  const visible = x => !roleFilter || !rolesOf(x).length || rolesOf(x).includes(roleFilter);

  function rolesDialog() {
    let m = document.getElementById('rolesModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'rolesModal'; document.body.appendChild(m); }
    m.innerHTML = `<div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Edit roles">
      <button type="button" class="close" data-close>×</button>
      <h3>Edit roles</h3>
      <p class="sub">Roles are shared with the Branches and Roles tab. Changes are saved at once.</p>
      <ul class="clean role-edit">
        ${roleList().map(r => `<li><input data-rn="${r.id}" value="${esc(r.name)}" aria-label="Role name">
          ${r.locked ? '<span class="pill">🔒 always full access</span>' : `<button class="btn small danger" data-fm="role-del" data-id="${r.id}">Delete</button>`}</li>`).join('')}
      </ul>
      <form id="roleAdd" class="stage-add"><input name="name" placeholder="New role name" required><button class="btn primary">+ Add role</button></form>
      <button type="button" class="btn wide" data-close>Done</button>
    </div>`;
    m.hidden = false;
  }

  /* ---------- Views ---------- */
  function listView() {
    const shown = forms.filter(visible);
    return `
    <h1>Forms</h1>
    <p class="sub">Create forms for your team, fill them in and review what was submitted.</p>
    <div class="section-head"><h2>Your forms <span class="count">${shown.length}</span></h2>
      <span class="seg">
        <label class="inline-sel">Available to
          <select data-fm-filter><option value="">All roles</option>${roleList().map(r => `<option value="${r.id}" ${r.id === roleFilter ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <button class="btn primary" data-fm="new">+ New form</button></span></div>
    <div class="grid g3">
      ${me() ? (() => {
        const x = window.KitchensRequest.getForm(me().name), custom = window.KitchensRequest.isCustom(me().name);
        return `
        <div class="card form-card mine">
          <h3>My Request form <span class="count">${custom ? 'customised' : 'default'}</span></h3>
          <p class="sub">The form visitors fill in on the <a class="link" href="#request">Request page</a> when they choose you.</p>
          <div class="meta"><span class="pill">${x.fields.length} fields</span> <span class="pill ok">shown on #request</span></div>
          <div class="actions">
            <button class="btn small primary" data-fm="edit-req">Edit</button>
            ${custom ? '<button class="btn small danger" data-fm="reset-req">Reset to default</button>' : ''}
          </div>
        </div>`;
      })() : ''}
      ${shown.map(x => `
        <div class="card form-card">
          <h3>${esc(x.name)}</h3>
          <p class="sub">${esc(x.desc) || '&nbsp;'}</p>
          <div class="meta"><span class="pill">${x.fields.length} fields</span> <span class="pill ${count(x.id) ? 'ok' : ''}">${count(x.id)} submissions</span></div>
          <div class="meta">${roleNames(x).map(n => `<span class="pill role">${esc(n)}</span>`).join('') || '<span class="pill">Everyone</span>'}</div>
          <div class="actions">
            <button class="btn small primary" data-fm="fill" data-id="${x.id}">Fill in</button>
            <button class="btn small" data-fm="subs" data-id="${x.id}">Submissions</button>
            <button class="btn small" data-fm="edit" data-id="${x.id}">Edit</button>
            <button class="btn small" data-fm="clone" data-id="${x.id}" title="Make a copy of this form">Clone</button>
            <button class="btn small danger" data-fm="del" data-id="${x.id}">Delete</button>
          </div>
        </div>`).join('') || '<div class="placeholder">No forms yet. Click “New form”.</div>'}
    </div>`;
  }

  /* ---------- Uploader field: images and documents ----------
     The value of an uploader field is a JSON list [{ name, size, type, data }] (data = the file as a data: URL).
     A hidden input carries it, so every form (Forms, Request, Catalogue) reads it like any other field. */
  const UP_MAX_FILES = 8, UP_MAX_DOC = 600 * 1024, UP_MAX_TOTAL = 3 * 1024 * 1024;
  const upParse = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.data === 'string' && /^data:[\w.+\-\/]+;base64,/.test(x.data)) : []; } catch (e) { return []; } };
  const upIsImg = x => /^data:image\//.test(x.data);
  const upSize = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
  // how the files look when a form is displayed (answers, submissions, product cards)
  const filesHtml = v => {
    const a = upParse(v);
    if (!a.length) return '—';
    return `<span class="up-items">${a.map(x => upIsImg(x)
      ? `<button type="button" class="up-thumb" data-upview title="${esc(x.name)}"><img src="${x.data}" alt="${esc(x.name)}"></button>`
      : `<a class="up-doc" href="${x.data}" download="${esc(x.name)}">📄 <span>${esc(x.name)}</span> <small>${upSize(x.size || 0)}</small></a>`).join('')}</span>`;
  };
  const upItems = a => a.map((x, i) => `<span class="up-item">${upIsImg(x)
    ? `<button type="button" class="up-thumb" data-upview title="${esc(x.name)}"><img src="${x.data}" alt="${esc(x.name)}"></button>`
    : `<span class="up-doc">📄 <span>${esc(x.name)}</span> <small>${upSize(x.size || 0)}</small></span>`}<button type="button" class="x" data-up-rm="${i}" title="Remove">×</button></span>`).join('');
  const uploaderHtml = (name, v) => `<div class="uploader" data-up>
      <input type="hidden" name="${esc(name)}" value="${esc(v || '')}">
      <div class="up-list">${upItems(upParse(v))}</div>
      <button type="button" class="btn small" data-up-pick>+ Add images or documents</button>
      <input type="file" multiple hidden data-up-file accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip">
    </div>`;

  function inputFor(fl) {
    const n = `name="${fl.id}"`, r = fl.required ? 'required' : '';
    switch (fl.type) {
      case 'textarea': return `<textarea ${n} ${r} rows="3"></textarea>`;
      case 'select': return `<select ${n} ${r}><option value="">— choose —</option>${fl.options.split(',').map(o => o.trim()).filter(Boolean).map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
      case 'checkbox': return `<input type="checkbox" ${n} ${r}>`;
      case 'file': return uploaderHtml(fl.id, '');
      default: return `<input type="${fl.type}" ${n} ${r}>`;
    }
  }

  function fillView() {
    const x = forms.find(v => v.id === view.id);
    return `
    <button class="link back" data-fm="list">← All forms</button>
    <h1>${esc(x.name)}</h1><p class="sub">${esc(x.desc)}</p>
    <form class="card fill" id="fillForm" data-id="${x.id}">
      ${x.fields.map(fl => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label)}${fl.required ? ' <b class="req">*</b>' : ''}</span>${inputFor(fl)}</label>`).join('') || '<p class="sub">This form has no fields yet.</p>'}
      <div class="actions"><button class="btn primary">Submit</button><button type="button" class="btn" data-fm="list">Cancel</button></div>
    </form>`;
  }

  function subsView() {
    const x = forms.find(v => v.id === view.id);
    const rows = subs.filter(s => s.formId === x.id).sort((a, b) => b.at - a.at);
    const show = (fl, v) => fl.type === 'checkbox' ? (v ? '✔' : '—') : fl.type === 'file' ? filesHtml(v) : esc(v);
    return `
    <button class="link back" data-fm="list">← All forms</button>
    <div class="section-head"><h1>${esc(x.name)} — submissions</h1>
      <button class="btn primary" data-fm="fill" data-id="${x.id}">+ Fill in</button></div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Submitted</th>${x.fields.map(fl => `<th>${esc(fl.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map(s => `<tr><td>${fmtDate(s.at)}</td>${x.fields.map(fl => `<td>${show(fl, s.values[fl.id])}</td>`).join('')}
        <td><button class="link danger-t" data-fm="del-sub" data-id="${s.id}">delete</button></td></tr>`).join('') ||
        `<tr><td colspan="${x.fields.length + 2}" class="sub">No submissions yet.</td></tr>`}</tbody>
    </table></div></div>`;
  }

  function buildView() {
    return `
    <button class="link back" data-fm="list">← All forms</button>
    <h1>${draft.id === REQ ? 'Edit my Request form' : forms.some(v => v.id === draft.id) ? 'Edit form' : 'New form'}</h1>
    ${draft.id === REQ ? '<p class="sub">This is the form shown on the Request page when a visitor chooses you. Only you can change it.</p>' : ''}
    <div class="grid g2 build">
      <div class="card">
        <label class="stack">Form name<input data-d="name" value="${esc(draft.name)}" placeholder="e.g. Measurement sheet"></label>
        <label class="stack">Description<input data-d="desc" value="${esc(draft.desc)}"></label>
        ${draft.id === REQ ? '' : `
        <div class="roles-box">
          <h3>Available to roles</h3>
          <div class="role-checks">${roleList().map(r => `<label class="inline"><input type="checkbox" data-role="${r.id}" ${rolesOf(draft).includes(r.id) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}</div>
          <p class="hint">Nothing selected = available to everyone.</p>
          <button type="button" class="btn small" data-fm="roles">⚙ Edit roles</button>
        </div>`}
        <h3>Fields</h3>
        ${draft.fields.map((fl, i) => `
          <div class="fld">
            <input data-i="${i}" data-k="label" value="${esc(fl.label)}" placeholder="Field label">
            <select data-i="${i}" data-k="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === fl.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <label class="inline"><input type="checkbox" data-i="${i}" data-k="required" ${fl.required ? 'checked' : ''}> req.</label>
            <span class="fld-btns">
              <button type="button" class="btn small" data-fm="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn small" data-fm="down" data-i="${i}" ${i === draft.fields.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn small danger" data-fm="rm" data-i="${i}">×</button>
            </span>
            ${fl.type === 'select' ? `<input class="opts" data-i="${i}" data-k="options" value="${esc(fl.options)}" placeholder="Options, comma separated">` : ''}
          </div>`).join('')}
        <button class="btn" data-fm="add-field">+ Add field</button>
        <div class="actions end"><button class="btn primary" data-fm="save">Save form</button><button class="btn" data-fm="list">Cancel</button></div>
      </div>
      <div class="card"><h3>Preview</h3>
        <form class="fill" onsubmit="return false">
          ${draft.fields.map(fl => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label) || '<i>(no label)</i>'}${fl.required ? ' <b class="req">*</b>' : ''}</span>${inputFor({ ...fl, required: false })}</label>`).join('') || '<p class="sub">Add fields to see the preview.</p>'}
        </form></div>
    </div>`;
  }

  window.KitchensPages['Forms'] = () => {
    init();
    if (view.mode !== 'list' && !(view.mode === 'build' && draft) && !forms.some(v => v.id === view.id)) view = { mode: 'list', id: null };
    return { list: listView, fill: fillView, subs: subsView, build: buildView }[view.mode]();
  };

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-fm]');
    if (!el) return;
    const id = el.dataset.id, i = +el.dataset.i;
    switch (el.dataset.fm) {
      case 'list': draft = null; go('list'); break;
      case 'new': draft = { id: uid(), name: '', desc: '', roles: [], fields: [f('')] }; go('build'); break;
      case 'roles': rolesDialog(); break;
      case 'role-del': {
        const r = roleList().find(x => x.id === id);
        if (confirm(`Delete role "${r.name}"? A form assigned only to this role becomes available to everyone.`)) {
          window.KitchensRoles.remove(id);
          if (draft) draft.roles = rolesOf(draft);
          if (roleFilter === id) roleFilter = '';
          rolesDialog(); redraw();
        }
        break;
      }
      case 'edit': draft = JSON.parse(JSON.stringify(forms.find(v => v.id === id))); go('build'); break;
      case 'clone': { // the copy opens in the editor and is saved with "Save form"
        draft = JSON.parse(JSON.stringify(forms.find(v => v.id === id)));
        draft.id = uid(); draft.name = draft.name + ' (copy)'; draft.fields.forEach(fl => { fl.id = uid(); });
        go('build'); break;
      }
      case 'edit-req': draft = requestDraft(); go('build', REQ); break;
      case 'reset-req':
        if (confirm('Reset your Request form to the default Client brief?')) { window.KitchensRequest.resetForm(me().name); redraw(); }
        break;
      case 'fill': go('fill', id); break;
      case 'subs': go('subs', id); break;
      case 'del': {
        const x = forms.find(v => v.id === id);
        if (confirm(`Delete form "${x.name}" and its ${count(id)} submissions?`)) {
          forms = forms.filter(v => v.id !== id); subs = subs.filter(s => s.formId !== id); persist(); redraw();
        }
        break;
      }
      case 'del-sub': subs = subs.filter(s => s.id !== id); persist(); redraw(); break;
      case 'add-field': draft.fields.push(f('')); redraw(); break;
      case 'rm': draft.fields.splice(i, 1); redraw(); break;
      case 'up': case 'down': {
        const j = el.dataset.fm === 'up' ? i - 1 : i + 1;
        [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]]; redraw(); break;
      }
      case 'save': {
        draft.fields = draft.fields.filter(x => x.label.trim());
        if (!draft.name.trim()) { alert('Please enter a form name.'); return; }
        if (draft.id === REQ) {
          window.KitchensRequest.saveForm(me().name, { name: draft.name, desc: draft.desc, fields: draft.fields });
          draft = null; go('list'); break;
        }
        const k = forms.findIndex(v => v.id === draft.id);
        if (k >= 0) forms[k] = draft; else forms.push(draft);
        persist(); draft = null; go('list');
        break;
      }
    }
  });

  /* builder inputs: update draft without redrawing (keeps focus); preview refreshed on change */
  document.addEventListener('input', e => {
    if (!draft) return;
    const t = e.target;
    if (t.dataset.d) draft[t.dataset.d] = t.value;
    else if (t.dataset.k) draft.fields[+t.dataset.i][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (draft && t.dataset.k === 'type') redraw();
    if (draft && t.dataset.role) { // role checkbox in the editor
      const set = new Set(draft.roles || []);
      t.checked ? set.add(t.dataset.role) : set.delete(t.dataset.role);
      draft.roles = [...set];
    }
    if (t.dataset.rn !== undefined) { // rename a role in the Edit roles dialog
      const name = t.value.trim();
      if (name) { window.KitchensRoles.rename(t.dataset.rn, name); redraw(); } else rolesDialog();
    }
    if (t.hasAttribute && t.hasAttribute('data-fm-filter')) { roleFilter = t.value; redraw(); }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'roleAdd') {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (name) { window.KitchensRoles.add(name); rolesDialog(); redraw(); }
      return;
    }
    if (e.target.id !== 'fillForm') return;
    e.preventDefault();
    const x = forms.find(v => v.id === e.target.dataset.id);
    const values = {};
    x.fields.forEach(fl => {
      const el = e.target.elements[fl.id];
      values[fl.id] = fl.type === 'checkbox' ? el.checked : el.value;
    });
    subs.push({ id: uid(), formId: x.id, at: Date.now(), values });
    persist(); go('subs', x.id);
  });

  /* ---------- Uploader events ---------- */
  const upBox = el => el.closest('[data-up]');
  const upField = box => box.querySelector('input[type=hidden]');
  const upSet = (box, a) => { upField(box).value = JSON.stringify(a); box.querySelector('.up-list').innerHTML = upItems(a); };
  const readData = file => new Promise(res => { const fr = new FileReader(); fr.onerror = () => res(null); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
  document.addEventListener('click', e => {
    const pick = e.target.closest('[data-up-pick]');
    if (pick) { upBox(pick).querySelector('[data-up-file]').click(); return; }
    const rm = e.target.closest('[data-up-rm]');
    if (rm) { const box = upBox(rm), a = upParse(upField(box).value); a.splice(+rm.dataset.upRm, 1); upSet(box, a); return; }
    const view = e.target.closest('[data-upview]');
    if (view && view.querySelector('img')) { // a picture, full size
      let m = document.getElementById('upModal');
      if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'upModal'; document.body.appendChild(m); }
      m.innerHTML = `<div class="modal-card lightbox"><button type="button" class="close" data-close>×</button><img src="${view.querySelector('img').src}" alt=""></div>`;
      m.hidden = false;
    }
  });
  document.addEventListener('change', async e => {
    const inp = e.target.closest && e.target.closest('[data-up-file]');
    if (!inp) return;
    const box = upBox(inp), a = upParse(upField(box).value), files = [...inp.files], skipped = [];
    inp.value = '';
    for (const file of files) {
      if (a.length >= UP_MAX_FILES) { skipped.push(file.name + ' (at most ' + UP_MAX_FILES + ' files)'); continue; }
      if (/^image\//.test(file.type)) {
        const data = await window.KitchensBlocks.readImage(file, 1400, 0.72);
        if (data) a.push({ name: file.name.replace(/\.\w+$/, '') + '.jpg', size: Math.round(data.length * 0.75), type: 'image/jpeg', data }); else skipped.push(file.name);
      } else if (file.size > UP_MAX_DOC) skipped.push(file.name + ' (over ' + upSize(UP_MAX_DOC) + ')');
      else { const data = await readData(file); if (data) a.push({ name: file.name, size: file.size, type: file.type, data }); else skipped.push(file.name); }
    }
    if (JSON.stringify(a).length > UP_MAX_TOTAL) { alert('There is too much data in this field. Remove some files or use smaller ones.'); return; }
    upSet(box, a);
    if (skipped.length) alert('Not added: ' + skipped.join(', '));
  });
})();
