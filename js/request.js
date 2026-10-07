/* "Request" page — the "Client brief" form for every registered user.
   Each user can customise their own copy of the form; the copy and the user's requests
   are stored per user in localStorage. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const TEMPLATE = 'Client brief';
  const FF = () => window.KitchensForms;
  const esc = s => FF().esc(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => window.Kitchens.render();
  const keyOf = what => 'request:' + encodeURIComponent(window.Kitchens.getUser().name) + ':' + what;

  const myForm = () => load(keyOf('form'), null) || FF().template(TEMPLATE);
  const mySubs = () => load(keyOf('subs'), []);
  const isCustom = () => !!load(keyOf('form'), null);

  let mode = 'fill'; // fill | build
  let draft = null;
  window.addEventListener('hashchange', () => { mode = 'fill'; draft = null; });

  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const fieldRow = (fl, preview) => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label) || '<i>(no label)</i>'}${fl.required ? ' <b class="req">*</b>' : ''}</span>${FF().inputFor(preview ? { ...fl, required: false } : fl)}</label>`;

  /* ---------- Views ---------- */
  function fillView() {
    const form = myForm(), subs = mySubs().sort((a, b) => b.at - a.at);
    const show = (fl, v) => fl.type === 'checkbox' ? (v ? '✔' : '—') : esc(v);
    return `
    <h1>Request</h1>
    <p class="sub">Tell us about your future kitchen. ${isCustom() ? 'This is your customised form.' : 'You can customise this form for yourself.'}</p>
    <div class="section-head"><h2>${esc(form.name)}</h2>
      <span class="actions"><button class="btn" data-rq="customize">⚙ Customize my form</button></span></div>
    <form class="card fill" id="requestForm">
      ${form.fields.map(fl => fieldRow(fl)).join('') || '<p class="sub">Your form has no fields. Use “Customize my form” to add some.</p>'}
      <div class="actions"><button class="btn primary" ${form.fields.length ? '' : 'disabled'}>Send request</button></div>
    </form>

    <div class="section-head" style="margin-top:28px"><h2>My requests <span class="count">${subs.length}</span></h2></div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Sent</th>${form.fields.map(fl => `<th>${esc(fl.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${subs.map(s => `<tr><td>${fmtDate(s.at)}</td>${form.fields.map(fl => `<td>${show(fl, s.values[fl.id])}</td>`).join('')}
        <td><button class="link danger-t" data-rq="del-sub" data-id="${s.id}">delete</button></td></tr>`).join('') ||
        `<tr><td colspan="${form.fields.length + 2}" class="sub">You haven't sent any requests yet.</td></tr>`}</tbody>
    </table></div></div>`;
  }

  function buildView() {
    const T = FF().TYPES;
    return `
    <button class="link back" data-rq="cancel">← Back to request</button>
    <h1>Customize my form</h1>
    <p class="sub">Changes apply only to your own form. Requests you already sent stay as they are.</p>
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
    if (mode === 'build' && !draft) mode = 'fill';
    return mode === 'build' ? buildView() : fillView();
  };

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-rq]');
    if (!el) return;
    const i = +el.dataset.i;
    switch (el.dataset.rq) {
      case 'customize': draft = { fields: myForm().fields }; mode = 'build'; redraw(); break;
      case 'cancel': draft = null; mode = 'fill'; redraw(); break;
      case 'add-field': draft.fields.push(FF().f('')); redraw(); break;
      case 'rm': draft.fields.splice(i, 1); redraw(); break;
      case 'up': case 'down': {
        const j = el.dataset.rq === 'up' ? i - 1 : i + 1;
        [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]]; redraw(); break;
      }
      case 'save':
        draft.fields = draft.fields.filter(x => x.label.trim());
        save(keyOf('form'), { ...FF().template(TEMPLATE), fields: draft.fields });
        draft = null; mode = 'fill'; redraw();
        break;
      case 'reset':
        if (confirm('Reset your form to the default Client brief?')) {
          try { localStorage.removeItem(keyOf('form')); } catch (err) {}
          draft = null; mode = 'fill'; redraw();
        }
        break;
      case 'del-sub':
        save(keyOf('subs'), mySubs().filter(s => s.id !== el.dataset.id)); redraw();
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
    const values = {};
    myForm().fields.forEach(fl => {
      const el = e.target.elements[fl.id];
      values[fl.id] = fl.type === 'checkbox' ? el.checked : el.value;
    });
    save(keyOf('subs'), [...mySubs(), { id: FF().uid(), at: Date.now(), values }]);
    redraw();
  });
})();
