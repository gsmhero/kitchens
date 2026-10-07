/* "Archive" — requests whose stage is "Archive". They are not shown on the Flow board any more.
   A request gets here from Flow ("📦 Archive" on its card) or by choosing the Archive stage on its case page.
   From here it can be opened, restored to a stage (by default the stage it came from) or deleted for good.
   Permissions (roles table, "Archive" row): View = look, Edit = restore and delete. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const money = n => K().fmt(Math.round(n)) + ' ₽';
  const fmtD = t => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const lvl = () => window.KitchensRoles.level(K().getUser(), 'Archive');

  let query = '', who = '';
  window.addEventListener('hashchange', () => { query = ''; who = ''; });

  const archived = () => window.KitchensRequest.all().filter(r => K().isArchive(r.sub.stage));
  const offerOf = sub => { // the offer that matters most for a request: accepted first, then the latest
    const list = window.KitchensOffers.list().filter(o => o.requestId === sub.id);
    return list.find(o => o.status === 'accepted') || list[0] || null;
  };

  function rowsHtml(list, edit) {
    const flow = K().flowStages();
    return list.map(({ to, sub }) => {
      const o = offerOf(sub), back = flow.some(s => s.id === sub.prevStage) ? sub.prevStage : flow[0].id;
      return `<tr>
        <td><b>${esc(sub.from.name)}</b><br><small class="sub">${esc(sub.from.contact)}</small></td>
        <td>${esc(to)}</td>
        <td>${fmtD(sub.at)}</td>
        <td>${fmtD(sub.archivedAt || sub.at)}</td>
        <td>${o ? `<b>${esc(o.no)}</b> <span class="pill ${o.statusClass}">${esc(o.statusLabel)}</span><br><small class="sub">${money(o.total)}</small>` : '<span class="sub">—</span>'}</td>
        <td class="row-actions">
          <a class="btn small" href="#case/${esc(sub.id)}">Open</a>
          ${edit ? `<select data-ar-to data-id="${sub.id}" aria-label="Restore to stage">${flow.map(s => `<option value="${esc(s.id)}" ${s.id === back ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
            <button class="btn small primary" data-ar="restore" data-to="${esc(to)}" data-id="${sub.id}">Restore</button>
            <button class="link danger-t" data-ar="del" data-to="${esc(to)}" data-id="${sub.id}">delete</button>` : ''}
        </td></tr>`;
    }).join('') || '<tr><td colspan="6" class="sub">Nothing found.</td></tr>';
  }

  const filtered = () => {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    return archived().filter(r => !who || r.to === who)
      .filter(r => { const o = offerOf(r.sub); return t.every(w => (r.sub.from.name + ' ' + r.sub.from.contact + ' ' + r.to + ' ' + (o ? o.no : '')).toLowerCase().includes(w)); })
      .sort((a, b) => (b.sub.archivedAt || b.sub.at) - (a.sub.archivedAt || a.sub.at));
  };

  window.KitchensPages.Archive = () => {
    if (lvl() < 1) return '<h1>Archive</h1><div class="placeholder">Your role has no access to the archive. Ask the owner to change it in Branches and Roles.</div>';
    const all = archived(), year = new Date().getFullYear();
    const won = all.map(r => offerOf(r.sub)).filter(o => o && o.status === 'accepted');
    const people = [...new Set(all.map(r => r.to))].sort();
    return `
    <h1>Archive</h1>
    <p class="sub">Requests in the “${esc((K().getStages().find(s => s.id === K().archiveStageId()) || {}).name || 'Archive')}” stage. They are no longer shown in <a class="link" href="#tab/flow">Flow</a>.</p>
    <div class="grid g4">
      <div class="card kpi"><div class="l">Archived requests</div><div class="n">${all.length}</div></div>
      <div class="card kpi"><div class="l">Archived this year</div><div class="n">${all.filter(r => new Date(r.sub.archivedAt || r.sub.at).getFullYear() === year).length}</div></div>
      <div class="card kpi"><div class="l">With an accepted offer</div><div class="n">${won.length}</div></div>
      <div class="card kpi"><div class="l">Value of accepted offers</div><div class="n">${money(won.reduce((a, o) => a + o.total, 0))}</div></div>
    </div>
    <div class="kb-bar">
      <input type="search" id="arSearch" placeholder="Search by client, contact, employee or offer number…" value="${esc(query)}" autocomplete="off">
      <select id="arWho" aria-label="Employee"><option value="">All employees</option>${people.map(p => `<option ${p === who ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </div>
    ${all.length ? `<div class="card"><div class="matrix-wrap"><table><thead><tr><th>Client</th><th>Sent to</th><th>Received</th><th>Archived</th><th>Offer</th><th></th></tr></thead>
      <tbody id="arRows">${rowsHtml(filtered(), lvl() >= 2)}</tbody></table></div></div>`
      : '<div class="placeholder">The archive is empty.<br><small>Use “📦 Archive” on a request card in Flow, or choose the Archive stage on the request page.</small></div>'}`;
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ar]');
    if (!el || lvl() < 2) return;
    const { to, id } = el.dataset;
    if (el.dataset.ar === 'restore') {
      const sel = document.querySelector(`[data-ar-to][data-id="${id}"]`);
      window.KitchensRequest.setStage(to, id, sel.value, 0);
      K().render();
    }
    if (el.dataset.ar === 'del') {
      const r = window.KitchensRequest.all().find(x => x.sub.id === id);
      if (r && confirm(`Delete the request from "${r.sub.from.name}" permanently? This cannot be undone.`)) { window.KitchensRequest.remove(to, id); K().render(); }
    }
  });

  // live search / filter: only the table rows are redrawn so the search box keeps focus
  const refresh = () => { document.getElementById('arRows').innerHTML = rowsHtml(filtered(), lvl() >= 2); };
  document.addEventListener('input', e => { if (e.target.id === 'arSearch') { query = e.target.value; refresh(); } });
  document.addEventListener('change', e => { if (e.target.id === 'arWho') { who = e.target.value; refresh(); } });
})();
