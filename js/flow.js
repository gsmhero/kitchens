/* "Flow" page — kanban over the production stages (editable in the Stages tab; default order:
   Request → Offer → Measure → Design → Payment → Production → Assembly).
   Requests sent from the Request page land in the first stage and can be moved along the pipeline.
   Demo orders sit in the other stages. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  let scope = 'all'; // all | mine
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
      <button class="link" data-fl="answers" data-to="${esc(to)}" data-id="${sub.id}">Answers</button>
      <div class="tk-actions">
        <button class="btn small" data-fl="move" data-to="${esc(to)}" data-id="${sub.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Previous stage">←</button>
        <button class="btn small" data-fl="move" data-to="${esc(to)}" data-id="${sub.id}" data-dir="1" ${i === last ? 'disabled' : ''} title="Next stage">→</button>
      </div>
    </div>`;

  // popup dialog with the full request (closed by ×, a click outside, or Esc — handled in app.js)
  function showAnswers({ to, sub }) {
    let m = document.getElementById('flowModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'flowModal'; document.body.appendChild(m); }
    const stage = K().getStages()[K().stageIndex(sub.stage)].name;
    m.innerHTML = `<div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Request details">
      <button type="button" class="close" data-close>×</button>
      <h3>Request from ${esc(sub.from.name)}</h3>
      <div class="req-meta">
        <span class="pill">${esc(sub.from.contact)}</span>
        <span class="pill">${sub.from.guest ? 'guest' : 'registered user'}</span>
        <span class="pill ok">Stage: ${esc(stage)}</span>
      </div>
      <p class="sub">Sent to <b>${esc(to)}</b> · ${fmtDate(sub.at)}</p>
      <dl class="answers">${sub.fields.map(fl => `<dt>${esc(fl.label)}</dt><dd>${val(fl, sub.values[fl.id])}</dd>`).join('') || '<dd>No answers.</dd>'}</dl>
      <button type="button" class="btn wide" data-close>Close</button>
    </div>`;
    m.hidden = false;
  }

  window.KitchensPages.Flow = () => {
    const { ORDERS, fmt, stageIndex } = K();
    const stages = K().getStages();
    const reqs = requests();
    const last = stages.length - 1;
    return `
    <h1>Flow</h1>
    <div class="section-head"><p class="sub" style="margin:0">Requests and orders moving through the stages. New requests arrive in “${esc(stages[0].name)}”. Stages can be edited in the <a class="link" href="#tab/stages">Stages</a> tab.</p>
      <span class="seg">
        <button class="btn small ${scope === 'all' ? 'primary' : ''}" data-fl="scope" data-v="all">All requests</button>
        <button class="btn small ${scope === 'mine' ? 'primary' : ''}" data-fl="scope" data-v="mine">Sent to me</button>
      </span></div>
    <div class="kanban flow" style="grid-template-columns:repeat(${stages.length},minmax(210px,1fr))">${stages.map((s, i) => {
      const rs = reqs.filter(r => stageIndex(r.sub.stage) === i);
      const os = ORDERS.filter(o => stageIndex(o.stage) === i);
      return `<div class="col"><h4>${esc(s.name)}<span>${rs.length + os.length}</span></h4>
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
    if (el.dataset.fl === 'answers') {
      const r = window.KitchensRequest.all().find(x => x.to === el.dataset.to && x.sub.id === el.dataset.id);
      if (r) showAnswers(r);
      return;
    }
    if (el.dataset.fl === 'move') {
      const { to, id } = el.dataset;
      const cur = window.KitchensRequest.all().find(r => r.to === to && r.sub.id === id);
      if (!cur) return;
      const stages = K().getStages();
      const next = Math.min(stages.length - 1, Math.max(0, K().stageIndex(cur.sub.stage) + (+el.dataset.dir)));
      window.KitchensRequest.setStage(to, id, stages[next].id);
      K().render();
    }
  });
})();
