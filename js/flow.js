/* "Flow" page — kanban over the production stages (Request → Offer → Measure → Design → Payment → Production → Assembly).
   Requests sent from the Request page land in the first stage ("Request") and can be moved along the pipeline.
   Demo orders sit in the later stages. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  let scope = 'mine'; // mine | all
  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const fmtDate = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const val = (fl, v) => fl.type === 'checkbox' ? (v ? 'Yes' : 'No') : (esc(v) || '—');

  const requests = () => window.KitchensRequest.all()
    .filter(r => scope === 'all' || r.to === K().getUser().name);

  const requestCard = ({ to, sub }, i, last) => `
    <div class="ticket req-ticket">
      <div><span class="pill ok">Request</span> <b>${esc(sub.from.name)}</b></div>
      <small>${esc(sub.from.contact)} · to ${esc(to)} · ${fmtDate(sub.at)}</small>
      <details><summary>Answers</summary>
        <dl>${sub.fields.map(fl => `<dt>${esc(fl.label)}</dt><dd>${val(fl, sub.values[fl.id])}</dd>`).join('')}</dl>
      </details>
      <div class="tk-actions">
        <button class="btn small" data-fl="move" data-to="${esc(to)}" data-id="${sub.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Previous stage">←</button>
        <button class="btn small" data-fl="move" data-to="${esc(to)}" data-id="${sub.id}" data-dir="1" ${i === last ? 'disabled' : ''} title="Next stage">→</button>
      </div>
    </div>`;

  window.KitchensPages.Flow = () => {
    const { STAGES, ORDERS, fmt } = K();
    const reqs = requests();
    const last = STAGES.length - 1;
    return `
    <h1>Flow</h1>
    <div class="section-head"><p class="sub" style="margin:0">Requests and orders moving through the stages. New requests arrive in “${esc(STAGES[0])}”.</p>
      <span class="seg">
        <button class="btn small ${scope === 'mine' ? 'primary' : ''}" data-fl="scope" data-v="mine">My requests</button>
        <button class="btn small ${scope === 'all' ? 'primary' : ''}" data-fl="scope" data-v="all">All requests</button>
      </span></div>
    <div class="kanban flow">${STAGES.map((s, i) => {
      const rs = reqs.filter(r => (r.sub.stage || 0) === i);
      const os = ORDERS.filter(o => o.stage === i);
      return `<div class="col"><h4>${esc(s)}<span>${rs.length + os.length}</span></h4>
        ${rs.sort((a, b) => b.sub.at - a.sub.at).map(r => requestCard(r, i, last)).join('')}
        ${os.map(o => `<div class="ticket"><b>#${o.id}</b> ${esc(o.client)}<small>${fmt(o.sum)} ₽</small></div>`).join('')}
        ${!rs.length && !os.length ? '<div class="empty">—</div>' : ''}
      </div>`;
    }).join('')}</div>`;
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-fl]');
    if (!el) return;
    if (el.dataset.fl === 'scope') { scope = el.dataset.v; K().render(); return; }
    if (el.dataset.fl === 'move') {
      const { to, id } = el.dataset;
      const cur = window.KitchensRequest.all().find(r => r.to === to && r.sub.id === id);
      if (!cur) return;
      const next = Math.min(K().STAGES.length - 1, Math.max(0, (cur.sub.stage || 0) + (+el.dataset.dir)));
      window.KitchensRequest.setStage(to, id, next);
      K().render();
    }
  });
})();
