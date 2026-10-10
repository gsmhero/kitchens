/* "Product Catalogue" — manage product types and products.
   A product TYPE is built on a form from the Forms tab: the form's fields become the specification fields
   of every product of that type (edit the form and all products of the type follow).
   Registered users manage Types and Products here; the public Catalogue page (#catalogue) shows published products.
   Prototype: stored in localStorage as { types[], products[] }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const FF = () => window.KitchensForms;
  const esc = s => FF().esc(s);
  const uid = () => FF().uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const redraw = () => K().render();
  const money = n => (n || n === 0) && n !== '' ? K().fmt(+n) + ' ₽' : 'Price on request';
  const MAX_PHOTOS = 4;

  /* ---------- data ---------- */
  let db;
  const persist = () => { if (!save('catalogue', db)) alert('Could not save: browser storage is full. Try fewer or smaller photos.'); };

  const seed = () => ({ types: [], products: [] });
  const init = () => { if (!db) { db = load('catalogue', null) || seed(); save('catalogue', db); } };

  // products as plain data for other pages (Price offers pick lines from here)
  window.KitchensCatalogue = {
    products: () => {
      init();
      return db.products.map(p => {
        const t = db.types.find(x => x.id === p.typeId);
        return { id: p.id, name: p.name, price: p.price, desc: p.desc, published: p.published, typeId: p.typeId, typeName: t ? t.name : '', author: p.author || '',
          photo: p.photos[0] || '', specs: t ? fieldsOf(t).filter(fl => p.values[fl.id] !== undefined && p.values[fl.id] !== '' && !(fl.type === 'checkbox' && !p.values[fl.id]))
            .map(fl => ({ label: fl.label, value: fl.type === 'checkbox' ? 'Yes' : String(p.values[fl.id]) })) : [] };
      });
    },
    types: () => { init(); return db.types.map(t => ({ id: t.id, name: t.name })); }
  };

  const formOf = t => FF().list().find(x => x.id === t.formId);
  // live fields from the form; falls back to the last known copy if the form was deleted
  const fieldsOf = t => { const fm = formOf(t); if (fm) { t.snapshot = fm.fields; return fm.fields; } return t.snapshot || []; };
  const typeOf = id => db.types.find(t => t.id === id);

  /* ---------- helpers ---------- */
  const shown = (fl, v) => fl.type === 'checkbox' ? (v ? 'Yes' : 'No') : (v === undefined || v === '' ? '—' : esc(v));
  const specs = (p, n) => { // list of filled spec fields of a product (n = max count)
    const t = typeOf(p.typeId); if (!t) return [];
    const out = fieldsOf(t).filter(fl => p.values[fl.id] !== undefined && p.values[fl.id] !== '' && !(fl.type === 'checkbox' && !p.values[fl.id]));
    return n ? out.slice(0, n) : out;
  };
  const thumb = p => p.photos.length ? `<img src="${p.photos[0]}" alt="">` : '<div class="no-photo"></div>';

  function fieldInput(fl, v) { // form field prefilled with a value
    const n = `name="f_${fl.id}"`, r = fl.required ? 'required' : '';
    switch (fl.type) {
      case 'textarea': return `<textarea ${n} ${r} rows="3">${esc(v)}</textarea>`;
      case 'select': return `<select ${n} ${r}><option value="">— choose —</option>${(fl.options || '').split(',').map(o => o.trim()).filter(Boolean).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      case 'checkbox': return `<input type="checkbox" ${n} ${v ? 'checked' : ''}>`;
      default: return `<input type="${fl.type}" ${n} ${r} value="${esc(v)}" ${fl.type === 'number' ? 'step="any"' : ''}>`;
    }
  }
  const fieldRows = (fields, values) => fields.map(fl => `<label class="${fl.type === 'checkbox' ? 'inline' : ''}"><span>${esc(fl.label)}${fl.required ? ' <b class="req">*</b>' : ''}</span>${fieldInput(fl, values[fl.id])}</label>`).join('')
    || '<p class="sub">The form of this type has no fields.</p>';

  /* ---------- state ---------- */
  let tab = 'products', query = '', typeF = '';
  let pubType = '', pubQuery = '';
  window.addEventListener('hashchange', () => { tab = 'products'; query = ''; typeF = ''; pubType = ''; pubQuery = ''; });

  /* ---------- manager page ---------- */
  function productsTable() {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = db.products
      .filter(p => !typeF || p.typeId === typeF)
      .filter(p => t.every(w => (p.name + ' ' + p.desc + ' ' + (typeOf(p.typeId) || { name: '' }).name).toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `<table><thead><tr><th></th><th>Product</th><th>Type</th><th class="num">Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr>
        <td class="p-thumb">${thumb(p)}</td>
        <td><b>${esc(p.name)}</b><br><small class="sub">${specs(p, 3).map(fl => `${esc(fl.label)}: ${shown(fl, p.values[fl.id])}`).join(' · ')}</small></td>
        <td>${esc((typeOf(p.typeId) || { name: '—' }).name)}</td>
        <td class="num">${money(p.price)}</td>
        <td><span class="pill ${p.published ? 'ok' : ''}">${p.published ? 'Published' : 'Draft'}</span></td>
        <td class="row-actions">
          <button class="btn small" data-pc="edit" data-id="${p.id}">Edit</button>
          <button class="btn small" data-pc="clone" data-id="${p.id}" title="Make a copy of this product">Clone</button>
          <button class="btn small" data-pc="toggle" data-id="${p.id}">${p.published ? 'Unpublish' : 'Publish'}</button>
          <button class="link danger-t" data-pc="del" data-id="${p.id}">delete</button></td></tr>`).join('') || `<tr><td colspan="6" class="sub">${db.products.length ? 'No products match.' : 'No products yet.'}</td></tr>`}
      </tbody></table>`;
  }

  function productsView() {
    return `
    <div class="kb-bar">
      <input type="search" id="pcSearch" placeholder="Search products…" value="${esc(query)}" autocomplete="off">
      <select id="pcType" aria-label="Type"><option value="">All types</option>${db.types.map(t => `<option value="${t.id}" ${t.id === typeF ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <button class="btn primary" data-pc="add" ${db.types.length ? '' : 'disabled title="Create a product type first"'}>+ Add product</button>
    </div>
    ${db.types.length ? '' : '<div class="notice">Create a product type first (Types tab): a type gives products their fields.</div>'}
    <div class="card"><div class="matrix-wrap" id="pcTable">${productsTable()}</div></div>`;
  }

  function typesView() {
    return `
    <p class="sub">A product type defines which fields its products have. Pick a form from the <a class="link" href="#tab/forms">Forms</a> tab and its fields are used automatically.</p>
    <div class="section-head"><h2>Product types <span class="count">${db.types.length}</span></h2>
      <button class="btn primary" data-pc="add-type">+ Add type</button></div>
    <div class="grid g3">
      ${db.types.map(t => {
        const fm = formOf(t), fields = fieldsOf(t), n = db.products.filter(p => p.typeId === t.id).length;
        return `<div class="card type-card">
          <h3>${esc(t.name)}</h3>
          <p class="sub">${esc(t.desc) || '&nbsp;'}</p>
          <div class="meta"><span class="pill">${n} ${n === 1 ? 'product' : 'products'}</span>
            ${fm ? `<span class="pill role">Form: ${esc(fm.name)}</span>` : '<span class="pill bad">Form deleted — using saved fields</span>'}</div>
          <div class="chips">${fields.map(fl => `<span class="chip">${esc(fl.label)}</span>`).join('') || '<span class="sub">No fields</span>'}</div>
          <div class="actions"><button class="btn small" data-pc="edit-type" data-id="${t.id}">Edit</button>
            <button class="btn small danger" data-pc="del-type" data-id="${t.id}">Delete</button></div>
        </div>`;
      }).join('') || '<div class="placeholder">No types yet. Click “Add type”.</div>'}
    </div>`;
  }

  window.KitchensPages['Product Catalogue'] = () => {
    init();
    return `
    <h1>Product Catalogue</h1>
    <p class="sub">Manage the products you sell and the types that describe them. Published products appear on the public <a class="link" href="#catalogue">Catalogue</a> page.</p>
    <div class="wh-tabs">
      ${[['products', `Products (${db.products.length})`], ['types', `Types (${db.types.length})`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-pc="tab" data-v="${k}">${l}</button>`).join('')}
    </div>
    ${tab === 'types' ? typesView() : productsView()}`;
  };

  // "by <author>" — a link to the author's public profile (edited in the About Us tab) when that profile exists
  const authorHtml = p => {
    if (!p.author) return '';
    const pr = window.KitchensProfiles.get(p.author);
    return `<div class="pub-author">by ${pr ? `<a class="link" href="${esc(window.KitchensProfiles.url(p.author))}">${esc(pr.name || p.author)}</a>` : esc(p.author)}</div>`;
  };

  /* ---------- public catalogue (#catalogue) ---------- */
  function publicList() {
    const t = pubQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const list = db.products.filter(p => p.published && (!pubType || p.typeId === pubType))
      .filter(p => t.every(w => (p.name + ' ' + p.desc + ' ' + (typeOf(p.typeId) || { name: '' }).name).toLowerCase().includes(w)));
    return list.map(p => `
      <article class="card pub-card" data-pc="view" data-id="${p.id}" tabindex="0">
        <div class="pub-img">${thumb(p)}</div>
        <b>${esc(p.name)}</b>
        <div class="sub">${esc((typeOf(p.typeId) || { name: '' }).name)}</div>
        ${authorHtml(p)}
        <div class="pub-specs">${specs(p, 3).map(fl => `<span class="chip">${esc(fl.label)}: ${shown(fl, p.values[fl.id])}</span>`).join('')}</div>
        <div class="pub-price">${money(p.price)}</div>
      </article>`).join('') || '<div class="placeholder">No products found.</div>';
  }

  window.KitchensPages.PublicCatalogue = () => {
    init();
    const used = db.types.filter(t => db.products.some(p => p.published && p.typeId === t.id));
    return `
    <h1>Catalogue</h1>
    <p class="sub">A selection of our work. Pick something you like and send us a <a class="link" href="#request">request</a> for a price offer.</p>
    <div class="kb-bar"><input type="search" id="pubSearch" placeholder="Search the catalogue…" value="${esc(pubQuery)}" autocomplete="off"></div>
    <div class="kb-tags">
      <button class="pill ${pubType ? '' : 'ok'}" data-pc="pub-type" data-t="">All</button>
      ${used.map(t => `<button class="pill ${pubType === t.id ? 'ok' : ''}" data-pc="pub-type" data-t="${t.id}">${esc(t.name)}</button>`).join('')}
    </div>
    <div class="grid g4" id="pubList">${publicList()}</div>`;
  };

  /* ---------- dialogs ---------- */
  function modal() {
    let m = document.getElementById('pcModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'pcModal'; document.body.appendChild(m); }
    return m;
  }

  function viewDialog(p) {
    const t = typeOf(p.typeId), m = modal();
    m.innerHTML = `<div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Product">
      <button type="button" class="close" data-close>×</button>
      <div class="pub-photos">${p.photos.map(src => `<img src="${src}" alt="">`).join('') || '<div class="pub-img"><div class="no-photo"></div></div>'}</div>
      <h3>${esc(p.name)}</h3>
      <p class="sub">${esc(t ? t.name : '')}</p>
      ${authorHtml(p).replace('<a ', '<a data-close ')}
      <p>${esc(p.desc)}</p>
      <dl class="answers">${(t ? fieldsOf(t) : []).map(fl => `<dt>${esc(fl.label)}</dt><dd>${shown(fl, p.values[fl.id])}</dd>`).join('')}</dl>
      <div class="pub-price">${money(p.price)}</div>
      <a class="btn primary wide" href="#request" data-close>Request a price offer</a>
    </div>`;
    m.hidden = false;
  }

  // people who can be a product's author: employees, profile owners, the current user and the current author
  const authors = current => [...new Set([...window.KitchensStaff.names(), ...window.KitchensProfiles.owners(), (K().getUser() || {}).name, current].filter(Boolean))].sort();

  let draftPhotos = [];
  const photosHtml = () => `<div class="p-photos">${draftPhotos.map((src, i) => `<div class="ph"><img src="${src}" alt=""><button type="button" class="x" data-pc="rm-photo" data-i="${i}" title="Remove">×</button></div>`).join('')}
    ${draftPhotos.length < MAX_PHOTOS ? `<label class="ph add" title="Add photo">+<input type="file" accept="image/*" multiple hidden data-pc-photo></label>` : ''}</div>`;

  function productDialog(p) {
    draftPhotos = p ? [...p.photos] : [];
    const type = p ? typeOf(p.typeId) : db.types[0];
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="pcProductForm" data-id="${p ? p.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${p ? 'Edit product' : 'Add product'}</h3>
      <div class="two"><label>Name<input name="name" required value="${p ? esc(p.name) : ''}"></label>
        <label>Price, ₽ <small class="sub">(empty = on request)</small><input name="price" type="number" min="0" step="any" value="${p ? esc(p.price) : ''}"></label></div>
      <label>Author <small class="sub">(shown on the catalogue with a link to the profile)</small><select name="author"><option value="">— none —</option>${authors(p ? p.author : '').map(n => `<option ${n === (p ? p.author : (K().getUser() || {}).name) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Type<select name="typeId" id="pcTypeSel" required>${db.types.map(t => `<option value="${t.id}" ${type && t.id === type.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label>Description<textarea name="desc" rows="2">${p ? esc(p.desc) : ''}</textarea></label>
      <fieldset class="loc-pick spec"><legend>Specification <small>(fields of the “${type ? esc(formOf(type) ? formOf(type).name : 'saved') : ''}” form)</small></legend>
        <div id="pcFields" class="fill">${fieldRows(type ? fieldsOf(type) : [], p ? p.values : {})}</div></fieldset>
      <div><span class="sub">Photos (max ${MAX_PHOTOS})</span><div id="pcPhotos">${photosHtml()}</div></div>
      <label class="inline pub-check"><input type="checkbox" name="published" ${!p || p.published ? 'checked' : ''}> Published on the public catalogue</label>
      <button class="btn primary wide">${p ? 'Save' : 'Add product'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  const readValues = form => { // current spec inputs of the product form: field id → value
    const out = {};
    form.querySelectorAll('#pcFields [name^="f_"]').forEach(el => { out[el.name.slice(2)] = el.type === 'checkbox' ? el.checked : el.value; });
    return out;
  };

  function typeDialog(t) {
    const forms = FF().list();
    const m = modal();
    const sel = t ? t.formId : (forms[0] || {}).id;
    m.innerHTML = `<form class="modal-card wide" id="pcTypeForm" data-id="${t ? t.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${t ? 'Edit product type' : 'Add product type'}</h3>
      <label>Type name<input name="name" required maxlength="60" value="${t ? esc(t.name) : ''}" placeholder="e.g. Kitchen set"></label>
      <label>Description<input name="desc" value="${t ? esc(t.desc) : ''}"></label>
      <label>Form <small class="sub">(its fields become the product fields)</small>
        <select name="formId" id="pcFormSel" required>${forms.length ? forms.map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)} — ${f.fields.length} fields</option>`).join('') : '<option value="">No forms available</option>'}</select></label>
      <div class="chips" id="pcFormFields">${formChips(forms.find(f => f.id === sel))}</div>
      <p class="hint">Need different fields? Create or edit a form in the <a class="link" href="#tab/forms" data-close>Forms</a> tab first. Changes to the form are picked up here automatically.</p>
      <button class="btn primary wide" ${forms.length ? '' : 'disabled'}>${t ? 'Save' : 'Create type'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }
  const formChips = fm => fm ? fm.fields.map(fl => `<span class="chip">${esc(fl.label)} <small>${esc(FF().TYPES[fl.type] || fl.type)}${fl.required ? ' *' : ''}</small></span>`).join('') || '<span class="sub">This form has no fields.</span>' : '';

  /* ---------- photos: downscaled so localStorage can hold them ---------- */
  const readPhoto = file => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const s = Math.min(1, 700 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.65));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    if (e.target.closest('a[href^="#"]')) return; // links (e.g. the author's profile) are not card clicks
    const el = e.target.closest('[data-pc]');
    if (!el || !db) return;
    const d = el.dataset, p = db.products.find(x => x.id === d.id), t = db.types.find(x => x.id === d.id);
    switch (d.pc) {
      case 'tab': tab = d.v; redraw(); break;
      case 'add': productDialog(null); break;
      case 'edit': productDialog(p); break;
      case 'clone': { // a copy (as a draft, not published) opens in the editor; photos and field values are copied
        const c = JSON.parse(JSON.stringify(p));
        c.id = uid(); c.name = c.name + ' (copy)'; c.published = false; c.at = Date.now();
        db.products.push(c); persist(); redraw(); productDialog(c); break;
      }
      case 'toggle': p.published = !p.published; persist(); redraw(); break;
      case 'del': if (confirm(`Delete product "${p.name}"?`)) { db.products = db.products.filter(x => x !== p); persist(); redraw(); } break;
      case 'add-type': typeDialog(null); break;
      case 'edit-type': typeDialog(t); break;
      case 'del-type': {
        const n = db.products.filter(x => x.typeId === t.id).length;
        if (n) { alert(`"${t.name}" is used by ${n} ${n === 1 ? 'product' : 'products'}. Delete or change those products first.`); break; }
        if (confirm(`Delete product type "${t.name}"?`)) { db.types = db.types.filter(x => x !== t); persist(); redraw(); }
        break;
      }
      case 'rm-photo': draftPhotos.splice(+d.i, 1); document.getElementById('pcPhotos').innerHTML = photosHtml(); break;
      case 'view': viewDialog(p); break;
      case 'pub-type': pubType = d.t; redraw(); break;
    }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.pub-card')) { e.preventDefault(); e.target.click(); }
  });

  // live search: only the list is redrawn so the box keeps focus
  document.addEventListener('input', e => {
    if (e.target.id === 'pcSearch') { query = e.target.value; document.getElementById('pcTable').innerHTML = productsTable(); }
    if (e.target.id === 'pubSearch') { pubQuery = e.target.value; document.getElementById('pubList').innerHTML = publicList(); }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'pcType') { typeF = t.value; document.getElementById('pcTable').innerHTML = productsTable(); }
    if (t.id === 'pcFormSel') document.getElementById('pcFormFields').innerHTML = formChips(FF().list().find(f => f.id === t.value));
    if (t.id === 'pcTypeSel') { // product type changed: rebuild the spec fields, keeping values of fields that exist in both forms
      const form = t.form, keep = readValues(form), type = typeOf(t.value), fm = formOf(type);
      document.getElementById('pcFields').innerHTML = fieldRows(fieldsOf(type), keep);
      form.querySelector('legend small').textContent = `(fields of the “${fm ? fm.name : 'saved'}” form)`;
    }
    if (t.hasAttribute && t.hasAttribute('data-pc-photo')) {
      const imgs = (await Promise.all([...t.files].map(readPhoto))).filter(Boolean);
      draftPhotos = [...draftPhotos, ...imgs].slice(0, MAX_PHOTOS);
      document.getElementById('pcPhotos').innerHTML = photosHtml();
    }
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id === 'pcTypeForm') {
      e.preventDefault();
      const name = f.elements.name.value.trim(), formId = f.elements.formId.value, id = f.dataset.id;
      if (db.types.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) { alert('A product type with this name already exists.'); return; }
      const fm = FF().list().find(x => x.id === formId);
      const rec = { name, desc: f.elements.desc.value.trim(), formId, snapshot: fm ? fm.fields : [] };
      if (id) Object.assign(typeOf(id), rec); else db.types.push({ id: uid(), ...rec });
      persist(); document.getElementById('pcModal').hidden = true; redraw();
    }
    if (f.id === 'pcProductForm') {
      e.preventDefault();
      const id = f.dataset.id, typeId = f.elements.typeId.value, price = f.elements.price.value;
      const rec = { name: f.elements.name.value.trim(), author: f.elements.author.value, typeId, price: price === '' ? '' : +price, desc: f.elements.desc.value.trim(), published: f.elements.published.checked, photos: draftPhotos, values: readValues(f) };
      if (id) Object.assign(db.products.find(x => x.id === id), rec); else db.products.push({ id: uid(), at: Date.now(), ...rec });
      persist(); document.getElementById('pcModal').hidden = true; redraw();
    }
  });
})();
