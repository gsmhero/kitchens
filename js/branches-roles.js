/* "Branches and Roles" page — branches CRUD + role/permission matrix (saved in localStorage) */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const LEVELS = ['No access', 'View', 'Edit'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const modules = () => window.Kitchens.TABS.filter(t => t !== 'Branches and Roles');

  /* ---------- Data ---------- */
  const defaultBranches = () => [
    { id: 'b1', name: 'Head office', city: 'Moscow', address: 'Lenina st. 1', phone: '+7 000 000-00-01', manager: 'A. Smith', staff: 4 },
    { id: 'b2', name: 'Workshop', city: 'Moscow', address: 'Industrial pr. 12', phone: '+7 000 000-00-02', manager: 'C. Brown', staff: 9 },
    { id: 'b3', name: 'Showroom', city: 'Tver', address: 'Sovetskaya st. 7', phone: '+7 000 000-00-03', manager: 'B. Jones', staff: 3 }
  ];
  const level = (m, l) => Object.fromEntries(m.map(t => [t, typeof l === 'function' ? l(t) : l]));
  const defaultRoles = () => {
    const m = modules();
    const only = (list, lv = 2) => t => list.includes(t) ? lv : (t === 'Dashboard' ? 1 : 0);
    return [
      { id: 'r1', name: 'Owner', locked: true, users: 1, perms: level(m, 2) },
      { id: 'r2', name: 'Manager', users: 2, perms: level(m, t => ['Costs', 'Agents', 'Branches and Roles'].includes(t) ? 1 : 2) },
      { id: 'r3', name: 'Designer', users: 2, perms: level(m, only(['Flow', 'Forms', 'Product Catalogue', 'Price offers', 'Knowledge'])) },
      { id: 'r4', name: 'Carpenter', users: 6, perms: level(m, only(['Flow', 'Warehouse', 'Knowledge', 'ToDo'])) },
      { id: 'r5', name: 'Installer', users: 3, perms: level(m, only(['Flow', 'ToDo'], 1)) }
    ];
  };

  let branches, roles; // initialised lazily: window.Kitchens (TABS) is not ready when this file loads
  const init = () => {
    if (branches) return;
    branches = load('branches', null) || defaultBranches();
    roles = load('roles', null) || defaultRoles();
  };
  const persist = () => { save('branches', branches); save('roles', roles); };
  const redraw = () => window.Kitchens.render();

  /* roles API shared with other pages (the Forms editor assigns forms to roles and edits roles) */
  window.KitchensRoles = {
    list: () => { init(); return roles.map(r => ({ id: r.id, name: r.name, locked: !!r.locked })); },
    add: name => { init(); roles.push({ id: uid(), name, users: 0, perms: level(modules(), 0) }); persist(); },
    rename: (id, name) => { init(); const r = roles.find(x => x.id === id); if (r) { r.name = name; persist(); } },
    remove: id => { init(); const r = roles.find(x => x.id === id); if (r && !r.locked) { roles = roles.filter(x => x.id !== id); persist(); } }
  };

  /* ---------- Page ---------- */
  window.KitchensPages['Branches and Roles'] = () => {
    init();
    const mods = modules();
    return `
    <h1>Branches and Roles</h1>
    <p class="sub">Manage company branches and decide which sections each role can see or edit.</p>

    <div class="section-head"><h2>Branches <span class="count">${branches.length}</span></h2>
      <button class="btn primary" data-br="add-branch">+ Add branch</button></div>
    <div class="grid g3">
      ${branches.map(b => `
        <div class="card branch">
          <div class="branch-top"><h3>${esc(b.name)}</h3><span class="pill">${esc(b.staff)} staff</span></div>
          <dl>
            <dt>City</dt><dd>${esc(b.city)}</dd>
            <dt>Address</dt><dd>${esc(b.address)}</dd>
            <dt>Phone</dt><dd>${esc(b.phone)}</dd>
            <dt>Manager</dt><dd>${esc(b.manager)}</dd>
          </dl>
          <div class="actions">
            <button class="btn small" data-br="edit-branch" data-id="${b.id}">Edit</button>
            <button class="btn small danger" data-br="del-branch" data-id="${b.id}">Delete</button>
          </div>
        </div>`).join('') || '<div class="placeholder">No branches yet.</div>'}
    </div>

    <div class="section-head"><h2>Roles &amp; access <span class="count">${roles.length}</span></h2>
      <button class="btn primary" data-br="add-role">+ Add role</button></div>
    <div class="card">
      <div class="matrix-wrap"><table class="matrix">
        <thead><tr><th>Section</th>
          ${roles.map(r => `<th><div class="role-h">${esc(r.name)}${r.locked ? ' 🔒' : ''}</div>
            <small>${esc(r.users)} ${r.users === 1 ? 'user' : 'users'}</small>
            <div class="actions">
              <button class="link" data-br="edit-role" data-id="${r.id}">rename</button>
              ${r.locked ? '' : `<button class="link danger-t" data-br="del-role" data-id="${r.id}">delete</button>`}
            </div></th>`).join('')}
        </tr></thead>
        <tbody>
          ${mods.map(t => `<tr><td>${esc(t)}</td>
            ${roles.map(r => {
              const v = r.perms[t] || 0;
              return `<td><select class="perm lv${v}" data-role="${r.id}" data-tab="${esc(t)}" ${r.locked ? 'disabled' : ''}>
                ${LEVELS.map((l, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>`;
            }).join('')}</tr>`).join('')}
        </tbody>
      </table></div>
      <p class="hint">Changes are saved automatically in this browser. Owner always has full access.</p>
    </div>`;
  };

  /* ---------- Dialog ---------- */
  function dialog(title, fields, values, onSave) {
    let m = document.getElementById('brModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'brModal'; document.body.appendChild(m); }
    m.innerHTML = `<form class="modal-card"><button type="button" class="close" data-close>×</button>
      <h3>${esc(title)}</h3>
      ${fields.map(([k, label, req]) => `<label>${esc(label)}<input name="${k}" value="${esc(values[k] || '')}" ${req ? 'required' : ''}></label>`).join('')}
      <button class="btn primary wide">Save</button></form>`;
    m.hidden = false;
    m.querySelector('input').focus();
    m.querySelector('form').onsubmit = e => {
      e.preventDefault();
      onSave(Object.fromEntries(new FormData(e.target)));
      persist(); m.hidden = true; redraw();
    };
  }

  const BRANCH_FIELDS = [['name', 'Name', 1], ['city', 'City'], ['address', 'Address'], ['phone', 'Phone'], ['manager', 'Manager']];

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-br]');
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.br) {
      case 'add-branch':
        dialog('Add branch', BRANCH_FIELDS, {}, v => branches.push({ id: uid(), staff: 0, ...v }));
        break;
      case 'edit-branch': {
        const b = branches.find(x => x.id === id);
        dialog('Edit branch', BRANCH_FIELDS, b, v => Object.assign(b, v));
        break;
      }
      case 'del-branch': {
        const b = branches.find(x => x.id === id);
        if (confirm(`Delete branch "${b.name}"?`)) { branches = branches.filter(x => x.id !== id); persist(); redraw(); }
        break;
      }
      case 'add-role':
        dialog('Add role', [['name', 'Role name', 1]], {}, v => roles.push({ id: uid(), name: v.name, users: 0, perms: level(modules(), 0) }));
        break;
      case 'edit-role': {
        const r = roles.find(x => x.id === id);
        dialog('Rename role', [['name', 'Role name', 1]], r, v => { r.name = v.name; });
        break;
      }
      case 'del-role': {
        const r = roles.find(x => x.id === id);
        if (confirm(`Delete role "${r.name}"?`)) { roles = roles.filter(x => x.id !== id); persist(); redraw(); }
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const s = e.target.closest('select.perm');
    if (!s) return;
    const r = roles.find(x => x.id === s.dataset.role);
    r.perms[s.dataset.tab] = +s.value;
    s.className = 'perm lv' + s.value;
    persist();
  });
})();
