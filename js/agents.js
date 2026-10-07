/* "Agents" — a working page for field employees (measurers, installers) with two sections:
   1) Measures      the Measure blocks of cases that are assigned to me: fill in measurements, photos and files, then lock (Save)
   2) Situation costs  quick form to add the costs I incur on the job, and my own entries
   Permissions (roles table): "Agents" Edit = may fill measures (View = read only);
   "Costs: add situational" Edit = may add situation costs. Managers (Costs access) can also look at everybody's measures.
   Measures are stored inside the case (the same data the case page shows), costs in the Costs data. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const R = () => window.KitchensRequest;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || '';
  const lvl = key => window.KitchensRoles.level(K().getUser(), key);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'no date';
  const money = n => K().fmt(Math.round(n * 100) / 100) + ' ₽';
  const pad = n => String(n).padStart(3, '0');
  const DEFAULT_FIELDS = ['Length (mm)', 'Height (mm)', 'Depth (mm)', 'Protrusion (mm)', 'Window to door (mm)'];

  let tab = 'measures';
  let showAll = false;
  window.addEventListener('hashchange', () => { tab = 'measures'; showAll = false; });

  const access = () => ({ measures: lvl('Agents') >= 1, fill: lvl('Agents') >= 2, costs: window.KitchensCosts.canAdd(), manager: lvl('Costs') >= 1 });

  /* ---------- data helpers ---------- */
  const assigned = () => R().all().flatMap(({ to, sub }) =>
    ((sub.case && sub.case.blocks) || []).filter(b => b.type === 'measure' && b.assignee && (showAll || b.assignee === me())).map(block => ({ to, sub, block })));
  const blockStatus = b => !b.measures.length ? 'pending' : b.measures.every(m => m.locked) ? 'done' : 'progress';
  const STATUS = { pending: ['Not started', ''], progress: ['In progress', 'warn'], done: ['Measured', 'ok'] };
  const editable = b => lvl('Agents') >= 2 && (b.assignee === me() || lvl('Costs') >= 2);

  function mutate(to, sid, bid, fn) {
    const r = R().all().find(x => x.to === to && x.sub.id === sid);
    if (!r) return false;
    const sub = JSON.parse(JSON.stringify(r.sub));
    const block = sub.case.blocks.find(b => b.id === bid);
    fn(block);
    const ok = R().replace(to, sub);
    if (!ok) alert('Could not save: browser storage is full. Try fewer or smaller photos.');
    return ok;
  }

  const readPhoto = file => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  /* ---------- section 1: measures ---------- */
  function measureCard(it, m, i, ok) {
    const lock = !ok || m.locked, at = `data-to="${esc(it.to)}" data-sid="${it.sub.id}" data-bid="${it.block.id}" data-mid="${m.id}"`;
    return `
    <div class="mcard ag-measure">
      <div class="m-photos">
        ${m.photos.map((p, k) => `<div class="ph"><img src="${p}" alt="photo">${lock ? '' : `<button class="x" data-ag="rm-photo" ${at} data-k="${k}" title="Remove">×</button>`}</div>`).join('')}
        ${lock ? '' : `<label class="ph add" title="Add photo">+<input type="file" accept="image/*" capture="environment" multiple hidden data-ag-in="photo" ${at}></label>`}
        <div class="m-files">${m.files.map((f, k) => `<div>📎 ${esc(f)} ${lock ? '' : `<button class="link danger-t" data-ag="rm-file" ${at} data-k="${k}">remove</button>`}</div>`).join('')}
          ${lock ? '' : `<label class="link">+ attach file<input type="file" multiple hidden data-ag-in="files" ${at}></label>`}</div>
      </div>
      <div class="m-fields">
        ${m.fields.map(f => `<label>${esc(f.label)}${f.unit && !/\(/.test(f.label) ? ` (${esc(f.unit)})` : ''}
          <input data-ag-in="mf" ${at} data-fid="${f.id}" type="${f.type === 'text' ? 'text' : 'number'}" ${f.type === 'text' ? '' : 'inputmode="decimal" step="any"'} value="${esc(f.value)}" ${lock ? 'disabled' : ''}>
          ${lock ? '' : `<button class="x" data-ag="rm-field" ${at} data-fid="${f.id}" title="Remove field">×</button>`}</label>`).join('')}
        ${lock ? '' : `<div class="add-field">
          <input placeholder="Extra field" data-agf="${m.id}-name"><select data-agf="${m.id}-type"><option value="number">Number</option><option value="text">Text</option></select>
          <input placeholder="mm" data-agf="${m.id}-unit" class="narrow"><button class="btn dark" data-ag="add-field" ${at}>Add field</button></div>`}
      </div>
      <div class="m-side">
        ${ok ? `<button class="btn dark" data-ag="lock" ${at}>${m.locked ? 'Edit' : 'Save'}</button>` : ''}
        <div class="sub">ID: № ${pad(i + 1)}</div>
      </div>
    </div>`;
  }

  function measuresView() {
    const list = assigned().sort((a, b) => (a.block.date || '9999').localeCompare(b.block.date || '9999'));
    const a = access();
    return `
    <p class="sub">Measures assigned to ${showAll ? 'the team' : 'you'}. Fill in the dimensions on site, add photos, then press <b>Save</b> to lock the measure.</p>
    ${a.manager ? `<label class="inline-sel ag-all"><input type="checkbox" id="agAll" ${showAll ? 'checked' : ''}> Show everyone's measures</label>` : ''}
    ${list.map(it => {
      const b = it.block, st = STATUS[blockStatus(b)], ok = editable(b), late = b.date && b.date < todayISO() && blockStatus(b) !== 'done';
      const at = `data-to="${esc(it.to)}" data-sid="${it.sub.id}" data-bid="${b.id}"`;
      return `<section class="card ag-card">
        <div class="ag-head">
          <div><b>${esc(it.sub.from.name)}</b> <span class="sub">${esc(it.sub.from.contact)}</span><br><small class="sub">request to ${esc(it.to)}${showAll ? ' · assigned to <b>' + esc(b.assignee) + '</b>' : ''}</small></div>
          <div class="ag-badges"><span class="pill ${late ? 'bad' : ''}">📅 ${fmtD(b.date)}${late ? ' · late' : ''}</span><span class="pill ${st[1]}">${st[0]}</span>
            <a class="link" href="#case/${esc(it.sub.id)}">Open request</a></div>
        </div>
        ${b.measures.map((m, i) => measureCard(it, m, i, ok)).join('')}
        ${ok ? `<button class="btn ${b.measures.length ? '' : 'dark'}" data-ag="start" ${at}>${b.measures.length ? '+ Another measure' : 'Start measure'}</button>` : (b.measures.length ? '' : '<p class="sub">Not started yet.</p>')}
      </section>`;
    }).join('') || `<div class="placeholder">${showAll ? 'No measures are assigned to anyone yet.' : 'No measures are assigned to you.'}<br><small>A manager assigns a measure in a case: Measure block → Assign.</small></div>`}`;
  }

  /* ---------- section 2: situation costs ---------- */
  function costsView() {
    const mine = window.KitchensCosts.mine(), month = todayISO().slice(0, 7);
    const monthSum = mine.filter(e => e.date.slice(0, 7) === month).reduce((a, e) => a + e.amount, 0);
    const reqs = R().all(), mineIds = new Set(assigned().map(x => x.sub.id));
    const opt = r => `<option value="${r.sub.id}">${esc(r.sub.from.name)} (to ${esc(r.to)})</option>`;
    return `
    <p class="sub">Add what you spent on the job: materials, fuel, small repairs. Managers see these in <a class="link" href="#tab/costs">Costs</a>.</p>
    <form class="card ag-cost" id="agCostForm">
      <div class="two"><label>Date<input name="date" type="date" required value="${todayISO()}"></label>
        <label>Amount, ₽<input name="amount" type="number" inputmode="decimal" min="0.01" step="any" required placeholder="0"></label></div>
      <div class="two"><label>Category<input name="category" list="agCats" required placeholder="Materials, Transport…"><datalist id="agCats">${window.KitchensCosts.categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Related request <small class="sub">(optional)</small><select name="requestId"><option value="">— none —</option>
          ${reqs.some(r => mineIds.has(r.sub.id)) ? `<optgroup label="My measures">${reqs.filter(r => mineIds.has(r.sub.id)).map(opt).join('')}</optgroup>` : ''}
          <optgroup label="${reqs.some(r => mineIds.has(r.sub.id)) ? 'Other requests' : 'Requests'}">${reqs.filter(r => !mineIds.has(r.sub.id)).map(opt).join('')}</optgroup></select></label></div>
      <label>What was it for?<input name="description" required maxlength="200" placeholder="e.g. Fuel for delivery to the client"></label>
      <button class="btn primary">+ Add cost</button>
    </form>
    <div class="section-head"><h2>My situation costs <span class="count">this month: ${money(monthSum)}</span></h2></div>
    <div class="card"><div class="matrix-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${mine.map(e => `<tr><td>${new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td><td>${esc(e.description)}${e.requestId ? ' <span class="pill">request</span>' : ''}</td><td><span class="pill">${esc(e.category)}</span></td>
        <td class="num"><b>${money(e.amount)}</b></td><td class="row-actions"><button class="btn small" data-ag="edit-cost" data-id="${e.id}">Edit</button><button class="link danger-t" data-ag="del-cost" data-id="${e.id}">delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="sub">You have not added any costs yet.</td></tr>'}
    </tbody></table></div></div>`;
  }

  window.KitchensPages.Agents = () => {
    const a = access();
    if (!a.measures && !a.costs) return '<h1>Agents</h1><div class="placeholder">Your role has no access to this page. Ask the owner to change it in Branches and Roles.</div>';
    if (tab === 'measures' && !a.measures) tab = 'costs';
    if (tab === 'costs' && !a.costs) tab = 'measures';
    const n = a.measures ? assigned().filter(x => blockStatus(x.block) !== 'done').length : 0;
    const tabs = [a.measures && ['measures', `Measures${n ? ` (${n} to do)` : ''}`], a.costs && ['costs', 'Situation costs']].filter(Boolean);
    return `
    <h1>Agents</h1>
    <p class="sub">Your field work: fill in assigned measures and report the costs you incur.</p>
    ${tabs.length > 1 ? `<div class="wh-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-ag="tab" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    ${tab === 'costs' ? costsView() : measuresView()}`;
  };

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ag]');
    if (!el) return;
    const d = el.dataset, at = [d.to, d.sid, d.bid];
    const m = (b) => b.measures.find(x => x.id === d.mid);
    switch (d.ag) {
      case 'tab': tab = d.v; redraw(); break;
      case 'start': mutate(...at, b => b.measures.push({ id: uid(), photos: [], files: [], locked: false, fields: DEFAULT_FIELDS.map(label => ({ id: uid(), label, type: 'number', unit: 'mm', value: '' })) })); redraw(); break;
      case 'lock': mutate(...at, b => { m(b).locked = !m(b).locked; }); redraw(); break;
      case 'rm-photo': mutate(...at, b => m(b).photos.splice(+d.k, 1)); redraw(); break;
      case 'rm-file': mutate(...at, b => m(b).files.splice(+d.k, 1)); redraw(); break;
      case 'rm-field': mutate(...at, b => { m(b).fields = m(b).fields.filter(f => f.id !== d.fid); }); redraw(); break;
      case 'add-field': {
        const g = k => document.querySelector(`[data-agf="${d.mid}-${k}"]`), label = g('name').value.trim();
        if (!label) { g('name').focus(); break; }
        mutate(...at, b => m(b).fields.push({ id: uid(), label, type: g('type').value, unit: g('unit').value.trim(), value: '' })); redraw();
        break;
      }
      case 'edit-cost': window.KitchensCosts.edit(d.id); break;
      case 'del-cost': if (confirm('Delete this cost?') && window.KitchensCosts.remove(d.id)) redraw(); break;
    }
  });

  // measurements are saved when a field is left (change), without redrawing, so typing is never interrupted
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'agAll') { showAll = t.checked; redraw(); return; }
    if (!t.dataset || !t.dataset.agIn) return;
    const d = t.dataset, at = [d.to, d.sid, d.bid], m = b => b.measures.find(x => x.id === d.mid);
    if (d.agIn === 'mf') mutate(...at, b => { m(b).fields.find(f => f.id === d.fid).value = t.value; });
    if (d.agIn === 'files') { const names = [...t.files].map(f => f.name); mutate(...at, b => m(b).files.push(...names)); redraw(); }
    if (d.agIn === 'photo') {
      const imgs = (await Promise.all([...t.files].map(readPhoto))).filter(Boolean);
      if (imgs.length) { mutate(...at, b => m(b).photos.push(...imgs)); redraw(); }
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'agCostForm') return;
    e.preventDefault();
    const f = e.target.elements;
    const ok = window.KitchensCosts.add({ date: f.date.value, amount: f.amount.value, category: f.category.value.trim(), description: f.description.value.trim(), requestId: f.requestId.value });
    if (!ok) alert('You are not allowed to add situation costs.'); else redraw();
  });
})();
