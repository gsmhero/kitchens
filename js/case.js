/* Case page — one request/order as a separate page (replaces the old "Answers" dialog).
   Staff route:  #case/<id>   (registered users)   — stage, notes, add blocks, edit everything, share link
   Client route: #share/<id>  (no login, read-only + comments) — the link staff send to the client
   Blocks: Status, Measure, Offer, Price Offer, each with a comment thread.
   Stored inside the request object (localStorage, prototype): sub.case = { notes, blocks[] }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const R = () => window.KitchensRequest;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const pad = n => String(n).padStart(3, '0');
  const fmtD = t => { const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); };
  const BLOCK_TYPES = { status: 'Status', measure: 'Measure', offer: 'Offer', price: 'Price Offer' };
  const STATUSES = ['New', 'In progress', 'Waiting for client', 'Done'];
  const DEFAULT_FIELDS = ['Length (mm)', 'Height (mm)', 'Depth (mm)', 'Protrusion (mm)', 'Window to door (mm)'];

  let ctx = { id: '', client: false };
  const collapsed = new Set();   // collapsed block ids (view state only)
  const pending = {};            // block id -> file names chosen for the next comment

  const find = id => R().all().find(r => r.sub.id === id);

  /* load a fresh copy, change it, save it back; false if the browser storage is full */
  function mutate(fn) {
    const r = find(ctx.id);
    if (!r) return false;
    const sub = JSON.parse(JSON.stringify(r.sub));
    sub.case = sub.case || { notes: '', blocks: [] };
    fn(sub.case, sub);
    const ok = R().replace(r.to, sub);
    if (!ok) alert('Could not save: browser storage is full. Try fewer or smaller photos.');
    return ok;
  }
  const block = (c, id) => c.blocks.find(b => b.id === id);
  const redraw = () => K().render();

  /* ---------- rendering ---------- */
  const photoTile = (src, attrs, ro) => `<div class="ph"><img src="${src}" alt="photo">${ro ? '' : `<button class="x" ${attrs} title="Remove">×</button>`}</div>`;
  const addTile = (attrs, ro) => ro ? '' : `<label class="ph add" title="Add photo">+<input type="file" accept="image/*" multiple hidden data-in="photo" ${attrs}></label>`;
  const disabled = ro => ro ? 'disabled' : '';

  function comments(b, staff) {
    return `
    <div class="cms">
      ${b.comments.map(c => `
        <div class="cm ${c.client ? 'by-client' : ''}">
          <div class="cm-h"><b>${esc(c.user)}</b><small>Date: ${fmtD(c.at)}</small>
            ${staff ? `<button class="x" data-cs="del-cm" data-bid="${b.id}" data-cid="${c.id}" title="Delete">×</button>` : ''}</div>
          <div class="cm-t">${esc(c.text)} ${c.files.map(f => `<span class="pill">📎 ${esc(f)}</span>`).join(' ')}</div>
        </div>`).join('')}
      <div class="cm-add">
        <input data-cm="${b.id}" placeholder="Add comment">
        <label class="btn">Attach file<input type="file" multiple hidden data-in="cm-files" data-bid="${b.id}"></label>
        <button class="btn dark" data-cs="send" data-bid="${b.id}">Send</button>
      </div>
      <div class="cm-pending" data-pend="${b.id}"></div>
    </div>`;
  }

  function measureCard(b, m, i, ro) {
    const lock = ro || m.locked;
    return `
    <div class="mcard">
      <div class="m-photos">
        ${m.photos.map((p, k) => photoTile(p, `data-cs="rm-photo" data-bid="${b.id}" data-mid="${m.id}" data-k="${k}"`, lock)).join('')}
        ${addTile(`data-bid="${b.id}" data-mid="${m.id}"`, lock)}
        <div class="m-files">${m.files.map((f, k) => `<div>📎 ${esc(f)} ${lock ? '' : `<button class="link danger-t" data-cs="rm-mfile" data-bid="${b.id}" data-mid="${m.id}" data-k="${k}">remove</button>`}</div>`).join('')}
          ${lock ? '' : `<label class="link">+ attach file<input type="file" multiple hidden data-in="m-files" data-bid="${b.id}" data-mid="${m.id}"></label>`}</div>
      </div>
      <div class="m-fields">
        ${m.fields.map(f => `
          <label>${esc(f.label)}${f.unit && !/\(/.test(f.label) ? ` (${esc(f.unit)})` : ''}
            <input data-in="mf" data-bid="${b.id}" data-mid="${m.id}" data-fid="${f.id}" type="${f.type === 'text' ? 'text' : 'number'}" value="${esc(f.value)}" ${disabled(lock)}>
            ${lock ? '' : `<button class="x" data-cs="rm-field" data-bid="${b.id}" data-mid="${m.id}" data-fid="${f.id}" title="Remove field">×</button>`}</label>`).join('')}
        ${lock ? '' : `<div class="add-field">
          <input placeholder="Field name" data-nf="${m.id}-name">
          <select data-nf="${m.id}-type"><option value="number">Number</option><option value="text">Text</option></select>
          <input placeholder="mm" data-nf="${m.id}-unit" class="narrow">
          <button class="btn dark" data-cs="add-field" data-bid="${b.id}" data-mid="${m.id}">Add field</button></div>`}
      </div>
      <div class="m-side">
        ${ro ? '' : `<button class="btn dark" data-cs="lock" data-bid="${b.id}" data-mid="${m.id}">${m.locked ? 'Edit' : 'Save'}</button>`}
        <div class="sub">ID: № ${pad(i + 1)}</div>
      </div>
    </div>`;
  }

  /* Price Offer block: shows an offer picked from the Price offers list (live data, not a copy) */
  function offerBody(b, ro) {
    const O = window.KitchensOffers, offers = O.list(), o = b.offerId ? O.get(b.offerId) : null, money = n => K().fmt(n) + ' ₽';
    if (ro) { // client view
      if (!o) return '<p class="sub">No offer has been attached yet.</p>';
      if (o.status === 'draft') return `<p class="sub">Offer <b>${esc(o.no)}</b> is being prepared. You will see it here as soon as it is sent.</p>`;
    }
    if (!o) {
      const mine = offers.filter(x => x.requestId === ctx.id), other = offers.filter(x => x.requestId !== ctx.id);
      const opt = x => `<option value="${x.id}">${esc(x.no)} — ${esc(x.clientName)} — ${money(x.total)} — ${esc(x.statusLabel)}</option>`;
      return `${b.offerId ? '<p class="sub">The linked offer no longer exists. Pick another one.</p>' : ''}
        <div class="row">
          <label class="grow">Select an offer from Price offers
            <select data-in="bk" data-k="offerId" data-bid="${b.id}">
              <option value="">— choose offer —</option>
              ${mine.length ? `<optgroup label="Linked to this request">${mine.map(opt).join('')}</optgroup>` : ''}
              <optgroup label="${mine.length ? 'Other offers' : 'All offers'}">${other.map(opt).join('')}</optgroup>
            </select></label>
          <button class="btn dark push" data-cs="new-offer" data-bid="${b.id}">+ Create offer for this client</button>
        </div>
        ${offers.length ? '' : '<p class="hint">There are no offers yet. Create one for this client.</p>'}`;
    }
    return `
      <div class="offer-head">
        <b>${esc(o.no)}</b> <span class="pill ${o.statusClass}">${esc(o.statusLabel)}</span>
        <span class="sub">Valid until ${fmtD(o.validUntil)}${ro ? '' : ' · ' + esc(o.clientName)}</span>
        ${ro ? '' : `<span class="offer-actions">
          <button class="btn small" data-cs="offer-open" data-oid="${o.id}">Open offer</button>
          <button class="btn small" data-cs="offer-doc" data-oid="${o.id}">Preview / print</button>
          <button class="link" data-cs="offer-unlink" data-bid="${b.id}">change</button></span>`}
      </div>
      <div class="matrix-wrap"><table class="po-lines"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Disc.</th><th class="num">Total</th></tr></thead><tbody>
        ${o.items.map(it => `<tr><td><b>${esc(it.name)}</b><br><small class="sub">${esc(it.desc)}</small></td><td class="num">${esc(it.qty)}</td><td class="num">${money(it.price)}</td><td class="num">${+it.discount ? esc(it.discount) + ' %' : '—'}</td><td class="num">${money(it.lt)}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">This offer has no items yet.</td></tr>'}
      </tbody></table></div>
      <div class="po-totals">
        <div><span>Subtotal</span><b>${money(o.sub)}</b></div>
        ${+o.discount ? `<div><span>Discount ${esc(o.discount)} %</span><b>− ${money(o.disc)}</b></div>` : ''}
        <div class="grand"><span>Total</span><b>${money(o.total)}</b></div>
      </div>
      ${o.notes ? `<p class="po-notes">${esc(o.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
  }

  function blockBody(b, ro, staff) {
    const lock = ro || b.locked;
    switch (b.type) {
      case 'status':
        return `<div class="row"><label>Status
          <select data-in="bk" data-k="status" data-bid="${b.id}" ${disabled(ro)}>${STATUSES.map(s => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="grow">Note<input data-in="bk" data-k="text" data-bid="${b.id}" value="${esc(b.text)}" ${disabled(ro)}></label></div>`;
      case 'measure': {
        const users = R().users();
        return `<div class="row">
          <label>Assign <select data-in="bk" data-k="assignee" data-bid="${b.id}" ${disabled(ro)}><option value="">Users</option>${users.map(u => `<option ${u.name === b.assignee ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
          <label>Measure Date <input type="date" data-in="bk" data-k="date" data-bid="${b.id}" value="${esc(b.date)}" ${disabled(ro)}></label>
          ${ro ? '' : `<button class="btn dark push" data-cs="create-measure" data-bid="${b.id}">Create Measure</button>`}
        </div>
        ${b.measures.map((m, i) => measureCard(b, m, i, ro)).join('')}`;
      }
      case 'offer':
        return `<div class="o-photos">
            ${b.photos.map((p, k) => photoTile(p, `data-cs="rm-photo" data-bid="${b.id}" data-k="${k}"`, lock)).join('')}
            ${addTile(`data-bid="${b.id}"`, lock)}
          </div>
          <label class="stack">Offer description<textarea rows="4" data-in="bk" data-k="desc" data-bid="${b.id}" ${disabled(lock)}>${esc(b.desc)}</textarea></label>
          <div class="row">
            <label>Cost <input type="number" min="0" data-in="bk" data-k="cost" data-bid="${b.id}" value="${esc(b.cost)}" ${disabled(lock)}> RUB</label>
            <label>Qty <input type="number" min="0" data-in="bk" data-k="days" data-bid="${b.id}" value="${esc(b.days)}" ${disabled(lock)}> DAYS</label>
            ${ro ? '' : `<button class="btn dark push" data-cs="lock" data-bid="${b.id}">${b.locked ? 'Edit' : 'Save'}</button>`}
          </div>`;
      case 'price': {
        if (!b.items) return offerBody(b, ro); // linked offer from the Price offers list
        const total = b.items.reduce((a, r) => a + (+r.qty || 0) * (+r.price || 0), 0);
        return `<table class="price"><thead><tr><th>Item</th><th>Qty</th><th>Price, RUB</th><th>Sum</th><th></th></tr></thead><tbody>
          ${b.items.map((r, k) => `<tr>
            <td><input data-in="pr" data-pk="name" data-k="${k}" data-bid="${b.id}" value="${esc(r.name)}" ${disabled(lock)}></td>
            <td><input type="number" min="0" class="narrow" data-in="pr" data-pk="qty" data-k="${k}" data-bid="${b.id}" value="${esc(r.qty)}" ${disabled(lock)}></td>
            <td><input type="number" min="0" data-in="pr" data-pk="price" data-k="${k}" data-bid="${b.id}" value="${esc(r.price)}" ${disabled(lock)}></td>
            <td>${K().fmt((+r.qty || 0) * (+r.price || 0))}</td>
            <td>${lock ? '' : `<button class="x" data-cs="rm-row" data-bid="${b.id}" data-k="${k}">×</button>`}</td></tr>`).join('')}
          </tbody><tfoot><tr><th colspan="3">Total</th><th colspan="2">${K().fmt(total)} RUB</th></tr></tfoot></table>
          ${ro ? '' : `<div class="row"><button class="btn" data-cs="add-row" data-bid="${b.id}" ${b.locked ? 'disabled' : ''}>+ Add item</button>
            <button class="btn dark push" data-cs="lock" data-bid="${b.id}">${b.locked ? 'Edit' : 'Save'}</button></div>`}`;
      }
    }
    return '';
  }

  function blockCard(b, c, i, client) {
    const open = !collapsed.has(b.id);
    const title = b.type === 'offer' ? 'Offer ' + (c.blocks.slice(0, i + 1).filter(x => x.type === 'offer').length) : BLOCK_TYPES[b.type];
    return `
    <section class="cblock">
      <header><h3>${esc(title)}</h3>
        ${client ? '' : `<button class="link danger-t" data-cs="rm-block" data-bid="${b.id}">delete block</button>`}
        <button class="chev" data-cs="toggle" data-bid="${b.id}" aria-label="Collapse">${open ? '▲' : '▼'}</button></header>
      ${open ? `<div class="cb-body">${blockBody(b, client, !client)}${comments(b, !client)}</div>` : ''}
    </section>`;
  }

  window.KitchensPages.Case = (id, client) => {
    ctx = { id, client };
    const r = find(id);
    if (!r) return `<h1>Request not found</h1><div class="placeholder">This request was not found. It is stored in the browser where it was sent.</div>`;
    const { to, sub } = r;
    const c = sub.case || { notes: '', blocks: [] };
    const stages = K().getStages(), cur = K().stageIndex(sub.stage);
    const url = location.href.split('#')[0] + '#share/' + id; // keeps the ?query of proxy hosts such as htmlpreview
    const reqOpen = !collapsed.has('req');
    return `
    <div class="case-top">
      ${client ? '<span></span>' : '<button class="link back-btn" data-cs="back">‹ BACK</button>'}
      ${client ? '' : `<div class="share">LINK URL <input readonly value="${esc(url)}" id="shareUrl">
        <button class="btn small" data-cs="copy">COPY LINK</button><button class="btn small" data-cs="share">SHARE</button></div>`}
    </div>
    <h1>Request from ${esc(sub.from.name)}</h1>
    <p class="sub">${esc(sub.from.contact)} · sent to ${esc(to)} · ${fmtD(sub.at)}${client ? '' : ' · <a class="link" href="#share/' + id + '">preview client view</a>'}</p>

    ${client ? '' : `<div class="grid g2 head">
      <label class="stack">Notes (internal, hidden from client)
        <textarea rows="5" id="caseNotes">${esc(c.notes)}</textarea></label>
      <div>
        <label class="stack">Stage
          <span class="row"><select id="caseStage">${stages.map((s, i) => `<option value="${esc(s.id)}" ${i === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <button class="btn primary" data-cs="save-stage">Save</button></span></label>
        <label class="stack">Add new block
          <span class="row"><select id="newBlock">${Object.entries(BLOCK_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button class="btn dark" data-cs="add-block">Add block</button></span></label>
      </div></div>`}
    ${client ? `<p><span class="pill ok">Stage: ${esc(stages[cur].name)}</span></p>` : ''}

    <section class="cblock">
      <header><h3>Request</h3><button class="chev" data-cs="toggle" data-bid="req">${reqOpen ? '▲' : '▼'}</button></header>
      ${reqOpen ? `<div class="cb-body"><dl class="answers">${sub.fields.map(fl => `<dt>${esc(fl.label)}</dt><dd>${fl.type === 'checkbox' ? (sub.values[fl.id] ? 'Yes' : 'No') : (esc(sub.values[fl.id]) || '—')}</dd>`).join('')}</dl></div>` : ''}
    </section>
    ${c.blocks.map((b, i) => blockCard(b, c, i, client)).join('')}
    ${!c.blocks.length ? `<p class="sub">${client ? 'Nothing here yet.' : 'No blocks yet. Use “Add new block” above.'}</p>` : ''}`;
  };

  /* ---------- new block factory ---------- */
  const newBlock = type => {
    const b = { id: uid(), type, comments: [] };
    if (type === 'status') Object.assign(b, { status: STATUSES[1], text: '' });
    if (type === 'measure') Object.assign(b, { assignee: '', date: '', measures: [] });
    if (type === 'offer') Object.assign(b, { photos: [], desc: '', cost: '', days: '', locked: false });
    if (type === 'price') b.offerId = ''; // an offer from the Price offers list (older blocks may still hold their own item table)
    return b;
  };

  /* ---------- downscale photos so localStorage can hold them ---------- */
  const readPhoto = file => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  /* ---------- events ---------- */
  const onCase = () => /^(case|share)\//.test(decodeURIComponent(location.hash.slice(1)));
  window.addEventListener('hashchange', () => { if (onCase()) window.scrollTo(0, 0); });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-cs]');
    if (!el || !onCase()) return;
    const d = el.dataset, bid = d.bid;
    const done = () => redraw();
    switch (d.cs) {
      case 'back': location.hash = 'tab/flow'; return;
      case 'toggle': collapsed.has(bid) ? collapsed.delete(bid) : collapsed.add(bid); return done();
      case 'copy': case 'share': {
        const url = document.getElementById('shareUrl').value;
        const copy = () => { navigator.clipboard.writeText(url).then(() => { el.textContent = 'COPIED ✔'; setTimeout(() => { el.textContent = d.cs === 'copy' ? 'COPY LINK' : 'SHARE'; }, 1500); }, () => window.prompt('Copy this link:', url)); };
        if (d.cs === 'share' && navigator.share) navigator.share({ title: 'Your kitchen request', url }).catch(() => {});
        else if (navigator.clipboard) copy(); else window.prompt('Copy this link:', url);
        return;
      }
      case 'save-stage':
        mutate((c, sub) => {
          const before = sub.stage, was = !!sub.archivedAt;
          c.notes = document.getElementById('caseNotes').value; sub.stage = document.getElementById('caseStage').value;
          sub.archivedAt = K().isArchive(sub.stage) ? (sub.archivedAt || Date.now()) : 0; // the Archive stage moves the request to the Archive tab
          if (sub.archivedAt && !was) sub.prevStage = before; // remembered so the Archive tab can restore it
        });
        return done();
      case 'add-block': mutate(c => c.blocks.push(newBlock(document.getElementById('newBlock').value))); return done();
      case 'rm-block': if (confirm('Delete this block with all its content?')) { mutate(c => { c.blocks = c.blocks.filter(b => b.id !== bid); }); done(); } return;
      case 'create-measure':
        mutate(c => block(c, bid).measures.push({ id: uid(), photos: [], files: [], locked: false,
          fields: DEFAULT_FIELDS.map(label => ({ id: uid(), label, type: 'number', unit: 'mm', value: '' })) }));
        return done();
      case 'lock': mutate(c => { const b = block(c, bid), t = d.mid ? b.measures.find(m => m.id === d.mid) : b; t.locked = !t.locked; }); return done();
      case 'rm-photo': mutate(c => { const b = block(c, bid); (d.mid ? b.measures.find(m => m.id === d.mid) : b).photos.splice(+d.k, 1); }); return done();
      case 'rm-mfile': mutate(c => block(c, bid).measures.find(m => m.id === d.mid).files.splice(+d.k, 1)); return done();
      case 'rm-field': mutate(c => { const m = block(c, bid).measures.find(x => x.id === d.mid); m.fields = m.fields.filter(f => f.id !== d.fid); }); return done();
      case 'add-field': {
        const g = k => document.querySelector(`[data-nf="${d.mid}-${k}"]`);
        const label = g('name').value.trim();
        if (!label) { g('name').focus(); return; }
        mutate(c => block(c, bid).measures.find(m => m.id === d.mid).fields.push({ id: uid(), label, type: g('type').value, unit: g('unit').value.trim(), value: '' }));
        return done();
      }
      case 'new-offer': { // create an offer for this client, linked to this request, and attach it
        const sub = find(ctx.id).sub;
        const oid = window.KitchensOffers.create({ clientName: sub.from.name, contact: sub.from.contact, requestId: ctx.id });
        mutate(c => { block(c, bid).offerId = oid; });
        return done();
      }
      case 'offer-open': window.KitchensOffers.openEditor(d.oid); return;
      case 'offer-doc': window.KitchensOffers.openDoc(d.oid); return;
      case 'offer-unlink': mutate(c => { block(c, bid).offerId = ''; }); return done();
      case 'add-row': mutate(c => block(c, bid).items.push({ name: '', qty: 1, price: '' })); return done();
      case 'rm-row': mutate(c => block(c, bid).items.splice(+d.k, 1)); return done();
      case 'del-cm': mutate(c => { const b = block(c, bid); b.comments = b.comments.filter(x => x.id !== d.cid); }); return done();
      case 'send': {
        const input = document.querySelector(`[data-cm="${bid}"]`);
        const text = input.value.trim(), files = pending[bid] || [];
        if (!text && !files.length) { input.focus(); return; }
        const user = ctx.client ? 'Client (' + find(ctx.id).sub.from.name + ')' : K().getUser().name;
        mutate(c => block(c, bid).comments.push({ id: uid(), user, at: Date.now(), text, files, client: ctx.client }));
        { const r = find(ctx.id); // tell the employee the request was sent to (a client's comment, or a colleague's)
          if (r) window.KitchensNotify.push(r.to, { type: 'comment', title: ctx.client ? 'Client commented' : 'New comment on a request', text: `${user}: ${text || '📎 attachment'}`.slice(0, 120), link: '#case/' + ctx.id }); }
        delete pending[bid];
        return done();
      }
    }
  });

  /* value edits: saved on `change` (blur/enter) without redrawing, so typing is never interrupted */
  document.addEventListener('change', async e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.in || !onCase()) return;
    const d = t.dataset;
    switch (d.in) {
      case 'bk': mutate(c => { block(c, d.bid)[d.k] = t.value; }); if (d.k === 'offerId') redraw();
        if (d.k === 'assignee' && t.value) { // a measure was assigned: tell the employee
          const r = find(ctx.id), b = r && r.sub.case && r.sub.case.blocks.find(x => x.id === d.bid);
          window.KitchensNotify.push(t.value, { type: 'measure', title: 'Measure assigned to you', text: `${r ? r.sub.from.name : 'Client'}${b && b.date ? ' · ' + b.date : ''}`, link: '#tab/agents' });
        }
        break;
      case 'mf': mutate(c => { block(c, d.bid).measures.find(m => m.id === d.mid).fields.find(f => f.id === d.fid).value = t.value; }); break;
      case 'pr': mutate(c => { block(c, d.bid).items[+d.k][d.pk] = t.value; }); redraw(); break;
      case 'cm-files': {
        pending[d.bid] = [...t.files].map(f => f.name);
        document.querySelector(`[data-pend="${d.bid}"]`).textContent = pending[d.bid].length ? '📎 ' + pending[d.bid].join(', ') : '';
        break;
      }
      case 'm-files': {
        const names = [...t.files].map(f => f.name);
        mutate(c => block(c, d.bid).measures.find(m => m.id === d.mid).files.push(...names)); redraw();
        break;
      }
      case 'photo': {
        const imgs = (await Promise.all([...t.files].map(readPhoto))).filter(Boolean);
        if (imgs.length) { mutate(c => { const b = block(c, d.bid); (d.mid ? b.measures.find(m => m.id === d.mid) : b).photos.push(...imgs); }); redraw(); }
        break;
      }
    }
  });
})();
