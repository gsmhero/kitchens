/* "Stages" page — add, rename, reorder and delete production stages. Saved automatically.
   The Flow tab and the Dashboard use this list; the first stage receives new requests. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => 's' + Math.random().toString(36).slice(2, 8);
  const redraw = () => K().render();

  // number of requests and demo orders currently in a stage
  const usage = i => {
    const inStage = ref => K().stageIndex(ref) === i;
    return window.KitchensRequest.all().filter(r => inStage(r.sub.stage)).length + K().ORDERS.filter(o => inStage(o.stage)).length;
  };

  window.KitchensPages.Stages = () => {
    const stages = K().getStages();
    return `
    <h1>Stages</h1>
    <p class="sub">The steps every request and order goes through, in this order. Changes are saved automatically and apply to the Flow tab and the Dashboard.</p>
    <div class="card">
      <ol class="stage-list">
        ${stages.map((s, i) => `
          <li>
            <span class="num">${i + 1}</span>
            <input data-st="name" data-i="${i}" value="${esc(s.name)}" aria-label="Stage ${i + 1} name">
            <span class="pill">${usage(i)} items</span>
            ${i === 0 ? '<span class="pill ok">receives new requests</span>' : ''}
            <span class="fld-btns">
              <button class="btn small" data-st="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="btn small" data-st="down" data-i="${i}" ${i === stages.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
              <button class="btn small danger" data-st="del" data-i="${i}" ${stages.length === 1 ? 'disabled' : ''} title="Delete">×</button>
            </span>
          </li>`).join('')}
      </ol>
      <form class="stage-add" id="stageAdd">
        <input name="name" placeholder="New stage name" required>
        <button class="btn primary">+ Add stage</button>
      </form>
      <div class="actions end"><button class="btn danger" data-st="reset">Reset to default stages</button></div>
      <p class="hint">Deleting a stage moves its items to the first stage. Renaming or reordering never loses items.</p>
    </div>`;
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-st]');
    if (!el || el.tagName === 'INPUT') return;
    const stages = K().getStages(), i = +el.dataset.i;
    switch (el.dataset.st) {
      case 'up': case 'down': {
        const j = el.dataset.st === 'up' ? i - 1 : i + 1;
        [stages[i], stages[j]] = [stages[j], stages[i]];
        K().setStages(stages); redraw();
        break;
      }
      case 'del': {
        const n = usage(i);
        if (n && !confirm(`Delete stage "${stages[i].name}"? Its ${n} items will move to the first stage.`)) return;
        stages.splice(i, 1); K().setStages(stages); redraw();
        break;
      }
      case 'reset':
        if (confirm('Reset stages to the default list?')) { K().setStages(K().defaultStages()); redraw(); }
        break;
    }
  });

  // rename: saved on every keystroke without redrawing (keeps focus); a blank name is replaced on blur
  document.addEventListener('input', e => {
    if (e.target.dataset.st !== 'name') return;
    const stages = K().getStages();
    stages[+e.target.dataset.i].name = e.target.value;
    K().setStages(stages);
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.st !== 'name' || e.target.value.trim()) return;
    const stages = K().getStages();
    stages[+e.target.dataset.i].name = 'Stage ' + (+e.target.dataset.i + 1);
    K().setStages(stages); redraw();
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'stageAdd') return;
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name) return;
    const stages = K().getStages();
    stages.push({ id: uid(), name });
    K().setStages(stages); redraw();
  });
})();
