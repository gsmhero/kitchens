/* "Staff" page — employees with a role and a branch; invite new employees by a link sent by email.
   Invitation flow: add employee (name, email, role, branch) → invitation link (#invite/<token>) is offered to send
   by email (opens the mail app via mailto:) or copy → the employee opens it, sets a password and joins with that role.
   Prototype: stored in localStorage, so a link only works in the browser where it was created. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => K().render();

  const DEFAULT = () => [
    { id: 'e1', name: 'A. Smith', email: 'a.smith@example.com', roleId: 'r2', branchId: 'b1', status: 'active' },
    { id: 'e2', name: 'B. Jones', email: 'b.jones@example.com', roleId: 'r3', branchId: 'b1', status: 'active' },
    { id: 'e3', name: 'C. Brown', email: 'c.brown@example.com', roleId: 'r4', branchId: 'b2', status: 'active' },
    { id: 'e4', name: 'D. Davis', email: 'd.davis@example.com', roleId: 'r5', branchId: 'b2', status: 'active' }
  ];
  let staff;
  const init = () => { if (!staff) staff = load('staff', null) || DEFAULT(); };
  const persist = () => save('staff', staff);

  window.KitchensStaff = {
    roleIdOf: name => { init(); const e = staff.find(x => x.status === 'active' && x.name.toLowerCase() === String(name).toLowerCase()); return e ? e.roleId : ''; },
    countBy: (key, id) => { init(); return staff.filter(e => e[key] === id).length; }
  };

  const roleName = id => (window.KitchensRoles.list().find(r => r.id === id) || {}).name || '—';
  const branchName = id => (window.KitchensBranches.list().find(b => b.id === id) || {}).name || '—';
  const inviteUrl = e => location.href.split('#')[0] + '#invite/' + e.token;

  const options = (list, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') +
    list.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  /* ---------- Staff page ---------- */
  window.KitchensPages.Staff = () => {
    init();
    const roles = window.KitchensRoles.list(), branches = window.KitchensBranches.list();
    return `
    <h1>Staff</h1>
    <p class="sub">Add employees, choose their role and branch, and send them an invitation link by email.</p>
    <div class="section-head"><h2>Employees <span class="count">${staff.length}</span></h2>
      <button class="btn primary" data-sf="add">+ Add employee</button></div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
      <tbody>${staff.map(e => `<tr>
        <td><b>${esc(e.name)}</b></td>
        <td>${esc(e.email)}</td>
        <td><select class="perm" data-sf-field="roleId" data-id="${e.id}">${options(roles, e.roleId, '—')}</select></td>
        <td><select class="perm" data-sf-field="branchId" data-id="${e.id}">${options(branches, e.branchId, '—')}</select></td>
        <td><span class="pill ${e.status === 'active' ? 'ok' : 'warn'}">${e.status === 'active' ? 'Active' : 'Invited'}</span></td>
        <td class="row-actions">
          ${e.status === 'active' ? '' : `<button class="btn small" data-sf="invite" data-id="${e.id}">Send invitation</button>`}
          <button class="btn small" data-sf="edit" data-id="${e.id}">Edit</button>
          <button class="link danger-t" data-sf="remove" data-id="${e.id}">remove</button>
        </td></tr>`).join('') || '<tr><td colspan="6" class="sub">No employees yet.</td></tr>'}</tbody>
    </table></div></div>`;
  };

  /* ---------- Dialog ---------- */
  function modal() {
    let m = document.getElementById('staffModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'staffModal'; document.body.appendChild(m); }
    return m;
  }

  function formDialog(e) {
    const roles = window.KitchensRoles.list(), branches = window.KitchensBranches.list();
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="staffForm" data-id="${e ? e.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${e ? 'Edit employee' : 'Add employee'}</h3>
      <label>Name<input name="name" required value="${e ? esc(e.name) : ''}"></label>
      <label>Email<input name="email" type="email" required value="${e ? esc(e.email) : ''}" placeholder="name@company.com"></label>
      <label>Role<select name="roleId" required>${options(roles, e ? e.roleId : '', 'Select role…')}</select></label>
      <label>Branch<select name="branchId">${options(branches, e ? e.branchId : '', '—')}</select></label>
      <button class="btn primary wide">${e ? 'Save' : 'Add & create invitation'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  function inviteDialog(e) {
    const url = inviteUrl(e);
    const subject = 'Invitation to join Kitchens';
    const body = `Hello ${e.name},\n\nYou have been invited to join Kitchens as ${roleName(e.roleId)} (${branchName(e.branchId)}).\n\nAccept the invitation and set your password here:\n${url}\n`;
    const mailto = `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const m = modal();
    m.innerHTML = `<div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Invitation">
      <button type="button" class="close" data-close>×</button>
      <h3>Invitation for ${esc(e.name)}</h3>
      <p class="sub">Role: <b>${esc(roleName(e.roleId))}</b> · Branch: <b>${esc(branchName(e.branchId))}</b></p>
      <label class="stack">Invitation link
        <input readonly id="inviteUrl" value="${esc(url)}"></label>
      <div class="actions">
        <a class="btn primary" href="${esc(mailto)}">✉ Send by email to ${esc(e.email)}</a>
        <button type="button" class="btn" data-sf="copy">Copy link</button>
      </div>
      <p class="hint">“Send by email” opens your email app with the message ready to send. This prototype cannot send emails by itself, and the link only works in this browser until the site has a server.</p>
      <button type="button" class="btn wide" data-close>Done</button>
    </div>`;
    m.hidden = false;
  }

  /* ---------- Invitation page (employee side) ---------- */
  window.KitchensPages.Invite = token => {
    init();
    const e = staff.find(x => x.token === token);
    if (!e) return '<h1>Invitation not found</h1><div class="placeholder">This invitation link is not valid in this browser. Ask your manager to send a new one.</div>';
    if (e.status === 'active') return `<h1>Invitation already used</h1><div class="placeholder">This invitation has been accepted. Please <button class="link" data-open="loginModal">log in</button>.</div>`;
    return `
    <h1>Welcome to Kitchens</h1>
    <p class="sub">You have been invited as <b>${esc(roleName(e.roleId))}</b>${e.branchId ? ' · ' + esc(branchName(e.branchId)) : ''}. Choose a password to create your account.</p>
    <form class="card fill" id="inviteForm" data-token="${esc(token)}">
      <label><span>Your name</span><input name="name" required value="${esc(e.name)}"></label>
      <label><span>Email</span><input value="${esc(e.email)}" disabled></label>
      <label><span>Password <b class="req">*</b></span><input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
      <div class="actions"><button class="btn primary">Accept invitation</button></div>
    </form>`;
  };

  /* ---------- Events ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-sf]');
    if (!el) return;
    const id = el.dataset.id, e = staff && staff.find(x => x.id === id);
    switch (el.dataset.sf) {
      case 'add': formDialog(null); break;
      case 'edit': formDialog(e); break;
      case 'invite': inviteDialog(e); break;
      case 'copy': {
        const input = document.getElementById('inviteUrl');
        const done = () => { el.textContent = 'Copied ✔'; setTimeout(() => { el.textContent = 'Copy link'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, () => { input.select(); });
        else { input.select(); document.execCommand('copy'); done(); }
        break;
      }
      case 'remove':
        if (confirm(`Remove ${e.name} from staff?`)) { staff = staff.filter(x => x.id !== id); persist(); redraw(); }
        break;
    }
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (!t.dataset || !t.dataset.sfField) return;
    const e = staff.find(x => x.id === t.dataset.id);
    e[t.dataset.sfField] = t.value;
    persist();
  });

  document.addEventListener('submit', ev => {
    const form = ev.target;
    if (form.id === 'staffForm') {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      d.name = d.name.trim(); d.email = d.email.trim();
      const id = form.dataset.id;
      if (staff.some(x => x.id !== id && x.email.toLowerCase() === d.email.toLowerCase())) { alert('An employee with this email already exists.'); return; }
      if (id) {
        Object.assign(staff.find(x => x.id === id), d);
        persist(); document.getElementById('staffModal').hidden = true; redraw();
      } else {
        const e = { id: uid(), status: 'invited', token: uid() + uid() + uid(), ...d };
        staff.push(e); persist(); redraw();
        inviteDialog(e);
      }
    }
    if (form.id === 'inviteForm') {
      ev.preventDefault();
      const e = staff.find(x => x.token === form.dataset.token);
      if (!e || e.status === 'active') return;
      e.name = form.elements.name.value.trim() || e.name;
      e.status = 'active'; e.joinedAt = Date.now();
      persist();
      K().login(e.name, e.roleId); // password is not stored: prototype has no real authentication
    }
  });
})();
