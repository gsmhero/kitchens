/* "Price offers" — create and manage price offers built from products of the Product Catalogue.
   An offer has a client, lines picked from the catalogue (quantity, price, per-line discount) or custom lines
   (delivery, installation…), an overall discount, a validity date and a status:
   Draft → Sent → Accepted / Rejected (Expired is shown automatically when the validity date has passed).
   The "Preview / print" view is a clean offer document for the client (print or save as PDF from the browser).
   Prototype: stored in localStorage as { offers[], counter }. */
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
  const num = v => Math.round((+v || 0) * 100) / 100;
  const money = n => K().fmt(num(n)) + ' ₽';
  const fmtD = t => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const plusDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'warn'], accepted: ['Accepted', 'ok'], rejected: ['Rejected', 'bad'], expired: ['Expired', 'bad'] };

  /* ---------- data ---------- */
  let db;
  const persist = () => save('offers', db);
  const noOf = n => 'PO-' + String(n).padStart(4, '0');

  const line = (p, qty = 1) => ({ id: uid(), productId: p.id, name: p.name, desc: p.specs.slice(0, 4).map(s => `${s.label}: ${s.value}`).join(' · '), qty, price: p.price === '' ? 0 : +p.price, discount: 0 });

  function init() {
    if (db) return;
    db = load('offers', null);
    if (db) return;
    db = { offers: [], counter: 0 };
    persist();
  }

  const totals = o => {
    const sub = o.items.reduce((a, it) => a + (+it.qty || 0) * (+it.price || 0) * (1 - (+it.discount || 0) / 100), 0);
    const disc = sub * ((+o.discount || 0) / 100);
    return { sub: num(sub), disc: num(disc), total: num(sub - disc) };
  };
  const lineTotal = it => num((+it.qty || 0) * (+it.price || 0) * (1 - (+it.discount || 0) / 100));
  const statusOf = o => (o.status === 'draft' || o.status === 'sent') && o.validUntil && o.validUntil < todayISO() ? 'expired' : o.status;
  const pill = o => { const s = statusOf(o), [l, c] = STATUS[s]; return `<span class="pill ${c}">${l}</span>`; };

  /* ---------- state ---------- */
  let mode = 'list';            // list | edit | doc
  let draft = null, isNew = false, notice = '';
  let query = '', statusF = '';
  let pickQuery = '', pickType = '';
  let pending = null; // { id, mode } — set by KitchensOffers.open*, consumed on the next navigation to this tab
  window.addEventListener('hashchange', () => {
    notice = ''; query = ''; statusF = '';
    const o = pending && db && db.offers.find(x => x.id === pending.id);
    if (o) { draft = JSON.parse(JSON.stringify(o)); isNew = false; mode = pending.mode; } else { mode = 'list'; draft = null; }
    pending = null;
  });

  /* API for other pages (the case page links offers as a block) */
  const publicOffer = o => { const t = totals(o), s = statusOf(o);
    return { id: o.id, no: o.no, clientName: o.clientName, contact: o.contact, requestId: o.requestId, validUntil: o.validUntil, discount: o.discount, notes: o.notes,
      date: o.acceptedAt || o.sentAt || o.at, acceptedAt: o.acceptedAt || 0, // "date" = when the offer was accepted (else sent / created); used by the dashboard
      createdBy: o.createdBy || '',
      status: s, statusLabel: STATUS[s][0], statusClass: STATUS[s][1], sub: t.sub, disc: t.disc, total: t.total,
      items: o.items.map(it => ({ name: it.name, desc: it.desc, qty: it.qty, price: it.price, discount: it.discount, lt: lineTotal(it) })) }; };
  window.KitchensOffers = {
    list: () => { init(); return [...db.offers].sort((a, b) => b.at - a.at).map(publicOffer); },
    get: id => { init(); const o = db.offers.find(x => x.id === id); return o ? publicOffer(o) : null; },
    create: ({ clientName, contact, requestId }) => {
      init();
      const o = Object.assign(newOffer(), { clientName, contact, requestId, no: noOf(++db.counter) });
      db.offers.push(o); persist(); return o.id;
    },
    openEditor: id => { pending = { id, mode: 'edit' }; location.hash = 'tab/price-offers'; },
    openDoc: id => { pending = { id, mode: 'doc' }; location.hash = 'tab/price-offers'; }
  };

  /* ---------- list ---------- */
  function listHtml() {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = db.offers.filter(o => !statusF || statusOf(o) === statusF)
      .filter(o => t.every(w => (o.no + ' ' + o.clientName + ' ' + o.contact).toLowerCase().includes(w)))
      .sort((a, b) => b.at - a.at);
    return `<table><thead><tr><th>No.</th><th>Client</th><th>Items</th><th class="num">Total</th><th>Valid until</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(o => `<tr>
        <td><b>${esc(o.no)}</b></td>
        <td>${esc(o.clientName)}<br><small class="sub">${esc(o.contact)}</small></td>
        <td>${o.items.length}</td>
        <td class="num"><b>${money(totals(o).total)}</b></td>
        <td>${fmtD(o.validUntil)}</td>
        <td>${pill(o)}</td>
        <td class="row-actions">
          <button class="btn small" data-po="open" data-id="${o.id}">Open</button>
          <button class="btn small" data-po="doc" data-id="${o.id}">Preview</button>
          <button class="btn small" data-po="dup" data-id="${o.id}">Duplicate</button>
          <button class="link danger-t" data-po="del" data-id="${o.id}">delete</button></td></tr>`).join('') || `<tr><td colspan="7" class="sub">${db.offers.length ? 'No offers match.' : 'No offers yet. Click “New offer”.'}</td></tr>`}
      </tbody></table>`;
  }

  function listView() {
    const by = s => db.offers.filter(o => statusOf(o) === s), sum = a => a.reduce((x, o) => x + totals(o).total, 0);
    return `
    <h1>Price offers</h1>
    <p class="sub">Build offers from products of the Product Catalogue, send them to clients and track the answer.</p>
    <div class="grid g4">
      <div class="card kpi"><div class="l">Offers</div><div class="n">${db.offers.length}</div><div class="d">${by('draft').length} drafts</div></div>
      <div class="card kpi"><div class="l">Awaiting answer</div><div class="n">${by('sent').length}</div><div class="d">${money(sum(by('sent')))}</div></div>
      <div class="card kpi"><div class="l">Accepted</div><div class="n up">${by('accepted').length}</div><div class="d">${money(sum(by('accepted')))}</div></div>
      <div class="card kpi"><div class="l">Rejected / expired</div><div class="n ${by('rejected').length + by('expired').length ? 'down' : ''}">${by('rejected').length + by('expired').length}</div></div>
    </div>
    <div class="kb-bar">
      <input type="search" id="poSearch" placeholder="Search by number, client or contact…" value="${esc(query)}" autocomplete="off">
      <select id="poStatus" aria-label="Status"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === statusF ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn primary" data-po="new">+ New offer</button>
    </div>
    <div class="card"><div class="matrix-wrap" id="poTable">${listHtml()}</div></div>`;
  }

  /* ---------- editor ---------- */
  const lineRow = (it, i) => `<tr>
    <td><b>${esc(it.name)}</b>${it.productId ? '' : ' <span class="pill">custom</span>'}<br><small class="sub">${esc(it.desc)}</small></td>
    <td><input class="narrow" type="number" min="0" step="any" data-po-line="qty" data-i="${i}" value="${esc(it.qty)}"></td>
    <td><input type="number" min="0" step="any" data-po-line="price" data-i="${i}" value="${esc(it.price)}"></td>
    <td><input class="narrow" type="number" min="0" max="100" step="any" data-po-line="discount" data-i="${i}" value="${esc(it.discount)}"> %</td>
    <td class="num" data-lt="${i}">${money(lineTotal(it))}</td>
    <td><button class="x" data-po="rm-line" data-i="${i}" title="Remove line">×</button></td></tr>`;

  const totalsHtml = o => { const t = totals(o); return `
    <div class="po-totals">
      <div><span>Subtotal</span><b>${money(t.sub)}</b></div>
      <div><span>Overall discount <input class="narrow" type="number" min="0" max="100" step="any" data-po-f="discount" value="${esc(o.discount)}"> %</span><b>− ${money(t.disc)}</b></div>
      <div class="grand"><span>Total</span><b>${money(t.total)}</b></div>
    </div>`; };

  function editView() {
    const reqs = window.KitchensRequest.all();
    return `
    <button class="link back" data-po="back">← All offers</button>
    <div class="section-head"><h1>${isNew ? 'New offer' : 'Offer ' + esc(draft.no)} ${isNew ? '' : pill(draft)}</h1>
      <span class="seg"><button class="btn" data-po="doc-draft">Preview / print</button><button class="btn primary" data-po="save">Save offer</button></span></div>
    ${notice ? `<div class="notice ok">${esc(notice)}</div>` : ''}
    <div class="grid g2">
      <div class="card">
        <h3>Client</h3>
        <label class="stack">Name<input data-po-f="clientName" value="${esc(draft.clientName)}" placeholder="Client name"></label>
        <label class="stack">Phone or email<input data-po-f="contact" value="${esc(draft.contact)}"></label>
        <label class="stack">Linked request <small class="sub">(from Flow, optional)</small>
          <select data-po-f="requestId"><option value="">— none —</option>${reqs.map(r => `<option value="${r.sub.id}" ${r.sub.id === draft.requestId ? 'selected' : ''}>${esc(r.sub.from.name)} — to ${esc(r.to)} (${fmtD(r.sub.at)})</option>`).join('')}</select></label>
        ${draft.requestId ? `<a class="link" href="#case/${esc(draft.requestId)}">Open the request</a>` : ''}
      </div>
      <div class="card">
        <h3>Terms</h3>
        <label class="stack">Valid until<input type="date" data-po-f="validUntil" value="${esc(draft.validUntil)}"></label>
        <label class="stack">Status<select data-po-f="status">${['draft', 'sent', 'accepted', 'rejected'].map(s => `<option value="${s}" ${draft.status === s ? 'selected' : ''}>${STATUS[s][0]}</option>`).join('')}</select></label>
        <label class="stack">Notes for the client<textarea rows="3" data-po-f="notes">${esc(draft.notes)}</textarea></label>
      </div>
    </div>
    <div class="card">
      <div class="section-head" style="margin-top:0"><h3 style="margin:0">Items</h3>
        <span class="seg"><button class="btn primary" data-po="pick">+ Add from catalogue</button><button class="btn" data-po="custom">+ Custom line</button></span></div>
      <div class="matrix-wrap"><table class="po-lines"><thead><tr><th>Product</th><th>Qty</th><th>Price, ₽</th><th>Discount</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${draft.items.map(lineRow).join('') || '<tr><td colspan="6" class="sub">No items yet. Add products from the catalogue.</td></tr>'}</tbody></table></div>
      <div id="poTotals">${totalsHtml(draft)}</div>
    </div>`;
  }

  /* ---------- offer document (print view) ---------- */
  function docView() {
    const o = draft, t = totals(o);
    return `
    <div class="no-print doc-bar"><button class="link back" data-po="${isNew || draft._editing ? 'edit' : 'back'}">← Back</button>
      <button class="btn primary" data-po="print">🖨 Print / Save as PDF</button></div>
    <article class="card po-doc">
      <header class="po-doc-h"><div><div class="brand"><span class="logo">K</span> Kitchens</div><small class="sub">Furniture manufacturing</small></div>
        <div class="po-doc-no"><h2>Price offer ${esc(o.no || '(draft)')}</h2><div class="sub">Date: ${fmtD(o.at || Date.now())}<br>Valid until: ${fmtD(o.validUntil)}</div></div></header>
      <div class="po-doc-client"><span class="sub">Prepared for</span><br><b>${esc(o.clientName) || '—'}</b><br>${esc(o.contact)}</div>
      <table class="po-lines"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Disc.</th><th class="num">Total</th></tr></thead><tbody>
        ${o.items.map(it => `<tr><td><b>${esc(it.name)}</b><br><small class="sub">${esc(it.desc)}</small></td><td class="num">${esc(it.qty)}</td><td class="num">${money(it.price)}</td><td class="num">${+it.discount ? esc(it.discount) + ' %' : '—'}</td><td class="num">${money(lineTotal(it))}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">No items.</td></tr>'}
      </tbody></table>
      <div class="po-totals">
        <div><span>Subtotal</span><b>${money(t.sub)}</b></div>
        ${+o.discount ? `<div><span>Discount ${esc(o.discount)} %</span><b>− ${money(t.disc)}</b></div>` : ''}
        <div class="grand"><span>Total</span><b>${money(t.total)}</b></div>
      </div>
      ${o.notes ? `<p class="po-notes"><b>Notes</b><br>${esc(o.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p class="sub">Prepared by ${esc(o.createdBy || me())}. This offer is valid until ${fmtD(o.validUntil)}.</p>
    </article>`;
  }

  window.KitchensPages['Price offers'] = () => {
    init();
    if (mode !== 'list' && !draft) mode = 'list';
    return mode === 'edit' ? editView() : mode === 'doc' ? docView() : listView();
  };

  /* ---------- catalogue picker ---------- */
  function modal() {
    let m = document.getElementById('poModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'poModal'; document.body.appendChild(m); }
    return m;
  }
  function pickList() {
    const t = pickQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const list = window.KitchensCatalogue.products().filter(p => !pickType || p.typeId === pickType)
      .filter(p => t.every(w => (p.name + ' ' + p.desc + ' ' + p.typeName).toLowerCase().includes(w)));
    return list.map(p => `<div class="pick-row">
      <div class="p-thumb">${p.photo ? `<img src="${p.photo}" alt="">` : '<div class="no-photo"></div>'}</div>
      <div class="pick-info"><b>${esc(p.name)}</b> ${p.published ? '' : '<span class="pill">Draft</span>'}<br><small class="sub">${esc(p.typeName)} · ${p.specs.slice(0, 3).map(s => `${esc(s.label)}: ${esc(s.value)}`).join(' · ')}</small></div>
      <div class="num"><b>${p.price === '' ? 'on request' : money(p.price)}</b></div>
      <button class="btn small primary" data-po="add-product" data-id="${p.id}">Add</button></div>`).join('') || '<div class="placeholder">No products found. Add products in the Product Catalogue tab.</div>';
  }
  function pickDialog() {
    const m = modal();
    m.innerHTML = `<div class="modal-card wide hist" role="dialog" aria-modal="true" aria-label="Add from catalogue">
      <button type="button" class="close" data-close>×</button>
      <h3>Add from Product Catalogue</h3>
      <div class="kb-bar"><input type="search" id="poPickSearch" placeholder="Search products…" value="${esc(pickQuery)}" autocomplete="off">
        <select id="poPickType"><option value="">All types</option>${window.KitchensCatalogue.types().map(t => `<option value="${t.id}" ${t.id === pickType ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div id="poPickList" class="pick-list">${pickList()}</div>
      <button type="button" class="btn wide" data-close>Done</button>
    </div>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  /* ---------- events ---------- */
  const newOffer = () => ({ id: uid(), no: '', clientName: '', contact: '', requestId: '', items: [], discount: 0, notes: '', validUntil: plusDays(14), status: 'draft', createdBy: me(), at: Date.now(), sentAt: 0 });
  const refreshTotals = () => {
    document.getElementById('poTotals').innerHTML = totalsHtml(draft);
    draft.items.forEach((it, i) => { const c = document.querySelector(`[data-lt="${i}"]`); if (c) c.textContent = money(lineTotal(it)); });
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-po]');
    if (!el || !db) return;
    const d = el.dataset, o = db.offers.find(x => x.id === d.id), i = +d.i;
    switch (d.po) {
      case 'new': draft = newOffer(); isNew = true; mode = 'edit'; notice = ''; redraw(); break;
      case 'open': draft = JSON.parse(JSON.stringify(o)); isNew = false; mode = 'edit'; notice = ''; redraw(); break;
      case 'doc': draft = JSON.parse(JSON.stringify(o)); isNew = false; mode = 'doc'; redraw(); break;
      case 'doc-draft': mode = 'doc'; draft._editing = true; redraw(); break;
      case 'edit': mode = 'edit'; redraw(); break;
      case 'back': mode = 'list'; draft = null; notice = ''; redraw(); break;
      case 'print': window.print(); break;
      case 'dup': {
        const c = JSON.parse(JSON.stringify(o));
        Object.assign(c, { id: uid(), no: noOf(++db.counter), status: 'draft', at: Date.now(), sentAt: 0, validUntil: plusDays(14), createdBy: me() });
        c.items.forEach(it => { it.id = uid(); });
        db.offers.push(c); persist(); redraw();
        break;
      }
      case 'del': if (confirm(`Delete offer ${o.no}?`)) { db.offers = db.offers.filter(x => x !== o); persist(); redraw(); } break;
      case 'pick': pickDialog(); break;
      case 'custom': draft.items.push({ id: uid(), productId: '', name: 'Delivery', desc: '', qty: 1, price: 0, discount: 0 }); redraw(); break;
      case 'rm-line': draft.items.splice(i, 1); redraw(); break;
      case 'add-product': {
        const p = window.KitchensCatalogue.products().find(x => x.id === d.id);
        const ex = draft.items.find(it => it.productId === p.id);
        if (ex) ex.qty = (+ex.qty || 0) + 1; else draft.items.push(line(p));
        redraw();
        el.textContent = '✔ Added'; setTimeout(() => { if (el.isConnected) el.textContent = 'Add'; }, 1200);
        break;
      }
      case 'save': {
        if (!draft.clientName.trim()) { alert('Please enter the client name.'); return; }
        if ((draft.status === 'sent' || draft.status === 'accepted') && !draft.items.length) { alert('Add at least one item before marking the offer as ' + draft.status + '.'); return; }
        if (draft.status !== 'draft' && !draft.sentAt) draft.sentAt = Date.now();
        if (draft.status === 'accepted' && !draft.acceptedAt) draft.acceptedAt = Date.now(); // revenue is counted from this date
        if (draft.status !== 'accepted') draft.acceptedAt = 0;
        const saved = JSON.parse(JSON.stringify(draft)); delete saved._editing;
        const prevStatus = isNew ? 'draft' : (db.offers.find(x => x.id === saved.id) || {}).status;
        if (isNew) { saved.no = noOf(++db.counter); db.offers.push(saved); isNew = false; draft.no = saved.no; }
        else db.offers[db.offers.findIndex(x => x.id === saved.id)] = saved;
        persist(); notice = `Offer ${saved.no} saved.`;
        if (saved.status !== prevStatus && ['sent', 'accepted', 'rejected'].includes(saved.status)) { // tell the offer's author and the employee the request went to
          const t = totals(saved).total, req = saved.requestId && window.KitchensRequest.all().find(r => r.sub.id === saved.requestId);
          const n = { type: 'offer', title: `Offer ${saved.no} ${saved.status}`, text: `${saved.clientName} · ${money(t)}`, link: req ? '#case/' + saved.requestId : '#tab/price-offers' };
          [...new Set([saved.createdBy, req && req.to].filter(Boolean))].forEach(u => window.KitchensNotify.push(u, n));
        }
        redraw();
        break;
      }
    }
  });

  // text edits are kept in the draft without redrawing (so typing is never interrupted)
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'poSearch') { query = t.value; document.getElementById('poTable').innerHTML = listHtml(); return; }
    if (t.id === 'poPickSearch') { pickQuery = t.value; document.getElementById('poPickList').innerHTML = pickList(); return; }
    if (!draft || mode !== 'edit') return;
    if (t.dataset.poLine) { draft.items[+t.dataset.i][t.dataset.poLine] = t.value; refreshTotals(); }
    else if (t.dataset.poF && t.tagName !== 'SELECT') { draft[t.dataset.poF] = t.value; if (t.dataset.poF === 'discount') refreshTotals(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'poStatus') { statusF = t.value; document.getElementById('poTable').innerHTML = listHtml(); return; }
    if (t.id === 'poPickType') { pickType = t.value; document.getElementById('poPickList').innerHTML = pickList(); return; }
    if (!draft || mode !== 'edit' || !t.dataset.poF) return;
    draft[t.dataset.poF] = t.value;
    if (t.dataset.poF === 'requestId' && t.value) { // prefill the client from the linked request
      const r = window.KitchensRequest.all().find(x => x.sub.id === t.value);
      if (r) { if (!draft.clientName.trim()) draft.clientName = r.sub.from.name; if (!draft.contact.trim()) draft.contact = r.sub.from.contact; }
      redraw();
    }
  });
})();
