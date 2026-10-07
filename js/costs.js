/* "Costs" — two kinds of costs:
   Constant   recurring costs (rent, salaries, software…) with a period; shown as a monthly equivalent
   Situation  one-off costs (materials bought, fuel, repairs…) with a date, optionally tied to a request and a branch
   Permissions come from the roles table (Branches and Roles):
     "Costs"                    View = sees everything · Edit = also manages constant costs and any situation cost
     "Costs: add situational"   Edit = may add situation costs; without access to "Costs" they see only their own entries
   Prototype: stored in localStorage as { constants[], situational[] }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => K().render();
  const me = () => K().getUser();
  const num = v => Math.round((+v || 0) * 100) / 100;
  const money = n => K().fmt(num(n)) + ' ₽';
  const fmtD = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthOf = iso => String(iso).slice(0, 7);
  const PERIODS = { month: ['Monthly', 1], quarter: ['Quarterly', 1 / 3], year: ['Yearly', 1 / 12] };
  const CONST_CATS = ['Rent', 'Utilities', 'Salaries', 'Software', 'Insurance', 'Taxes', 'Other'];
  const SIT_CATS = ['Materials', 'Transport', 'Tools', 'Repairs', 'Subcontractor', 'Marketing', 'Other'];

  /* ---------- data ---------- */
  let db;
  const persist = () => save('costs', db);
  const monthAgo = n => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - n); return d; };
  const dayInMonth = (n, day) => { // demo dates: never in the future for the current month
    const d = monthAgo(n), dd = n === 0 ? Math.min(day, new Date().getDate()) : day;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  };
  const init = () => {
    if (db) return;
    db = load('costs', null);
    if (db) return;
    const c = (name, category, amount, period) => ({ id: uid(), name, category, amount, period, active: true, note: '' });
    const s = (date, amount, category, description, by) => ({ id: uid(), date, amount, category, description, requestId: '', branchId: '', by, at: Date.now() });
    db = {
      constants: [c('Workshop rent', 'Rent', 120000, 'month'), c('Electricity and heating', 'Utilities', 28000, 'month'), c('Salaries', 'Salaries', 310000, 'month'),
        c('Design software licences', 'Software', 36000, 'year'), c('Equipment insurance', 'Insurance', 24000, 'quarter')],
      situational: [s(dayInMonth(0, 3), 14500, 'Materials', 'Edge tape and glue, emergency purchase', 'C. Brown'), s(dayInMonth(0, 8), 3200, 'Transport', 'Fuel for client delivery', 'D. Davis'),
        s(dayInMonth(1, 19), 9800, 'Repairs', 'Panel saw blade replacement', 'C. Brown'), s(dayInMonth(1, 4), 22000, 'Subcontractor', 'Stone countertop cutting', 'A. Smith')]
    };
    persist();
  };

  const monthly = c => c.amount * PERIODS[c.period][1];

  /* ---------- permissions ---------- */
  const lvl = key => window.KitchensRoles.level(me(), key);
  const perms = () => {
    const all = lvl('Costs'), sit = lvl(window.KitchensRoles.sitKey);
    return { seeAll: all >= 1, manage: all >= 2, add: all >= 2 || sit >= 2, ownOnly: all < 1 && sit >= 2 };
  };
  const canEditSit = (p, e) => p.manage || (p.add && e.by === (me() || {}).name);

  /* ---------- state ---------- */
  let tab = 'situational';
  let month = 'all', catF = '', query = '';
  window.addEventListener('hashchange', () => { tab = 'situational'; month = 'all'; catF = ''; query = ''; });

  const reqLabel = id => { const r = window.KitchensRequest.all().find(x => x.sub.id === id); return r ? `${r.sub.from.name} (to ${r.to})` : ''; };
  const branchName = id => (window.KitchensBranches.list().find(b => b.id === id) || {}).name || '';

  /* ---------- views ---------- */
  function sitRows(p) {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean), mine = (me() || {}).name;
    return db.situational
      .filter(e => !p.ownOnly || e.by === mine)
      .filter(e => month === 'all' || monthOf(e.date) === month)
      .filter(e => !catF || e.category === catF)
      .filter(e => t.every(w => (e.description + ' ' + e.category + ' ' + e.by + ' ' + reqLabel(e.requestId)).toLowerCase().includes(w)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  }

  function sitTable(p) {
    const list = sitRows(p), total = list.reduce((a, e) => a + e.amount, 0);
    const byCat = {}; list.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    return `
    ${Object.keys(byCat).length ? `<div class="chips cost-cats">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(k)}: <b>${money(v)}</b></span>`).join('')}</div>` : ''}
    <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Related</th><th>Added by</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr>
        <td>${fmtD(e.date)}</td>
        <td>${esc(e.description) || '—'}</td>
        <td><span class="pill">${esc(e.category)}</span></td>
        <td><small>${e.requestId && reqLabel(e.requestId) ? `<a class="link" href="#case/${esc(e.requestId)}">${esc(reqLabel(e.requestId))}</a>` : ''}${e.branchId && branchName(e.branchId) ? (e.requestId ? '<br>' : '') + esc(branchName(e.branchId)) : ''}${!e.requestId && !e.branchId ? '—' : ''}</small></td>
        <td>${esc(e.by)}</td>
        <td class="num"><b>${money(e.amount)}</b></td>
        <td class="row-actions">${canEditSit(p, e) ? `<button class="btn small" data-co="edit-sit" data-id="${e.id}">Edit</button><button class="link danger-t" data-co="del-sit" data-id="${e.id}">delete</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="7" class="sub">No situation costs for this selection.</td></tr>`}
    </tbody>${list.length ? `<tfoot><tr><th colspan="5">Total (${list.length})</th><th class="num">${money(total)}</th><th></th></tr></tfoot>` : ''}</table>`;
  }

  function situationalView(p) {
    const months = [...new Set(db.situational.map(e => monthOf(e.date)))].sort().reverse();
    const cats = [...new Set([...SIT_CATS, ...db.situational.map(e => e.category)])];
    return `
    ${p.ownOnly ? '<div class="notice">You can add situation costs. You see only the entries you added.</div>' : ''}
    <div class="kb-bar">
      <input type="search" id="coSearch" placeholder="Search description, category, person…" value="${esc(query)}" autocomplete="off">
      <select id="coMonth" aria-label="Month"><option value="all">All time</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${new Date(m + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
      <select id="coCat" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${c === catF ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${p.add ? '<button class="btn primary" data-co="add-sit">+ Add situation cost</button>' : ''}
    </div>
    <div class="card"><div class="matrix-wrap" id="coSit">${sitTable(p)}</div></div>`;
  }

  function constantView(p) {
    const active = db.constants.filter(c => c.active), perMonth = active.reduce((a, c) => a + monthly(c), 0);
    return `
    <p class="sub">Costs that repeat every period. Everything is also shown as a monthly equivalent, so you can see what the business costs to run.</p>
    ${p.manage ? '<div class="section-head"><span></span><button class="btn primary" data-co="add-const">+ Add constant cost</button></div>' : ''}
    <div class="card"><div class="matrix-wrap"><table><thead><tr><th>Cost</th><th>Category</th><th class="num">Amount</th><th>Period</th><th class="num">Per month</th><th>Status</th><th></th></tr></thead><tbody>
      ${db.constants.map(c => `<tr class="${c.active ? '' : 'off'}">
        <td><b>${esc(c.name)}</b>${c.note ? `<br><small class="sub">${esc(c.note)}</small>` : ''}</td>
        <td><span class="pill">${esc(c.category)}</span></td>
        <td class="num">${money(c.amount)}</td>
        <td>${PERIODS[c.period][0]}</td>
        <td class="num"><b>${money(monthly(c))}</b></td>
        <td>${p.manage ? `<button class="pill ${c.active ? 'ok' : ''} pill-btn" data-co="toggle" data-id="${c.id}" title="Click to switch">${c.active ? 'Active' : 'Paused'}</button>` : `<span class="pill ${c.active ? 'ok' : ''}">${c.active ? 'Active' : 'Paused'}</span>`}</td>
        <td class="row-actions">${p.manage ? `<button class="btn small" data-co="edit-const" data-id="${c.id}">Edit</button><button class="link danger-t" data-co="del-const" data-id="${c.id}">delete</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">No constant costs yet.</td></tr>'}
    </tbody><tfoot><tr><th colspan="4">Total per month (active)</th><th class="num">${money(perMonth)}</th><th colspan="2">${money(perMonth * 12)} / year</th></tr></tfoot></table></div></div>`;
  }

  window.KitchensPages.Costs = () => {
    init();
    const p = perms();
    if (!p.seeAll && !p.add) return `<h1>Costs</h1><div class="placeholder">Your role has no access to costs. Ask the owner to change it in Branches and Roles.</div>`;
    if (p.ownOnly) tab = 'situational';

    const thisM = todayISO().slice(0, 7);
    const constM = db.constants.filter(c => c.active).reduce((a, c) => a + monthly(c), 0);
    const sitM = db.situational.filter(e => monthOf(e.date) === thisM).reduce((a, e) => a + e.amount, 0);
    const sitY = db.situational.filter(e => e.date.slice(0, 4) === thisM.slice(0, 4)).reduce((a, e) => a + e.amount, 0);
    return `
    <h1>Costs</h1>
    <p class="sub">${p.ownOnly ? 'Add the costs you incur on the job: materials, fuel, small repairs.' : 'What the business spends: recurring costs and one-off situation costs.'}</p>
    ${p.seeAll ? `<div class="grid g4">
      <div class="card kpi"><div class="l">Constant / month</div><div class="n">${money(constM)}</div></div>
      <div class="card kpi"><div class="l">Situation this month</div><div class="n">${money(sitM)}</div></div>
      <div class="card kpi"><div class="l">Total this month</div><div class="n">${money(constM + sitM)}</div></div>
      <div class="card kpi"><div class="l">Situation this year</div><div class="n">${money(sitY)}</div></div>
    </div>` : ''}
    ${p.ownOnly ? '' : `<div class="wh-tabs">${[['situational', `Situation costs (${db.situational.length})`], ['constant', `Constant costs (${db.constants.length})`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-co="tab" data-v="${k}">${l}</button>`).join('')}</div>`}
    ${tab === 'constant' && !p.ownOnly ? constantView(p) : situationalView(p)}`;
  };

  /* ---------- dialogs ---------- */
  function modal() {
    let m = document.getElementById('coModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'coModal'; document.body.appendChild(m); }
    return m;
  }
  const dl = (id, list) => `<datalist id="${id}">${list.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;

  function constDialog(c) {
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="coConstForm" data-id="${c ? c.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${c ? 'Edit constant cost' : 'Add constant cost'}</h3>
      <label>Name<input name="name" required maxlength="80" value="${c ? esc(c.name) : ''}" placeholder="e.g. Workshop rent"></label>
      <div class="two"><label>Category<input name="category" list="coCCats" required value="${c ? esc(c.category) : ''}">${dl('coCCats', CONST_CATS)}</label>
        <label>Period<select name="period">${Object.entries(PERIODS).map(([k, [l]]) => `<option value="${k}" ${c && c.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label>Amount per period, ₽<input name="amount" type="number" min="0.01" step="any" required value="${c ? c.amount : ''}"></label>
      <label>Note<input name="note" value="${c ? esc(c.note) : ''}"></label>
      <label class="inline"><input type="checkbox" name="active" ${!c || c.active ? 'checked' : ''}> Active</label>
      <button class="btn primary wide">${c ? 'Save' : 'Add cost'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  function sitDialog(e) {
    const reqs = window.KitchensRequest.all(), branches = window.KitchensBranches.list();
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="coSitForm" data-id="${e ? e.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${e ? 'Edit situation cost' : 'Add situation cost'}</h3>
      <div class="two"><label>Date<input name="date" type="date" required value="${e ? e.date : todayISO()}"></label>
        <label>Amount, ₽<input name="amount" type="number" min="0.01" step="any" required value="${e ? e.amount : ''}"></label></div>
      <label>Category<input name="category" list="coSCats" required value="${e ? esc(e.category) : ''}" placeholder="Materials, Transport…">${dl('coSCats', SIT_CATS)}</label>
      <label>Description<input name="description" required maxlength="200" value="${e ? esc(e.description) : ''}" placeholder="What was it for?"></label>
      <div class="two"><label>Related request <small class="sub">(optional)</small><select name="requestId"><option value="">— none —</option>${reqs.map(r => `<option value="${r.sub.id}" ${e && e.requestId === r.sub.id ? 'selected' : ''}>${esc(r.sub.from.name)} (to ${esc(r.to)})</option>`).join('')}</select></label>
        <label>Branch <small class="sub">(optional)</small><select name="branchId"><option value="">— none —</option>${branches.map(b => `<option value="${b.id}" ${e && e.branchId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label></div>
      <button class="btn primary wide">${e ? 'Save' : 'Add cost'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-co]');
    if (!el || !db) return;
    const d = el.dataset, p = perms();
    const c = db.constants.find(x => x.id === d.id), s = db.situational.find(x => x.id === d.id);
    switch (d.co) {
      case 'tab': tab = d.v; redraw(); break;
      case 'add-const': if (p.manage) constDialog(null); break;
      case 'edit-const': if (p.manage) constDialog(c); break;
      case 'toggle': if (p.manage) { c.active = !c.active; persist(); redraw(); } break;
      case 'del-const': if (p.manage && confirm(`Delete constant cost "${c.name}"?`)) { db.constants = db.constants.filter(x => x !== c); persist(); redraw(); } break;
      case 'add-sit': if (p.add) sitDialog(null); break;
      case 'edit-sit': if (canEditSit(p, s)) sitDialog(s); break;
      case 'del-sit': if (canEditSit(p, s) && confirm('Delete this situation cost?')) { db.situational = db.situational.filter(x => x !== s); persist(); redraw(); } break;
    }
  });

  // live search / filters: only the table is redrawn so the search box keeps focus
  const refresh = () => { document.getElementById('coSit').innerHTML = sitTable(perms()); };
  document.addEventListener('input', ev => { if (ev.target.id === 'coSearch') { query = ev.target.value; refresh(); } });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'coMonth') { month = ev.target.value; refresh(); }
    if (ev.target.id === 'coCat') { catF = ev.target.value; refresh(); }
  });

  document.addEventListener('submit', ev => {
    const f = ev.target, p = perms();
    if (f.id === 'coConstForm' && p.manage) {
      ev.preventDefault();
      const id = f.dataset.id, rec = { name: f.elements.name.value.trim(), category: f.elements.category.value.trim(), amount: num(f.elements.amount.value), period: f.elements.period.value, note: f.elements.note.value.trim(), active: f.elements.active.checked };
      if (id) Object.assign(db.constants.find(x => x.id === id), rec); else db.constants.push({ id: uid(), ...rec });
      persist(); document.getElementById('coModal').hidden = true; redraw();
    }
    if (f.id === 'coSitForm' && p.add) {
      ev.preventDefault();
      const id = f.dataset.id, rec = { date: f.elements.date.value, amount: num(f.elements.amount.value), category: f.elements.category.value.trim(), description: f.elements.description.value.trim(), requestId: f.elements.requestId.value, branchId: f.elements.branchId.value };
      if (id) { const e = db.situational.find(x => x.id === id); if (!canEditSit(p, e)) return; Object.assign(e, rec); }
      else db.situational.push({ id: uid(), by: (me() || {}).name || 'Guest', at: Date.now(), ...rec });
      persist(); document.getElementById('coModal').hidden = true; redraw();
    }
  });
})();
