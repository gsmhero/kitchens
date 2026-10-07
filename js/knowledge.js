/* "Knowledge" page — a question & answer library for the team.
   Ask a question, add answers (the asker can mark one as accepted), browse the library and search it
   (all words must match in the title, details, tags or any answer; matches are highlighted).
   Prototype: stored in localStorage. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || 'Guest';
  const day = 86400000;
  const fmtD = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const seed = () => {
    const now = Date.now(), a = (text, author, ago) => ({ id: uid(), text, author, at: now - ago * day });
    const q = (title, body, tags, author, ago, answers, accepted) => ({ id: uid(), title, body, tags, author, at: now - ago * day, answers, accepted: accepted ? answers[0].id : null });
    return [
      q('What is the standard height of a kitchen countertop?', 'We are measuring a client who is about 175 cm tall. Is 85 cm still fine?', ['measure', 'ergonomics'], 'B. Jones', 6,
        [a('Standard is 85–90 cm. A simple rule: elbow height minus 10–15 cm. For 175 cm that is about 90 cm.', 'A. Smith', 5), a('Always ask who cooks most. Two cooks of different height: take the average or use a separate prep zone.', 'C. Brown', 4)], true),
      q('How do we calculate MDF sheet usage for a kitchen?', 'Is there a quick way to estimate sheets of 18 mm MDF before the detailed cut list is ready?', ['production', 'materials'], 'C. Brown', 12,
        [a('Rule of thumb: about 1 sheet per 0.6–0.7 linear metre of base cabinets, plus 15% for waste. Replace it with the real cut list as soon as it exists.', 'A. Smith', 10)], true),
      q('Which hinges do we use for heavy fridge-column doors?', 'The standard hinges sag on 2.2 m high doors.', ['assembly', 'hardware'], 'D. Davis', 3, [], false),
      q('How long should a price offer stay valid?', 'Material prices change often. What validity period do we put on offers?', ['offer', 'sales'], 'A. Smith', 20,
        [a('14 days. Say it clearly in the offer description, and re-issue if the client needs more time.', 'B. Jones', 18)], false)
    ];
  };

  let items;
  const init = () => { if (!items) items = load('knowledge', null) || seed(); };
  const persist = () => save('knowledge', items);

  /* view state */
  let view = { mode: 'list', id: null };
  let query = '', tag = '', sort = 'new';
  window.addEventListener('hashchange', () => { view = { mode: 'list', id: null }; query = ''; tag = ''; sort = 'new'; });

  /* ---------- search ---------- */
  const terms = () => query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = it => [it.title, it.body, it.tags.join(' '), ...it.answers.map(x => x.text)].join(' \n ').toLowerCase();
  const matches = it => terms().every(t => hay(it).includes(t));
  const hl = text => { // escape + highlight search terms
    const ts = terms();
    if (!ts.length) return esc(text);
    const re = new RegExp('(' + ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return String(text).split(re).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
  };
  const snippet = (text, n = 170) => text.length > n ? text.slice(0, n).trimEnd() + '…' : text;

  /* ---------- views ---------- */
  function resultsHtml() {
    let list = items.filter(matches).filter(it => !tag || it.tags.includes(tag));
    if (sort === 'unanswered') list = list.filter(it => !it.answers.length);
    list.sort(sort === 'popular' ? (a, b) => b.answers.length - a.answers.length || b.at - a.at : (a, b) => b.at - a.at);
    if (!list.length) return `<div class="placeholder">${items.length ? 'No questions match your search.' : 'No questions yet.'} <button class="link" data-kb="ask">Ask a question</button></div>`;
    const ts = terms();
    return list.map(it => {
      const inAnswer = ts.length && !ts.every(t => (it.title + ' ' + it.body + ' ' + it.tags.join(' ')).toLowerCase().includes(t))
        ? it.answers.find(x => ts.some(t => x.text.toLowerCase().includes(t))) : null;
      return `
      <article class="card kb-item" data-kb="open" data-id="${it.id}" tabindex="0">
        <div class="kb-count ${it.answers.length ? (it.accepted ? 'ok' : 'has') : ''}"><b>${it.answers.length}</b><small>${it.answers.length === 1 ? 'answer' : 'answers'}</small></div>
        <div class="kb-main">
          <h3>${hl(it.title)}</h3>
          <p class="sub">${hl(snippet(it.body))}</p>
          ${inAnswer ? `<p class="kb-hit"><b>In an answer:</b> ${hl(snippet(inAnswer.text, 140))}</p>` : ''}
          <div class="kb-meta">
            ${it.tags.map(t => `<span class="pill role">${hl(t)}</span>`).join('')}
            ${it.accepted ? '<span class="pill ok">✔ Answered</span>' : it.answers.length ? '' : '<span class="pill warn">Unanswered</span>'}
            <span class="sub">${esc(it.author)} · ${fmtD(it.at)}</span>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function listView() {
    const counts = {};
    items.forEach(it => it.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const tags = Object.keys(counts).sort();
    return `
    <h1>Knowledge</h1>
    <p class="sub">The team's question library. Search before you ask — someone may have answered already.</p>
    <div class="kb-bar">
      <input type="search" id="kbSearch" placeholder="Search questions, answers and tags…" value="${esc(query)}" autocomplete="off">
      <select id="kbSort" aria-label="Sort">
        <option value="new" ${sort === 'new' ? 'selected' : ''}>Newest</option>
        <option value="popular" ${sort === 'popular' ? 'selected' : ''}>Most answers</option>
        <option value="unanswered" ${sort === 'unanswered' ? 'selected' : ''}>Unanswered</option>
      </select>
      <button class="btn primary" data-kb="ask">+ Ask question</button>
    </div>
    <div class="kb-tags">
      <button class="pill ${tag ? '' : 'ok'}" data-kb="tag" data-t="">All (${items.length})</button>
      ${tags.map(t => `<button class="pill ${tag === t ? 'ok' : ''}" data-kb="tag" data-t="${esc(t)}">${esc(t)} (${counts[t]})</button>`).join('')}
    </div>
    <div id="kbResults" class="kb-list">${resultsHtml()}</div>`;
  }

  function detailView() {
    const it = items.find(x => x.id === view.id);
    if (!it) return '<h1>Question not found</h1><button class="link" data-kb="back">← Back to library</button>';
    const mine = it.author === me();
    const answers = [...it.answers].sort((a, b) => (b.id === it.accepted) - (a.id === it.accepted) || a.at - b.at);
    return `
    <button class="link back" data-kb="back">← Question library</button>
    <h1>${esc(it.title)}</h1>
    <div class="kb-meta">
      ${it.tags.map(t => `<span class="pill role">${esc(t)}</span>`).join('')}
      <span class="sub">Asked by ${esc(it.author)} · ${fmtD(it.at)}</span>
      ${mine ? `<button class="link" data-kb="edit" data-id="${it.id}">edit</button><button class="link danger-t" data-kb="del-q" data-id="${it.id}">delete</button>` : ''}
    </div>
    <div class="card kb-body">${esc(it.body).replace(/\n/g, '<br>') || '<span class="sub">No details.</span>'}</div>

    <h2 class="kb-h">${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}</h2>
    ${answers.map(a => `
      <div class="card kb-answer ${a.id === it.accepted ? 'accepted' : ''}">
        ${a.id === it.accepted ? '<span class="pill ok">✔ Accepted answer</span>' : ''}
        <div class="kb-text">${esc(a.text).replace(/\n/g, '<br>')}</div>
        <div class="kb-meta"><span class="sub">${esc(a.author)} · ${fmtD(a.at)}</span>
          ${mine ? `<button class="link" data-kb="accept" data-id="${it.id}" data-aid="${a.id}">${a.id === it.accepted ? 'unmark accepted' : 'mark as accepted'}</button>` : ''}
          ${mine || a.author === me() ? `<button class="link danger-t" data-kb="del-a" data-id="${it.id}" data-aid="${a.id}">delete</button>` : ''}</div>
      </div>`).join('') || '<div class="placeholder">No answers yet. Be the first to answer.</div>'}

    <form class="card fill kb-add" id="kbAnswerForm" data-id="${it.id}">
      <h3>Your answer</h3>
      <textarea name="text" rows="5" required placeholder="Write your answer…"></textarea>
      <div class="actions"><button class="btn primary">Post answer</button></div>
    </form>`;
  }

  window.KitchensPages.Knowledge = () => {
    init();
    if (view.mode === 'q' && !items.some(x => x.id === view.id)) view = { mode: 'list', id: null };
    return view.mode === 'q' ? detailView() : listView();
  };

  /* ---------- ask / edit dialog ---------- */
  function questionDialog(it) {
    let m = document.getElementById('kbModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'kbModal'; document.body.appendChild(m); }
    m.innerHTML = `<form class="modal-card wide" id="kbForm" data-id="${it ? it.id : ''}">
      <button type="button" class="close" data-close>×</button>
      <h3>${it ? 'Edit question' : 'Ask a question'}</h3>
      <label>Question<input name="title" required maxlength="200" value="${it ? esc(it.title) : ''}" placeholder="e.g. Which hinges for 2.2 m doors?"></label>
      <label>Details<textarea name="body" rows="5" placeholder="Add context that helps others answer">${it ? esc(it.body) : ''}</textarea></label>
      <label>Tags <small class="sub">comma separated</small><input name="tags" value="${it ? esc(it.tags.join(', ')) : ''}" placeholder="measure, hardware"></label>
      <button class="btn primary wide">${it ? 'Save' : 'Post question'}</button>
    </form>`;
    m.hidden = false;
    m.querySelector('input').focus();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-kb]');
    if (!el || !items) return;
    const d = el.dataset, it = items.find(x => x.id === d.id);
    switch (d.kb) {
      case 'ask': questionDialog(null); break;
      case 'edit': questionDialog(it); break;
      case 'open': view = { mode: 'q', id: d.id }; redraw(); window.scrollTo(0, 0); break;
      case 'back': view = { mode: 'list', id: null }; redraw(); break;
      case 'tag': tag = d.t; redraw(); break;
      case 'accept': it.accepted = it.accepted === d.aid ? null : d.aid; persist(); redraw(); break;
      case 'del-a': if (confirm('Delete this answer?')) { it.answers = it.answers.filter(a => a.id !== d.aid); if (it.accepted === d.aid) it.accepted = null; persist(); redraw(); } break;
      case 'del-q': if (confirm(`Delete "${it.title}" and its ${it.answers.length} answers?`)) { items = items.filter(x => x.id !== d.id); persist(); view = { mode: 'list', id: null }; redraw(); } break;
    }
  });
  // cards are also keyboard-openable
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.kb-item')) { e.preventDefault(); e.target.click(); }
  });

  // live search: only the results list is redrawn, so the search box keeps focus while typing
  document.addEventListener('input', e => {
    if (e.target.id !== 'kbSearch') return;
    query = e.target.value;
    document.getElementById('kbResults').innerHTML = resultsHtml();
  });
  document.addEventListener('change', e => { if (e.target.id === 'kbSort') { sort = e.target.value; redraw(); } });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id === 'kbForm') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const tags = [...new Set(d.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))];
      if (f.dataset.id) Object.assign(items.find(x => x.id === f.dataset.id), { title: d.title.trim(), body: d.body.trim(), tags });
      else { const it = { id: uid(), title: d.title.trim(), body: d.body.trim(), tags, author: me(), at: Date.now(), answers: [], accepted: null }; items.push(it); view = { mode: 'q', id: it.id }; }
      persist(); document.getElementById('kbModal').hidden = true; redraw(); window.scrollTo(0, 0);
    }
    if (f.id === 'kbAnswerForm') {
      e.preventDefault();
      const text = f.elements.text.value.trim();
      if (!text) return;
      items.find(x => x.id === f.dataset.id).answers.push({ id: uid(), text, author: me(), at: Date.now() });
      persist(); redraw();
    }
  });
})();
