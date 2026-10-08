/* "Warehouse" page — three sections:
   Stock       items with receive / issue / adjust movements, history, low-stock alerts, reorder list
   Locations   zones → sections → shelves (items are stored on a shelf)
   Categories  category manager (add, rename, delete with "move items to…")
   Prototype: stored in localStorage as { items[], moves[], zones[], categories[] }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || 'Guest';
  const num = v => Math.round((+v || 0) * 1000) / 1000;
  const fmtN = n => K().fmt(num(n));
  const fmtDT = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const UNITS = ['pcs', 'sheet', 'm', 'm²', 'kg', 'l', 'set'];

  /* ---------- data ---------- */
  const seed = () => ({ items: [], moves: [], zones: [], categories: [] });

  // data saved by the first Warehouse version had plain-text category / location on each item
  function migrate(d) {
    if (d.categories && d.zones) return d;
    d.categories = []; d.zones = [];
    let zone, sec;
    const cid = name => { let c = d.categories.find(x => x.name === name); if (!c) { c = { id: uid(), name }; d.categories.push(c); } return c.id; };
    const sid = loc => {
      if (!loc) return '';
      if (!zone) { zone = { id: uid(), name: 'Main', sections: [] }; d.zones.push(zone); }
      if (!sec) { sec = { id: uid(), name: 'General', shelves: [] }; zone.sections.push(sec); }
      let sh = sec.shelves.find(x => x.name === loc);
      if (!sh) { sh = { id: uid(), name: loc }; sec.shelves.push(sh); }
      return sh.id;
    };
    d.items.forEach(it => { it.categoryId = cid(it.category || 'Other'); it.shelfId = sid(it.location); delete it.category; delete it.location; });
    return d;
  }

  let db;
  const init = () => { if (!db) { db = migrate(load('warehouse', null) || seed()); save('warehouse', db); } };
  const persist = () => save('warehouse', db);

  const catName = id => (db.categories.find(c => c.id === id) || { name: '—' }).name;
  const findShelf = id => {
    for (const z of db.zones) for (const s of z.sections) for (const sh of s.shelves) if (sh.id === id) return { z, s, sh };
    return null;
  };
  const pathOf = id => { const f = findShelf(id); return f ? `${f.z.name} › ${f.s.name} › ${f.sh.name}` : ''; };
  const shelfIdsOf = { zone: z => z.sections.flatMap(s => s.shelves.map(h => h.id)), sec: s => s.shelves.map(h => h.id), shelf: h => [h.id] };
  const countOn = ids => db.items.filter(it => ids.includes(it.shelfId)).length;

  /* ---------- view state ---------- */
  let tab = 'stock';
  let query = '', catF = '', zoneF = '', lowOnly = false;
  window.addEventListener('hashchange', () => { tab = 'stock'; query = ''; catF = ''; zoneF = ''; lowOnly = false; });

  const status = it => it.qty <= 0 ? 'out' : it.qty <= it.min ? 'low' : 'ok';
  const pill = s => ({ ok: '<span class="pill ok">OK</span>', low: '<span class="pill warn">Low</span>', out: '<span class="pill bad">Out of stock</span>' }[s]);
  const reorderQty = it => Math.max(num(it.min * 2 - it.qty), num(it.min));

  /* ---------- Stock view ---------- */
  function tableHtml() {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    const zoneShelves = zoneF ? shelfIdsOf.zone(db.zones.find(z => z.id === zoneF) || { sections: [] }) : null;
    const list = db.items
      .filter(it => t.every(w => (it.sku + ' ' + it.name + ' ' + catName(it.categoryId) + ' ' + pathOf(it.shelfId)).toLowerCase().includes(w)))
      .filter(it => !catF || it.categoryId === catF)
      .filter(it => !zoneShelves || zoneShelves.includes(it.shelfId))
      .filter(it => !lowOnly || status(it) !== 'ok')
      .sort((a, b) => a.name.localeCompare(b.name));
    return `<table>
      <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Location</th><th class="num">In stock</th><th class="num">Min</th><th>Status</th><th class="num">Value, ₽</th><th></th></tr></thead>
      <tbody>${list.map(it => `<tr>
        <td><small>${esc(it.sku)}</small></td>
        <td><b>${esc(it.name)}</b></td>
        <td>${esc(catName(it.categoryId))}</td>
        <td><small>${esc(pathOf(it.shelfId)) || '—'}</small></td>
        <td class="num"><b>${fmtN(it.qty)}</b> ${esc(it.unit)}</td>
        <td class="num">${fmtN(it.min)}</td>
        <td>${pill(status(it))}</td>
        <td class="num">${fmtN(it.qty * it.cost)}</td>
        <td class="row-actions">
          <button class="btn small" data-wh="move" data-type="receive" data-id="${it.id}" title="Receive stock">＋ Receive</button>
          <button class="btn small" data-wh="move" data-type="issue" data-id="${it.id}" title="Issue stock">− Issue</button>
          <button class="btn small" data-wh="history" data-id="${it.id}">History</button>
          <button class="btn small" data-wh="edit" data-id="${it.id}">Edit</button>
          <button class="link danger-t" data-wh="del" data-id="${it.id}">delete</button>
        </td></tr>`).join('') || `<tr><td colspan="9" class="sub">${db.items.length ? 'No items match.' : 'No items yet.'}</td></tr>`}</tbody></table>`;
  }

  const TYPE = { receive: ['Receipt', 'ok'], issue: ['Issue', 'warn'], adjust: ['Adjustment', ''] };
  function moveRow(m, name) {
    const [label, cls] = TYPE[m.type];
    return `<tr><td>${fmtDT(m.at)}</td><td>${esc(name)}</td><td><span class="pill ${cls}">${label}</span></td>
      <td class="num ${m.delta < 0 ? 'down' : 'up'}">${m.delta > 0 ? '+' : ''}${fmtN(m.delta)}</td><td class="num">${fmtN(m.after)}</td><td>${esc(m.ref) || '—'}</td><td>${esc(m.user)}</td></tr>`;
  }

  function stockView() {
    const items = db.items;
    const low = items.filter(it => status(it) !== 'ok');
    const value = items.reduce((a, it) => a + it.qty * it.cost, 0);
    const recent = [...db.moves].sort((a, b) => b.at - a.at).slice(0, 12);
    const nameOf = id => (items.find(x => x.id === id) || { name: '(deleted item)' }).name;
    return `
    <div class="grid g4">
      <div class="card kpi"><div class="l">Items</div><div class="n">${items.length}</div></div>
      <div class="card kpi"><div class="l">Stock value</div><div class="n">${fmtN(value)} ₽</div></div>
      <div class="card kpi"><div class="l">Low stock</div><div class="n ${low.length ? 'down' : ''}">${low.length}</div><div class="d">${items.filter(it => status(it) === 'out').length} out of stock</div></div>
      <div class="card kpi"><div class="l">Movements (30 days)</div><div class="n">${db.moves.filter(m => m.at > Date.now() - 30 * 86400000).length}</div></div>
    </div>

    ${low.length ? `<div class="card wh-reorder"><h3>⚠ Reorder list <span class="count">${low.length} items</span></h3>
      <table><thead><tr><th>Item</th><th>Location</th><th class="num">In stock</th><th class="num">Min</th><th class="num">Suggested order</th></tr></thead><tbody>
      ${low.map(it => `<tr><td>${esc(it.name)}</td><td><small>${esc(pathOf(it.shelfId)) || '—'}</small></td><td class="num">${fmtN(it.qty)} ${esc(it.unit)}</td><td class="num">${fmtN(it.min)}</td><td class="num"><b>${fmtN(reorderQty(it))} ${esc(it.unit)}</b></td></tr>`).join('')}
      </tbody></table></div>` : ''}

    <div class="kb-bar">
      <input type="search" id="whSearch" placeholder="Search by name, SKU, category or location…" value="${esc(query)}" autocomplete="off">
      <select id="whCat" aria-label="Category"><option value="">All categories</option>${db.categories.map(c => `<option value="${c.id}" ${c.id === catF ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="whZone" aria-label="Zone"><option value="">All zones</option>${db.zones.map(z => `<option value="${z.id}" ${z.id === zoneF ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select>
      <label class="inline-sel"><input type="checkbox" id="whLow" ${lowOnly ? 'checked' : ''}> Low stock only</label>
      <button class="btn primary" data-wh="add">+ Add item</button>
    </div>
    <div class="card"><div class="matrix-wrap" id="whTable">${tableHtml()}</div></div>

    <div class="section-head" style="margin-top:28px"><h2>Recent movements</h2></div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Reference</th><th>By</th></tr></thead>
      <tbody>${recent.map(m => moveRow(m, nameOf(m.itemId))).join('') || '<tr><td colspan="7" class="sub">No movements yet.</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- Locations view ---------- */
  const addForm = (kind, parent, placeholder, label) => `<form class="inline-add" data-wh-add="${kind}" data-parent="${parent}">
    <input name="name" placeholder="${placeholder}" required maxlength="60"><button class="btn small">${label}</button></form>`;

  function locationsView() {
    const nShelves = db.zones.reduce((a, z) => a + shelfIdsOf.zone(z).length, 0);
    return `
    <p class="sub">Describe where things are stored: a <b>zone</b> contains <b>sections</b> (racks, cabinets), and a section contains <b>shelves</b>. Items are placed on a shelf when you add or edit them.</p>
    <div class="section-head"><h2>Zones <span class="count">${db.zones.length} zones · ${nShelves} shelves</span></h2></div>
    <form class="stage-add" data-wh-add="zone" data-parent="" style="margin-bottom:16px">
      <input name="name" placeholder="New zone name, e.g. Zone D — Finished goods" required maxlength="60"><button class="btn primary">+ Add zone</button></form>
    ${db.zones.map(z => `
    <div class="card zone">
      <div class="zone-h">
        <input class="zone-name" data-ren="zone" data-id="${z.id}" value="${esc(z.name)}" aria-label="Zone name">
        <span class="pill">${countOn(shelfIdsOf.zone(z))} items</span>
        <button class="link danger-t" data-wh="del-zone" data-id="${z.id}">delete zone</button>
      </div>
      ${z.sections.map(s => `
      <div class="section-box">
        <div class="sec-h"><input data-ren="sec" data-id="${s.id}" value="${esc(s.name)}" aria-label="Section name">
          <span class="sub">${countOn(shelfIdsOf.sec(s))} items</span>
          <button class="link danger-t" data-wh="del-sec" data-id="${s.id}">delete section</button></div>
        <div class="shelves">
          ${s.shelves.map(h => `<span class="shelf" title="${countOn([h.id])} items"><input data-ren="shelf" data-id="${h.id}" value="${esc(h.name)}" aria-label="Shelf name" size="${Math.max(6, h.name.length)}"><small>${countOn([h.id])}</small><button class="x" data-wh="del-shelf" data-id="${h.id}" title="Delete shelf">×</button></span>`).join('') || '<span class="sub">No shelves yet.</span>'}
        </div>
        ${addForm('shelf', s.id, 'New shelf', '+ Shelf')}
      </div>`).join('') || '<p class="sub">No sections yet.</p>'}
      ${addForm('sec', z.id, 'New section (rack, cabinet…)', '+ Section')}
    </div>`).join('') || '<div class="placeholder">No zones yet. Add the first zone above.</div>'}`;
  }

  /* ---------- Categories view ---------- */
  function categoriesView() {
    return `
    <p class="sub">Categories group your stock items. Renaming a category updates all its items at once.</p>
    <div class="section-head"><h2>Categories <span class="count">${db.categories.length}</span></h2></div>
    <div class="card">
      <ol class="stage-list">
        ${db.categories.map(c => `<li>
          <input data-ren="cat" data-id="${c.id}" value="${esc(c.name)}" aria-label="Category name">
          <span class="pill">${db.items.filter(it => it.categoryId === c.id).length} items</span>
          <button class="btn small danger" data-wh="del-cat" data-id="${c.id}">Delete</button></li>`).join('') || '<li class="sub">No categories yet.</li>'}
      </ol>
      <form class="stage-add" data-wh-add="cat" data-parent=""><input name="name" placeholder="New category name" required maxlength="60"><button class="btn primary">+ Add category</button></form>
    </div>`;
  }

  window.KitchensPages.Warehouse = () => {
    init();
    return `
    <h1>Warehouse</h1>
    <p class="sub">Stock levels, receipts and issues, where everything is stored, and what needs to be ordered.</p>
    <div class="wh-tabs">
      ${[['stock', 'Stock'], ['locations', 'Locations'], ['categories', 'Categories']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-wh="tab" data-v="${k}">${l}</button>`).join('')}
    </div>
    ${tab === 'locations' ? locationsView() : tab === 'categories' ? categoriesView() : stockView()}`;
  };

  /* ---------- dialogs ---------- */
  function modal() {
    let m = document.getElementById('whModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'whModal'; document.body.appendChild(m); }
    return m;
  }

  const opts = (list, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') + list.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  function itemDialog(it) {
    const f = it && findShelf(it.shelfId);
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="whItemForm" data-id="${it ? it.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${it ? 'Edit item' : 'Add item'}</h3>
      <div class="two"><label>SKU<input name="sku" required value="${it ? esc(it.sku) : ''}" placeholder="MDF-18-W"></label>
        <label>Name<input name="name" required value="${it ? esc(it.name) : ''}"></label></div>
      <div class="two"><label>Category<select name="categoryId" required>${opts(db.categories, it ? it.categoryId : '', db.categories.length ? 'Select category…' : 'No categories — add one first')}</select></label>
        <label>Unit<select name="unit">${UNITS.map(u => `<option ${it && it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
      <fieldset class="loc-pick"><legend>Location</legend>
        <select data-loc="zone" aria-label="Zone">${opts(db.zones, f ? f.z.id : '', 'Zone…')}</select>
        <select data-loc="sec" aria-label="Section">${opts(f ? f.z.sections : [], f ? f.s.id : '', 'Section…')}</select>
        <select name="shelfId" data-loc="shelf" aria-label="Shelf">${opts(f ? f.s.shelves : [], f ? f.sh.id : '', 'Shelf…')}</select>
      </fieldset>
      <div class="two"><label>Min level (alert at or below)<input name="min" type="number" min="0" step="any" required value="${it ? it.min : 0}"></label>
        <label>Cost per unit, ₽<input name="cost" type="number" min="0" step="any" required value="${it ? it.cost : 0}"></label></div>
      ${it ? `<label>In stock<input value="${fmtN(it.qty)} ${esc(it.unit)}" disabled></label><p class="hint">Quantity changes only through Receive, Issue or Adjust, so the history stays correct.</p>`
           : '<label>Initial quantity<input name="qty" type="number" min="0" step="any" value="0"></label>'}
      <button class="btn primary wide">${it ? 'Save' : 'Add item'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  function moveDialog(it, type) {
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="whMoveForm" data-id="${it.id}">
      <button type="button" class="close" data-close>×</button>
      <h3>${esc(it.name)}</h3>
      <p class="sub">In stock now: <b>${fmtN(it.qty)} ${esc(it.unit)}</b>${pathOf(it.shelfId) ? ' · ' + esc(pathOf(it.shelfId)) : ''}</p>
      <label>Operation<select name="type" id="whType">
        <option value="receive" ${type === 'receive' ? 'selected' : ''}>Receive (add stock)</option>
        <option value="issue" ${type === 'issue' ? 'selected' : ''}>Issue (take from stock)</option>
        <option value="adjust" ${type === 'adjust' ? 'selected' : ''}>Adjust to counted quantity</option></select></label>
      <label><span id="whQtyLabel"></span><input name="qty" type="number" min="0" step="any" required></label>
      <label>Reference<input name="ref" placeholder="Order #, supplier, reason…"></label>
      <p class="hint" id="whMoveErr" style="color:var(--bad)"></p>
      <button class="btn primary wide">Save movement</button>
    </form>`;
    m.hidden = false;
    setQtyLabel(it.unit);
    m.querySelector('[name=qty]').focus();
  }
  const setQtyLabel = unit => {
    const t = document.getElementById('whType').value;
    document.getElementById('whQtyLabel').textContent = (t === 'adjust' ? 'Counted quantity' : 'Quantity') + ' (' + unit + ')';
  };

  function historyDialog(it) {
    const rows = db.moves.filter(m => m.itemId === it.id).sort((a, b) => b.at - a.at);
    const m = modal();
    m.innerHTML = `<div class="modal-card wide hist" role="dialog" aria-modal="true" aria-label="History">
      <button type="button" class="close" data-close>×</button>
      <h3>${esc(it.name)} — history</h3>
      <p class="sub">In stock: <b>${fmtN(it.qty)} ${esc(it.unit)}</b> · min ${fmtN(it.min)} · ${pill(status(it))}</p>
      <div class="matrix-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Reference</th><th>By</th></tr></thead>
      <tbody>${rows.map(r => moveRow(r, it.name)).join('') || '<tr><td colspan="7" class="sub">No movements.</td></tr>'}</tbody></table></div>
      <button type="button" class="btn wide" data-close>Close</button>
    </div>`;
    m.hidden = false;
  }

  function deleteCategoryDialog(c) {
    const others = db.categories.filter(x => x.id !== c.id), n = db.items.filter(it => it.categoryId === c.id).length;
    if (!n) { if (confirm(`Delete category "${c.name}"?`)) { db.categories = others; persist(); redraw(); } return; }
    if (!others.length) { alert(`"${c.name}" has ${n} items. Add another category first, so the items have somewhere to go.`); return; }
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="whCatDel" data-id="${c.id}">
      <button type="button" class="close" data-close>×</button>
      <h3>Delete category “${esc(c.name)}”</h3>
      <p class="sub">${n} ${n === 1 ? 'item uses' : 'items use'} this category. Choose where to move them.</p>
      <label>Move items to<select name="to" required>${opts(others, '', 'Select category…')}</select></label>
      <button class="btn danger wide">Move items and delete category</button>
    </form>`;
    m.hidden = false;
  }

  /* ---------- events ---------- */
  const guardDelete = (label, ids, then) => {
    const n = countOn(ids);
    if (n) { alert(`${label} still has ${n} ${n === 1 ? 'item' : 'items'}. Move them to another shelf first (Stock → Edit).`); return; }
    if (confirm(`Delete ${label}?`)) { then(); persist(); redraw(); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-wh]');
    if (!el || !db) return;
    const d = el.dataset, it = db.items.find(x => x.id === d.id);
    switch (d.wh) {
      case 'tab': tab = d.v; redraw(); break;
      case 'add': itemDialog(null); break;
      case 'edit': itemDialog(it); break;
      case 'move': moveDialog(it, d.type); break;
      case 'history': historyDialog(it); break;
      case 'del':
        if (confirm(`Delete "${it.name}" and its movement history?`)) {
          db.items = db.items.filter(x => x.id !== d.id); db.moves = db.moves.filter(m => m.itemId !== d.id); persist(); redraw();
        }
        break;
      case 'del-zone': { const z = db.zones.find(x => x.id === d.id); guardDelete(`zone "${z.name}"`, shelfIdsOf.zone(z), () => { db.zones = db.zones.filter(x => x !== z); }); break; }
      case 'del-sec': {
        const z = db.zones.find(x => x.sections.some(s => s.id === d.id)), s = z.sections.find(x => x.id === d.id);
        guardDelete(`section "${s.name}"`, shelfIdsOf.sec(s), () => { z.sections = z.sections.filter(x => x !== s); });
        break;
      }
      case 'del-shelf': {
        const f = findShelf(d.id);
        guardDelete(`shelf "${f.sh.name}"`, [f.sh.id], () => { f.s.shelves = f.s.shelves.filter(x => x !== f.sh); });
        break;
      }
      case 'del-cat': deleteCategoryDialog(db.categories.find(c => c.id === d.id)); break;
    }
  });

  // live search / filters: only the table is redrawn so the search box keeps focus
  const refreshTable = () => { document.getElementById('whTable').innerHTML = tableHtml(); };
  document.addEventListener('input', e => { if (e.target.id === 'whSearch') { query = e.target.value; refreshTable(); } });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'whCat') { catF = t.value; refreshTable(); }
    if (t.id === 'whZone') { zoneF = t.value; refreshTable(); }
    if (t.id === 'whLow') { lowOnly = t.checked; refreshTable(); }
    if (t.id === 'whType') setQtyLabel(db.items.find(x => x.id === t.form.dataset.id).unit);

    // cascading zone → section → shelf selects in the item dialog
    if (t.dataset && t.dataset.loc) {
      const form = t.form, zone = form.querySelector('[data-loc=zone]'), sec = form.querySelector('[data-loc=sec]'), shelf = form.querySelector('[data-loc=shelf]');
      if (t.dataset.loc === 'zone') {
        const z = db.zones.find(x => x.id === zone.value);
        sec.innerHTML = opts(z ? z.sections : [], '', 'Section…');
        shelf.innerHTML = opts([], '', 'Shelf…');
      }
      if (t.dataset.loc === 'sec') {
        const z = db.zones.find(x => x.id === zone.value), s = z && z.sections.find(x => x.id === sec.value);
        shelf.innerHTML = opts(s ? s.shelves : [], '', 'Shelf…');
      }
    }

    // inline rename in Locations / Categories (saved at once; a blank name restores the old one)
    if (t.dataset && t.dataset.ren) {
      const kind = t.dataset.ren, id = t.dataset.id, name = t.value.trim();
      let target;
      if (kind === 'zone') target = db.zones.find(x => x.id === id);
      if (kind === 'sec') target = db.zones.flatMap(z => z.sections).find(x => x.id === id);
      if (kind === 'shelf') target = (findShelf(id) || {}).sh;
      if (kind === 'cat') target = db.categories.find(x => x.id === id);
      if (!target) return;
      if (name) { target.name = name; persist(); } else redraw();
      if (kind === 'cat' || kind === 'shelf') redraw();
    }
  });

  document.addEventListener('submit', e => {
    const f = e.target;

    // add zone / section / shelf / category
    if (f.dataset && f.dataset.whAdd) {
      e.preventDefault();
      const name = f.elements.name.value.trim(), kind = f.dataset.whAdd, parent = f.dataset.parent;
      if (!name) return;
      const dup = list => list.some(x => x.name.toLowerCase() === name.toLowerCase());
      if (kind === 'zone') { if (dup(db.zones)) return alert('A zone with this name already exists.'); db.zones.push({ id: uid(), name, sections: [] }); }
      if (kind === 'sec') { const z = db.zones.find(x => x.id === parent); if (dup(z.sections)) return alert('This zone already has a section with that name.'); z.sections.push({ id: uid(), name, shelves: [] }); }
      if (kind === 'shelf') { const s = db.zones.flatMap(z => z.sections).find(x => x.id === parent); if (dup(s.shelves)) return alert('This section already has a shelf with that name.'); s.shelves.push({ id: uid(), name }); }
      if (kind === 'cat') { if (dup(db.categories)) return alert('A category with this name already exists.'); db.categories.push({ id: uid(), name }); }
      persist(); redraw();
      return;
    }

    if (f.id === 'whCatDel') {
      e.preventDefault();
      const id = f.dataset.id, to = f.elements.to.value;
      db.items.forEach(it => { if (it.categoryId === id) it.categoryId = to; });
      db.categories = db.categories.filter(c => c.id !== id);
      persist(); document.getElementById('whModal').hidden = true; redraw();
    }

    if (f.id === 'whItemForm') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const id = f.dataset.id;
      const rec = { sku: d.sku.trim(), name: d.name.trim(), categoryId: d.categoryId, shelfId: d.shelfId || '', unit: d.unit, min: num(d.min), cost: num(d.cost) };
      if (db.items.some(x => x.id !== id && x.sku.toLowerCase() === rec.sku.toLowerCase())) { alert('An item with this SKU already exists.'); return; }
      if (id) Object.assign(db.items.find(x => x.id === id), rec);
      else {
        const it = { id: uid(), qty: num(d.qty), ...rec };
        db.items.push(it);
        if (it.qty > 0) db.moves.push({ id: uid(), itemId: it.id, type: 'receive', qty: it.qty, delta: it.qty, after: it.qty, ref: 'Initial stock', user: me(), at: Date.now() });
      }
      persist(); document.getElementById('whModal').hidden = true; redraw();
    }

    if (f.id === 'whMoveForm') {
      e.preventDefault();
      const it = db.items.find(x => x.id === f.dataset.id);
      const type = f.elements.type.value, qty = num(f.elements.qty.value), err = document.getElementById('whMoveErr');
      if (type !== 'adjust' && qty <= 0) { err.textContent = 'Quantity must be greater than zero.'; return; }
      if (type === 'issue' && qty > it.qty) { err.textContent = `Not enough stock: only ${fmtN(it.qty)} ${it.unit} available.`; return; }
      const after = type === 'receive' ? num(it.qty + qty) : type === 'issue' ? num(it.qty - qty) : qty;
      const delta = num(after - it.qty);
      if (type === 'adjust' && !delta) { err.textContent = 'The counted quantity equals the current stock.'; return; }
      db.moves.push({ id: uid(), itemId: it.id, type, qty, delta, after, ref: f.elements.ref.value.trim(), user: me(), at: Date.now() });
      const wasStatus = status(it);
      it.qty = after;
      if (status(it) !== 'ok' && status(it) !== wasStatus) // stock just dropped to low / out: tell everyone who can see the warehouse
        window.KitchensNotify.pushAccess('Warehouse', 1, { type: 'stock', title: status(it) === 'out' ? 'Out of stock' : 'Low stock', text: `${it.name}: ${fmtN(it.qty)} ${it.unit} left (minimum ${fmtN(it.min)})`, link: '#tab/warehouse' });
      persist(); document.getElementById('whModal').hidden = true; redraw();
    }
  });
})();
