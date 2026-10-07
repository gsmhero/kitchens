/* "Forms" page — form builder, fill-in and submissions list (saved in localStorage) */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const TYPES = { text: 'Text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Checkbox' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => Math.random().toString(36).slice(2, 9);
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

  /* view state: list | build | fill | subs */
  let view = { mode: 'list', id: null };
  let draft = null;
  const go = (mode, id = null) => { view = { mode, id }; redraw(); };
  window.addEventListener('hashchange', () => { view = { mode: 'list', id: null }; draft = null; });

  const count = id => subs.filter(s => s.formId === id).length;
  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  /* ---------- Views ---------- */
  function listView() {
    return `
    <h1>Forms</h1>
    <p class="sub">Create forms for your team, fill them in and review what was submitted.</p>
    <div class="section-head"><h2>Your forms <span class="count">${forms.length}</span></h2>
      <button class="btn primary" data-fm="new">+ New form</button></div>
    <div class="grid g3">
      ${forms.map(x => `
        <div class="card form-card">
          <h3>${esc(x.name)}</h3>
          <p class="sub">${esc(x.desc) || '&nbsp;'}</p>
          <div class="meta"><span class="pill">${x.fields.length} fields</span> <span class="pill ${count(x.id) ? 'ok' : ''}">${count(x.id)} submissions</span></div>
          <div class="actions">
            <button class="btn small primary" data-fm="fill" data-id="${x.id}">Fill in</button>
            <button class="btn small" data-fm="subs" data-id="${x.id}">Submissions</button>
            <button class="btn small" data-fm="edit" data-id="${x.id}">Edit</button>
            <button class="btn small danger" data-fm="del" data-id="${x.id}">Delete</button>
          </div>
        </div>`).join('') || '<div class="placeholder">No forms yet. Click “New form”.</div>'}
    </div>`;
  }

  function inputFor(fl) {
    const n = `name="${fl.id}"`, r = fl.required ? 'required' : '';
    switch (fl.type) {
      case 'textarea': return `<textarea ${n} ${r} rows="3"></textarea>`;
      case 'select': return `<select ${n} ${r}><option value="">— choose —</option>${fl.options.split(',').map(o => o.trim()).filter(Boolean).map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
      case 'checkbox': return `<input type="checkbox" ${n} ${r}>`;
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
    const show = (fl, v) => fl.type === 'checkbox' ? (v ? '✔' : '—') : esc(v);
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
    <h1>${forms.some(v => v.id === draft.id) ? 'Edit form' : 'New form'}</h1>
    <div class="grid g2 build">
      <div class="card">
        <label class="stack">Form name<input data-d="name" value="${esc(draft.name)}" placeholder="e.g. Measurement sheet"></label>
        <label class="stack">Description<input data-d="desc" value="${esc(draft.desc)}"></label>
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
      case 'new': draft = { id: uid(), name: '', desc: '', fields: [f('')] }; go('build'); break;
      case 'edit': draft = JSON.parse(JSON.stringify(forms.find(v => v.id === id))); go('build'); break;
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
    if (draft && e.target.dataset.k === 'type') redraw();
  });

  document.addEventListener('submit', e => {
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
})();
