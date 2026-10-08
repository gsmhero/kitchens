/* "Staff" page — employees with a role and a branch; invite new employees by a link sent by email.
   Invitation flow: add employee (name, email, role, branch) → the server emails an invitation link (#invite/<token>)
   (the link is also shown to copy) → the employee opens it, sets a password and joins with that role. All data is on the server. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const A = () => window.KitchensApi, S = () => A().state;
  const esc = s => window.KitchensForms.esc(s);
  const redraw = () => K().render();
  const fail = e => alert(e.message || e);
  const reload = () => A().load('staff', 'people').then(redraw, fail);

  window.KitchensStaff = {
    // names of active employees (for assignee pickers)
    names: () => S().people.filter(p => !p.isOwner).map(p => p.name),
    roleIdOf: name => { const p = S().people.find(x => !x.isOwner && x.name.toLowerCase() === String(name).toLowerCase()); return p ? p.roleId : null; },
    countBy: (key, id) => S().staff.filter(e => e[key === 'roleId' ? 'role_id' : key === 'branchId' ? 'branch_id' : key] === id).length
  };

  const roleName = id => (window.KitchensRoles.list().find(r => r.id === id) || {}).name || '—';
  const branchName = id => (window.KitchensBranches.list().find(b => b.id === id) || {}).name || '—';
  const options = (list, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') +
    list.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  /* ---------- Staff page ---------- */
  window.KitchensPages.Staff = () => {
    const roles = window.KitchensRoles.list().filter(r => !r.locked), branches = window.KitchensBranches.list();
    const canEdit = window.KitchensRoles.level(K().getUser(), 'Staff') >= 2;
    const people = S().staff.filter(e => !e.is_owner);
    const owner = S().staff.find(e => e.is_owner);
    const invited = S().invitations;
    const dis = canEdit ? '' : 'disabled';
    return `
    <h1>Staff</h1>
    <p class="sub">Add employees, choose their role and branch, and send them an invitation link by email.</p>
    <div class="section-head"><h2>Employees <span class="count">${people.length + invited.length}</span></h2>
      ${canEdit ? '<button class="btn primary" data-sf="add">+ Add employee</button>' : ''}</div>
    <div class="card"><div class="matrix-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
      <tbody>
      ${owner ? `<tr><td><b>${esc(owner.name)}</b></td><td>${esc(owner.email)}</td><td>Owner</td><td>—</td><td><span class="pill ok">Active</span></td><td></td></tr>` : ''}
      ${people.map(e => `<tr>
        <td><b>${esc(e.name)}</b></td>
        <td>${esc(e.email)}</td>
        <td><select class="perm" data-sf-field="roleId" data-id="${e.id}" ${dis}>${options(roles, e.role_id, '—')}</select></td>
        <td><select class="perm" data-sf-field="branchId" data-id="${e.id}" ${dis}>${options(branches, e.branch_id, '—')}</select></td>
        <td><span class="pill ok">Active</span></td>
        <td class="row-actions">${canEdit ? `<button class="link danger-t" data-sf="remove" data-id="${e.id}">remove</button>` : ''}</td></tr>`).join('')}
      ${invited.map(i => `<tr>
        <td><b>${esc(i.name || '—')}</b></td>
        <td>${esc(i.email)}</td>
        <td>${esc(roleName(i.role_id))}</td>
        <td>${esc(i.branch_id ? branchName(i.branch_id) : '—')}</td>
        <td><span class="pill warn">Invited</span></td>
        <td class="row-actions">${canEdit ? `<button class="btn small" data-sf="resend" data-id="${i.id}">Send again</button>
          <button class="link danger-t" data-sf="cancel" data-id="${i.id}">cancel</button>` : ''}</td></tr>`).join('')}
      ${!people.length && !invited.length ? '<tr><td colspan="6" class="sub">No employees yet.</td></tr>' : ''}
      </tbody>
    </table></div></div>`;
  };

  /* ---------- Dialogs ---------- */
  function modal() {
    let m = document.getElementById('staffModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'staffModal'; document.body.appendChild(m); }
    return m;
  }

  function formDialog(i) {
    const roles = window.KitchensRoles.list().filter(r => !r.locked), branches = window.KitchensBranches.list();
    const m = modal();
    m.innerHTML = `<form class="modal-card wide" id="staffForm">
      <button type="button" class="close" data-close>×</button>
      <h3>Add employee</h3>
      <label>Name<input name="name" required value="${i ? esc(i.name) : ''}"></label>
      <label>Email<input name="email" type="email" required value="${i ? esc(i.email) : ''}" placeholder="name@company.com"></label>
      <label>Role<select name="roleId" required>${options(roles, i ? i.role_id : null, 'Select role…')}</select></label>
      <label>Branch<select name="branchId">${options(branches, i ? i.branch_id : null, '—')}</select></label>
      <p class="hint err" id="staffErr"></p>
      <button class="btn primary wide">Send invitation</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  function resultDialog(name, email, r) {
    const m = modal();
    m.innerHTML = `<div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Invitation">
      <button type="button" class="close" data-close>×</button>
      <h3>Invitation for ${esc(name || email)}</h3>
      <p class="sub">${r.emailed ? `✔ An email with the link was sent to <b>${esc(email)}</b>.`
        : `⚠ The email could not be sent (${esc(r.emailError)}). Copy the link below and send it yourself.`}</p>
      <label class="stack">Invitation link (valid for 14 days)
        <input readonly id="inviteUrl" value="${esc(r.link)}"></label>
      <div class="actions"><button type="button" class="btn" data-sf="copy">Copy link</button></div>
      <button type="button" class="btn wide" data-close>Done</button>
    </div>`;
    m.hidden = false;
  }

  /* ---------- Invitation page (employee side) ---------- */
  window.KitchensPages.Invite = token => {
    setTimeout(async () => {
      const host = document.getElementById('inviteHost');
      if (!host) return;
      try {
        const i = await A().call('invite_info', undefined, { t: token });
        host.innerHTML = `
        <h1>Welcome to Kitchens</h1>
        <p class="sub">You have been invited as <b>${esc(i.role_name)}</b>. By accepting you join the team as an <b>employee</b> with the rights of this role. Choose a password: next time you log in with your email and this password.</p>
        ${i.description || i.work_hours || i.requirements ? `<div class="card">
          ${i.description ? `<p><b>About the role</b><br>${esc(i.description).replace(/\n/g, '<br>')}</p>` : ''}
          ${i.work_hours ? `<p><b>Work hours</b><br>${esc(i.work_hours)}</p>` : ''}
          ${i.requirements ? `<p><b>Requirements</b><br>${esc(i.requirements).replace(/\n/g, '<br>')}</p>` : ''}</div>` : ''}
        <form class="card fill" id="inviteForm" data-token="${esc(token)}">
          <label><span>Your name</span><input name="name" required value="${esc(i.name)}"></label>
          <label><span>Email</span><input value="${esc(i.email)}" disabled></label>
          <label><span>Password <b class="req">*</b></span><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          <p class="hint" id="inviteErr" style="color:var(--bad)"></p>
          <div class="actions"><button class="btn primary">Accept invitation</button></div>
        </form>`;
      } catch (e) {
        host.innerHTML = '<h1>Invitation not found</h1><div class="placeholder">This invitation link is not valid any more (it may have been used or has expired). Ask your manager to send a new one.</div>';
      }
    }, 0);
    return '<div id="inviteHost"><p class="sub">Loading…</p></div>';
  };

  /* ---------- Events ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-sf]');
    if (!el) return;
    const id = +el.dataset.id;
    switch (el.dataset.sf) {
      case 'add': formDialog(null); break;
      case 'resend': {
        const i = S().invitations.find(x => x.id === id);
        el.disabled = true;
        A().call('invite', { name: i.name, email: i.email, roleId: i.role_id, branchId: i.branch_id }).then(r => { reload(); resultDialog(i.name, i.email, r); }, e => { el.disabled = false; fail(e); });
        break;
      }
      case 'cancel': if (confirm('Cancel this invitation?')) A().call('invite_cancel', { id }).then(reload, fail); break;
      case 'copy': {
        const input = document.getElementById('inviteUrl');
        const done = () => { el.textContent = 'Copied ✔'; setTimeout(() => { el.textContent = 'Copy link'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, () => { input.select(); });
        else { input.select(); document.execCommand('copy'); done(); }
        break;
      }
      case 'remove': {
        const e = S().staff.find(x => x.id === id);
        if (confirm(`Remove ${e.name} from staff? Their account will be deleted.`)) A().call('staff_delete', { id }).then(reload, fail);
        break;
      }
    }
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (!t.dataset || !t.dataset.sfField) return;
    const e = S().staff.find(x => x.id === +t.dataset.id);
    if (!e) return;
    const roleId = t.dataset.sfField === 'roleId' ? +t.value || null : e.role_id;
    const branchId = t.dataset.sfField === 'branchId' ? +t.value || null : e.branch_id;
    if (!roleId) { alert('An employee needs a role.'); redraw(); return; }
    A().call('staff_update', { id: e.id, roleId, branchId, status: 'active' }).then(reload, err => { fail(err); reload(); });
  });

  document.addEventListener('submit', async ev => {
    const form = ev.target;
    if (form.id === 'staffForm') {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(form)), btn = form.querySelector('button.primary');
      btn.disabled = true;
      try {
        const r = await A().call('invite', { name: d.name.trim(), email: d.email.trim(), roleId: +d.roleId, branchId: +d.branchId || null });
        await A().load('staff'); redraw();
        resultDialog(d.name, d.email, r);
      } catch (e) { document.getElementById('staffErr').textContent = e.message; btn.disabled = false; }
    }
    if (form.id === 'inviteForm') {
      ev.preventDefault();
      const err = document.getElementById('inviteErr');
      try {
        const s = await A().call('invite_accept', { token: form.dataset.token, name: form.elements.name.value.trim(), password: form.elements.password.value });
        await K().setSession(s);
      } catch (e) { err.textContent = e.message; }
    }
  });
})();
