/* "Branches and Roles" page — branches CRUD + role/permission matrix, stored on the server (owner only) */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const LEVELS = ['No access', 'View', 'Edit'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // extra permission rows that are not tabs: "Edit" lets an employee add situation costs (they see only their own entries)
  const COSTS_SIT = 'Costs: add situational';
  const modules = () => [...window.Kitchens.TABS.filter(t => t !== 'Branches and Roles'), COSTS_SIT];
  const A = () => window.KitchensApi, S = () => A().state;
  const redraw = () => window.Kitchens.render();
  const fail = e => alert(e.message || e);

  window.KitchensBranches = { list: () => S().branches.map(b => ({ id: b.id, name: b.name })) };

  /* roles API shared with other pages (the Forms editor assigns forms to roles and edits roles) */
  const reloadRoles = () => A().load('roles', 'people', 'staff').then(redraw, fail);
  const KR = window.KitchensRoles = {
    list: () => S().roles.map(r => ({ id: r.id, name: r.name, locked: !!r.locked })),
    add: name => A().call('role_save', { name }).then(reloadRoles, fail),
    rename: (id, name) => A().call('role_save', { id, name }).then(reloadRoles, fail),
    remove: id => A().call('role_delete', { id }).then(reloadRoles, fail),
    // ---- who is who ----
    // The OWNER is the first person who registered on the site: full rights.
    // An EMPLOYEE is somebody with a role (given by accepting an invitation): the rights of that role.
    // Everybody else is a plain USER (a customer): no access to the internal tabs.
    ownerName: () => (S().people.find(p => p.isOwner) || {}).name || '',
    isOwner: user => !!user && (user.isOwner === true || (!!KR.ownerName() && user.name === KR.ownerName())),
    roleIdOf: user => {
      if (!user) return null;
      if (S().user && user.name === S().user.name) return S().user.roleId || null;
      const p = S().people.find(x => x.name.toLowerCase() === String(user.name).toLowerCase());
      return (p && p.roleId) || null;
    },
    isEmployee: user => KR.isOwner(user) || !!KR.roleIdOf(user),
    // access level (0 none, 1 view, 2 edit) of a user for a section / permission row. For the logged-in person this is
    // what the server computed (and enforces); for somebody else it is derived from their role.
    level: (user, key) => {
      if (!user) return 0;
      if (S().user && user.name === S().user.name) return S().levels[key] || 0;
      if (KR.isOwner(user)) return 2;
      const r = S().roles.find(x => x.id === KR.roleIdOf(user));
      return !r ? 0 : r.locked ? 2 : (r.perms[key] || 0);
    },
    // may this user open a tab? (About Us: any employee, to edit their own profile)
    canTab: (user, tab) => tab === 'About Us' ? KR.isEmployee(user) : tab === 'Branches and Roles' ? KR.isOwner(user) : KR.level(user, tab) >= 1,
    sitKey: COSTS_SIT
  };

  /* ---------- Page ---------- */
  window.KitchensPages['Branches and Roles'] = () => {
    const mods = modules(), branches = S().branches, roles = S().roles;
    const count = (key, id) => S().staff.filter(e => e[key] === id).length;
    return `
    <h1>Branches and Roles</h1>
    <p class="sub">Manage company branches and decide which sections each role can see or edit.</p>

    <div class="section-head"><h2>Branches <span class="count">${branches.length}</span></h2>
      <button class="btn primary" data-br="add-branch">+ Add branch</button></div>
    <div class="grid g3">
      ${branches.map(b => `
        <div class="card branch">
          <div class="branch-top"><h3>${esc(b.name)}</h3><span class="pill">${count('branch_id', b.id)} staff</span></div>
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
            <small>${(n => `${n} ${n === 1 ? 'user' : 'users'}`)(count('role_id', r.id))}</small>
            <div class="actions">
              ${r.locked ? '' : `<button class="link" data-br="edit-role" data-id="${r.id}">rename</button>
              <button class="link danger-t" data-br="del-role" data-id="${r.id}">delete</button>`}
            </div></th>`).join('')}
        </tr></thead>
        <tbody>
          ${mods.map(t => `<tr><td>${esc(t)}</td>
            ${roles.map(r => {
              const v = r.locked ? 2 : (r.perms[t] || 0);
              return `<td><select class="perm lv${v}" data-role="${r.id}" data-tab="${esc(t)}" ${r.locked ? 'disabled' : ''}>
                ${LEVELS.map((l, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>`;
            }).join('')}</tr>`).join('')}
        </tbody>
      </table></div>
      <p class="hint">Changes are saved on the server at once. Owner always has full access.
        <b>Costs</b>: View sees all costs, Edit also manages constant costs. <b>Costs: add situational</b>: Edit lets the role add situation costs (they see only their own entries unless they also have access to Costs).</p>
    </div>`;
  };

  /* ---------- Dialog ---------- */
  function dialog(title, fields, values, onSave) {
    let m = document.getElementById('brModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'brModal'; document.body.appendChild(m); }
    m.innerHTML = `<form class="modal-card"><button type="button" class="close" data-close>×</button>
      <h3>${esc(title)}</h3>
      ${fields.map(([k, label, req]) => `<label>${esc(label)}<input name="${k}" value="${esc(values[k] || '')}" ${req ? 'required' : ''}></label>`).join('')}
      <p class="hint err" id="brErr"></p>
      <button class="btn primary wide">Save</button></form>`;
    m.hidden = false;
    m.querySelector('input').focus();
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      try { await onSave(Object.fromEntries(new FormData(e.target))); m.hidden = true; redraw(); }
      catch (err) { document.getElementById('brErr').textContent = err.message; }
    };
  }

  const BRANCH_FIELDS = [['name', 'Name', 1], ['city', 'City'], ['address', 'Address'], ['phone', 'Phone'], ['manager', 'Manager']];
  const saveBranch = id => async v => { await A().call('branch_save', { id, ...v }); await A().load('branches'); };
  const saveRole = id => async v => { await A().call('role_save', { id, name: v.name }); await A().load('roles'); };

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-br]');
    if (!el) return;
    const id = +el.dataset.id;
    switch (el.dataset.br) {
      case 'add-branch': dialog('Add branch', BRANCH_FIELDS, {}, saveBranch(0)); break;
      case 'edit-branch': dialog('Edit branch', BRANCH_FIELDS, S().branches.find(x => x.id === id), saveBranch(id)); break;
      case 'del-branch': {
        const b = S().branches.find(x => x.id === id);
        if (confirm(`Delete branch "${b.name}"?`)) A().call('branch_delete', { id }).then(() => A().load('branches', 'staff')).then(redraw, fail);
        break;
      }
      case 'add-role': dialog('Add role', [['name', 'Role name', 1]], {}, saveRole(0)); break;
      case 'edit-role': dialog('Rename role', [['name', 'Role name', 1]], S().roles.find(x => x.id === id), saveRole(id)); break;
      case 'del-role': {
        const r = S().roles.find(x => x.id === id);
        if (confirm(`Delete role "${r.name}"?`)) KR.remove(id);
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const s = e.target.closest('select.perm');
    if (!s || !s.dataset.role) return; // (the Staff tab uses the same style class for its role / branch dropdowns)
    const r = S().roles.find(x => x.id === +s.dataset.role);
    if (!r) return;
    const lv = +s.value;
    s.className = 'perm lv' + lv;
    A().call('role_save', { id: r.id, name: r.name, perms: { [s.dataset.tab]: lv } })
      .then(() => { r.perms[s.dataset.tab] = lv; }, err => { alert(err.message); redraw(); });
  });
})();
