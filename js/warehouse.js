/* "Warehouse" page — stock items, receive / issue / adjust movements with history, low-stock alerts and a reorder list.
   Prototype: stored in localStorage as { items[], moves[] }. */
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

  const seed = () => {
    const now = Date.now(), item = (sku, name, category, unit, qty, min, cost, location) => ({ id: uid(), sku, name, category, unit, qty, min, cost, location });
    const items = [
      item('MDF-18-W', 'MDF 18 mm, white', 'Boards', 'sheet', 12, 20, 2400, 'A1'),
      item('MDF-18-O', 'MDF 18 mm, oak veneer', 'Boards', 'sheet', 34, 15, 3100, 'A2'),
      item('TOP-38', 'Countertop 38 mm, 3 m', 'Boards', 'pcs', 9, 4, 8900, 'A3'),
      item('HNG-BLUM', 'Hinge Blum 110°, soft-close', 'Hardware', 'pcs', 340, 100, 190, 'B1'),
      item('SLD-45', 'Drawer slides 450 mm', 'Hardware', 'set', 62, 40, 540, 'B2'),
      item('HDL-M2', 'Handle M2, steel', 'Hardware', 'pcs', 120, 50, 120, 'B3'),
      item('EDG-W', 'Edge tape white 22 mm', 'Consumables', 'm', 45, 40, 14, 'C1'),
      item('GLU-PUR', 'PUR hot-melt glue', 'Consumables', 'kg', 0, 5, 780, 'C2')
    ];
    const moves = items.map((it, i) => ({ id: uid(), itemId: it.id, type: 'receive', qty: it.qty, delta: it.qty, after: it.qty, ref: 'Initial stock', user: 'System', at: now - (20 - i) * 86400000 })).filter(m => m.qty > 0);
    return { items, moves };
  };

  let db;
  const init = () => { if (!db) db = load('warehouse', null) || seed(); };
  const persist = () => save('warehouse', db);

  let query = '', cat = '', lowOnly = false;
  window.addEventListener('hashchange', () => { query = ''; cat = ''; lowOnly = false; });

  const status = it => it.qty <= 0 ? 'out' : it.qty <= it.min ? 'low' : 'ok';
  const pill = s => ({ ok: '<span class="pill ok">OK</span>', low: '<span class="pill warn">Low</span>', out: '<span class="pill bad">Out of stock</span>' }[s]);
  const reorderQty = it => Math.max(num(it.min * 2 - it.qty), num(it.min));

  /* ---------- views ---------- */
  function tableHtml() {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = db.items
      .filter(it => t.every(w => (it.sku + ' ' + it.name + ' ' + it.category + ' ' + it.location).toLowerCase().includes(w)))
      .filter(it => !cat || it.category === cat)
      .filter(it => !lowOnly || status(it) !== 'ok')
      .sort((a, b) => a.name.localeCompare(b.name));
    return `<table>
      <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Location</th><th class="num">In stock</th><th class="num">Min</th><th>Status</th><th class="num">Value, ₽</th><th></th></tr></thead>
      <tbody>${list.map(it => `<tr>
        <td><small>${esc(it.sku)}</small></td>
        <td><b>${esc(it.name)}</b></td>
        <td>${esc(it.category)}</td>
        <td>${esc(it.location) || '—'}</td>
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

  window.KitchensPages.Warehouse = () => {
    init();
    const items = db.items;
    const low = items.filter(it => status(it) !== 'ok');
    const value = items.reduce((a, it) => a + it.qty * it.cost, 0);
    const cats = [...new Set(items.map(it => it.category))].sort();
    const recent = [...db.moves].sort((a, b) => b.at - a.at).slice(0, 12);
    const nameOf = id => (items.find(x => x.id === id) || { name: '(deleted item)' }).name;
    return `
    <h1>Warehouse</h1>
    <p class="sub">Stock levels, receipts and issues, and what needs to be ordered.</p>
    <div class="grid g4">
      <div class="card kpi"><div class="l">Items</div><div class="n">${items.length}</div></div>
      <div class="card kpi"><div class="l">Stock value</div><div class="n">${fmtN(value)} ₽</div></div>
      <div class="card kpi"><div class="l">Low stock</div><div class="n ${low.length ? 'down' : ''}">${low.length}</div><div class="d">${items.filter(it => status(it) === 'out').length} out of stock</div></div>
      <div class="card kpi"><div class="l">Movements (30 days)</div><div class="n">${db.moves.filter(m => m.at > Date.now() - 30 * 86400000).length}</div></div>
    </div>

    ${low.length ? `<div class="card wh-reorder"><h3>⚠ Reorder list <span class="count">${low.length} items</span></h3>
      <table><thead><tr><th>Item</th><th class="num">In stock</th><th class="num">Min</th><th class="num">Suggested order</th></tr></thead><tbody>
      ${low.map(it => `<tr><td>${esc(it.name)}</td><td class="num">${fmtN(it.qty)} ${esc(it.unit)}</td><td class="num">${fmtN(it.min)}</td><td class="num"><b>${fmtN(reorderQty(it))} ${esc(it.unit)}</b></td></tr>`).join('')}
      </tbody></table></div>` : ''}

    <div class="kb-bar">
      <input type="search" id="whSearch" placeholder="Search by name, SKU, category or location…" value="${esc(query)}" autocomplete="off">
      <select id="whCat" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="inline-sel"><input type="checkbox" id="whLow" ${lowOnly ? 'checked' : ''}> Low stock only</label>
      <button class="btn primary" data-wh="add">+ Add item</button>
    </div>
    <div class="card"><div class="matrix-wrap" id="whTable">${tableHtml()}</div></div>

    <div class="section-head" style="margin-top:28px"><h2>Recent movements</h2></div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Reference</th><th>By</th></tr></thead>
      <tbody>${recent.map(m => moveRow(m, nameOf(m.itemId))).join('') || '<tr><td colspan="7" class="sub">No movements yet.</td></tr>'}</tbody></table></div></div>`;
  };

  const TYPE = { receive: ['Receipt', 'ok'], issue: ['Issue', 'warn'], adjust: ['Adjustment', ''] };
  function moveRow(m, name) {
    const [label, cls] = TYPE[m.type];
    return `<tr><td>${fmtDT(m.at)}</td><td>${esc(name)}</td><td><span class="pill ${cls}">${label}</span></td>
      <td class="num ${m.delta < 0 ? 'down' : 'up'}">${m.delta > 0 ? '+' : ''}${fmtN(m.delta)}</td><td class="num">${fmtN(m.after)}</td><td>${esc(m.ref) || '—'}</td><td>${esc(m.user)}</td></tr>`;
  }

  /* ---------- dialogs ---------- */
  function modal() {
    let m = document.getElementById('whModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'whModal'; document.body.appendChild(m); }
    return m;
  }

  function itemDialog(it) {
    const cats = [...new Set(db.items.map(x => x.category))];
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="whItemForm" data-id="${it ? it.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${it ? 'Edit item' : 'Add item'}</h3>
      <div class="two"><label>SKU<input name="sku" required value="${it ? esc(it.sku) : ''}" placeholder="MDF-18-W"></label>
        <label>Name<input name="name" required value="${it ? esc(it.name) : ''}"></label></div>
      <div class="two"><label>Category<input name="category" list="whCats" required value="${it ? esc(it.category) : ''}"><datalist id="whCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Location<input name="location" value="${it ? esc(it.location) : ''}" placeholder="shelf / rack"></label></div>
      <div class="two"><label>Unit<select name="unit">${UNITS.map(u => `<option ${it && it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label>Min level (alert at or below)<input name="min" type="number" min="0" step="any" required value="${it ? it.min : 0}"></label></div>
      <div class="two"><label>Cost per unit, ₽<input name="cost" type="number" min="0" step="any" required value="${it ? it.cost : 0}"></label>
        ${it ? `<label>In stock<input value="${fmtN(it.qty)} ${esc(it.unit)}" disabled></label><p></p>` : '<label>Initial quantity<input name="qty" type="number" min="0" step="any" value="0"></label>'}</div>
      ${it ? '<p class="hint">Quantity changes only through Receive, Issue or Adjust, so the history stays correct.</p>' : ''}
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
      <p class="sub">In stock now: <b>${fmtN(it.qty)} ${esc(it.unit)}</b></p>
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

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-wh]');
    if (!el || !db) return;
    const d = el.dataset, it = db.items.find(x => x.id === d.id);
    switch (d.wh) {
      case 'add': itemDialog(null); break;
      case 'edit': itemDialog(it); break;
      case 'move': moveDialog(it, d.type); break;
      case 'history': historyDialog(it); break;
      case 'del':
        if (confirm(`Delete "${it.name}" and its movement history?`)) {
          db.items = db.items.filter(x => x.id !== d.id); db.moves = db.moves.filter(m => m.itemId !== d.id); persist(); redraw();
        }
        break;
    }
  });

  // live search / filters: only the table is redrawn so the search box keeps focus
  const refreshTable = () => { document.getElementById('whTable').innerHTML = tableHtml(); };
  document.addEventListener('input', e => { if (e.target.id === 'whSearch') { query = e.target.value; refreshTable(); } });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'whCat') { cat = t.value; refreshTable(); }
    if (t.id === 'whLow') { lowOnly = t.checked; refreshTable(); }
    if (t.id === 'whType') setQtyLabel(db.items.find(x => x.id === t.form.dataset.id).unit);
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id === 'whItemForm') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const id = f.dataset.id;
      const rec = { sku: d.sku.trim(), name: d.name.trim(), category: d.category.trim(), location: d.location.trim(), unit: d.unit, min: num(d.min), cost: num(d.cost) };
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
      it.qty = after;
      persist(); document.getElementById('whModal').hidden = true; redraw();
    }
  });
})();
