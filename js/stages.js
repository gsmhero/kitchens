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
    const stages = K().getStages(), arch = K().archiveStageId();
    return `
    <h1>Stages</h1>
    <p class="sub">The steps every request and order goes through, in this order. Changes are saved automatically and apply to the Flow tab and the Dashboard. The last stage, <b>Archive</b>, is special: requests moved there leave the Flow board and are kept in the <a class="link" href="#tab/archive">Archive</a> tab.</p>
    <div class="card">
      <ol class="stage-list">
        ${stages.map((s, i) => { const isA = s.id === arch; return `
          <li class="${isA ? 'is-archive' : ''}">
            <span class="num">${i + 1}</span>
            <input data-st="name" data-i="${i}" value="${esc(s.name)}" aria-label="Stage ${i + 1} name">
            <span class="pill">${usage(i)} items</span>
            ${i === 0 ? '<span class="pill ok">receives new requests</span>' : ''}
            ${isA ? '<span class="pill">📦 archive — not shown in Flow</span>' : `<span class="fld-btns">
              <button class="btn small" data-st="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="btn small" data-st="down" data-i="${i}" ${stages[i + 1] && stages[i + 1].id === arch ? 'disabled' : ''} title="Move down">↓</button>
              <button class="btn small danger" data-st="del" data-i="${i}" ${stages.length <= 2 ? 'disabled' : ''} title="Delete">×</button>
            </span>`}
          </li>`; }).join('')}
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
        if (stages[i].id === K().archiveStageId()) return; // the Archive stage cannot be deleted
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
  // "Archive" is reserved for the archive stage: another stage may not take that name
  const reserved = (stages, i, name) => stages[i].id !== K().archiveStageId() && name.trim().toLowerCase() === 'archive';
  document.addEventListener('input', e => {
    if (e.target.dataset.st !== 'name') return;
    const stages = K().getStages(), i = +e.target.dataset.i;
    if (reserved(stages, i, e.target.value)) { e.target.setCustomValidity('Archive is reserved'); e.target.title = 'The name “Archive” is reserved for the last stage'; return; }
    e.target.setCustomValidity(''); e.target.title = '';
    stages[i].name = e.target.value;
    K().setStages(stages);
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.st !== 'name') return;
    const stages = K().getStages(), i = +e.target.dataset.i;
    if (reserved(stages, i, e.target.value)) { alert('The name “Archive” is reserved for the last stage. Your other stages keep their names.'); redraw(); return; }
    if (e.target.value.trim()) return;
    stages[i].name = 'Stage ' + (i + 1);
    K().setStages(stages); redraw();
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'stageAdd') return;
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name) return;
    if (name.toLowerCase() === 'archive') { alert('The name “Archive” is reserved for the last stage.'); return; }
    const stages = K().getStages();
    stages.splice(stages.length - 1, 0, { id: uid(), name }); // new stages go before the Archive stage
    K().setStages(stages); redraw();
  });
})();
