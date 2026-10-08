/* "ToDo" — advanced task manager.
   Board (drag & drop between To do / In progress / Done) and List views, quick add, filters (assignee, priority, tag,
   overdue, search), and tasks with description, assignee, priority, due date, tags, checklist, comments, a link to a
   request, and optional repetition (finishing a repeating task creates the next one).
   Permissions come from the roles table ("ToDo" row): Edit = full control; View = see everything, but an employee can
   still move their own tasks, tick their checklist and comment; No access = hidden.
   Prototype: stored in localStorage as { tasks[], counter }. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const redraw = () => K().render();
  const me = () => (K().getUser() || {}).name || '';
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const addMonth = iso => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); };
  const fmtD = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
  const fmtDT = t => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const noOf = n => 'T-' + String(n).padStart(4, '0');

  const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done' };
  const PRIO = { urgent: ['Urgent', 'bad'], high: ['High', 'warn'], normal: ['Normal', ''], low: ['Low', 'low'] };
  const PRIO_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
  const REPEAT = { none: 'Does not repeat', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };

  /* ---------- data ---------- */
  let db;
  const persist = () => save('tasks', db);

  function init() {
    if (db) return;
    db = load('tasks', null);
    if (db) return;
    db = { tasks: [], counter: 0 };
    const old = load('todo', null); // tasks of the first, very simple ToDo page: [[text, done], …]
    if (Array.isArray(old) && old.length) {
      old.forEach(t => db.tasks.push(mk({ title: String(t[0]), status: t[1] ? 'done' : 'todo', doneAt: t[1] ? Date.now() : 0 })));
    } else {
    }
    persist();
  }

  function mk(o) {
    return Object.assign({ id: uid(), no: noOf(++db.counter), title: '', desc: '', status: 'todo', priority: 'normal', assignee: '', due: '', tags: [], requestId: '', repeat: 'none',
      checklist: [], comments: [], createdBy: me() || 'System', at: Date.now(), doneAt: 0 }, o);
  }

  /* ---------- permissions ---------- */
  const lvl = () => window.KitchensRoles.level(K().getUser(), 'ToDo');
  const can = {
    full: () => lvl() >= 2,
    own: t => lvl() >= 1 && !!me() && t.assignee === me(),
    activity: t => can.full() || can.own(t) // move, checklist, comment
  };

  /* ---------- state ---------- */
  let view = 'board';
  let who = 'all', prioF = '', tagF = '', query = '', overdueOnly = false, hideDone = false;
  window.addEventListener('hashchange', () => { who = 'all'; prioF = ''; tagF = ''; query = ''; overdueOnly = false; hideDone = false; });

  const isOverdue = t => t.status !== 'done' && t.due && t.due < todayISO();
  const people = () => [...new Set([...window.KitchensStaff.names(), me(), ...db.tasks.map(t => t.assignee)].filter(Boolean))].sort();
  const initials = n => n ? n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  const reqLabel = id => { const r = window.KitchensRequest.all().find(x => x.sub.id === id); return r ? r.sub.from.name : ''; };

  const visible = () => {
    const t = query.toLowerCase().split(/\s+/).filter(Boolean);
    return db.tasks
      .filter(x => who === 'all' || (who === 'me' ? x.assignee === me() : who === 'none' ? !x.assignee : x.assignee === who))
      .filter(x => !prioF || x.priority === prioF)
      .filter(x => !tagF || x.tags.includes(tagF))
      .filter(x => !overdueOnly || isOverdue(x))
      .filter(x => !hideDone || x.status !== 'done')
      .filter(x => t.every(w => (x.title + ' ' + x.desc + ' ' + x.tags.join(' ') + ' ' + x.assignee + ' ' + x.no).toLowerCase().includes(w)));
  };
  const sortTasks = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || a.at - b.at;
  const byPrio = (a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || (a.due || '9999').localeCompare(b.due || '9999') || a.at - b.at;

  /* ---------- completing / recurrence ---------- */
  let notice = '';
  function setStatus(t, status) {
    if (t.status === status) return;
    const wasDone = t.status === 'done';
    t.status = status;
    t.doneAt = status === 'done' ? Date.now() : 0;
    if (status === 'done' && !wasDone && t.repeat !== 'none') { // repeating task: create the next one
      const base = t.due || todayISO();
      const next = mk({ title: t.title, desc: t.desc, priority: t.priority, assignee: t.assignee, tags: [...t.tags], requestId: t.requestId, repeat: t.repeat,
        due: t.repeat === 'daily' ? addDays(base, 1) : t.repeat === 'weekly' ? addDays(base, 7) : addMonth(base),
        checklist: t.checklist.map(c => ({ id: uid(), text: c.text, done: false })) });
      db.tasks.push(next);
      notice = `Next “${t.title}” was created for ${fmtD(next.due)}.`;
    }
  }

  /* ---------- views ---------- */
  const chips = t => t.tags.map(g => `<span class="chip">${esc(g)}</span>`).join('');
  const dueHtml = t => t.due ? `<span class="due ${isOverdue(t) ? 'late' : t.due === todayISO() && t.status !== 'done' ? 'today' : ''}">📅 ${fmtD(t.due)}</span>` : '';
  const prog = t => t.checklist.length ? `<span class="meta-i" title="Checklist">☑ ${t.checklist.filter(c => c.done).length}/${t.checklist.length}</span>` : '';

  function card(t) {
    const drag = can.activity(t);
    return `<div class="td-card p-${t.priority} ${t.status === 'done' ? 'is-done' : ''}" data-td="open" data-id="${t.id}" ${drag ? 'draggable="true"' : ''} tabindex="0">
      <div class="td-top"><small class="sub">${esc(t.no)}</small>${t.priority !== 'normal' ? `<span class="pill ${PRIO[t.priority][1]}">${PRIO[t.priority][0]}</span>` : ''}${t.repeat !== 'none' ? '<span class="meta-i" title="Repeats">🔁</span>' : ''}</div>
      <div class="td-title">${esc(t.title)}</div>
      ${t.tags.length ? `<div class="td-tags">${chips(t)}</div>` : ''}
      <div class="td-meta">${dueHtml(t)}${prog(t)}${t.comments.length ? `<span class="meta-i" title="Comments">💬 ${t.comments.length}</span>` : ''}${t.requestId && reqLabel(t.requestId) ? '<span class="meta-i" title="Linked request">🔗</span>' : ''}
        <span class="avatar sm" title="${esc(t.assignee) || 'Unassigned'}">${esc(initials(t.assignee))}</span></div>
    </div>`;
  }

  function boardHtml(list) {
    return `<div class="td-board">${Object.entries(STATUS).map(([k, label]) => {
      const col = list.filter(t => t.status === k).sort(byPrio);
      return `<div class="td-col" data-col="${k}"><h4>${label}<span>${col.length}</span></h4>
        <div class="td-drop" data-drop="${k}">${col.map(card).join('') || '<div class="empty">—</div>'}</div></div>`;
    }).join('')}</div>`;
  }

  function listHtml(list) {
    const rows = [...list].sort((a, b) => (a.status === 'done') - (b.status === 'done') || sortTasks(a, b));
    return `<div class="card"><div class="matrix-wrap"><table class="td-list"><thead><tr><th></th><th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th><th>Progress</th></tr></thead><tbody>
      ${rows.map(t => `<tr class="${t.status === 'done' ? 'is-done' : ''}">
        <td><input type="checkbox" data-td="check" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${can.activity(t) ? '' : 'disabled'} aria-label="Done"></td>
        <td><a class="link td-link" data-td="open" data-id="${t.id}"><b>${esc(t.title)}</b></a> ${t.repeat !== 'none' ? '🔁' : ''}<br><small class="sub">${esc(t.no)}</small> ${chips(t)}</td>
        <td>${t.assignee ? `<span class="avatar sm">${esc(initials(t.assignee))}</span> ${esc(t.assignee)}` : '<span class="sub">Unassigned</span>'}</td>
        <td><span class="pill ${PRIO[t.priority][1]}">${PRIO[t.priority][0]}</span></td>
        <td>${dueHtml(t) || '<span class="sub">—</span>'}</td>
        <td><span class="pill ${t.status === 'done' ? 'ok' : t.status === 'doing' ? 'warn' : ''}">${STATUS[t.status]}</span></td>
        <td>${prog(t) || '<span class="sub">—</span>'}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">No tasks match.</td></tr>'}
    </tbody></table></div></div>`;
  }

  const bodyHtml = () => { const list = visible(); return view === 'list' ? listHtml(list) : boardHtml(list); };

  // tasks as plain data for the dashboard report
  window.KitchensTodo = {
    list: () => { init(); return db.tasks.map(t => ({ id: t.id, no: t.no, title: t.title, status: t.status, priority: t.priority, assignee: t.assignee, due: t.due, doneAt: t.doneAt, at: t.at,
      overdue: isOverdue(t), checklistDone: t.checklist.filter(c => c.done).length, checklistTotal: t.checklist.length })); }
  };

  window.KitchensPages.ToDo = () => {
    init();
    if (lvl() < 1) return '<h1>ToDo</h1><div class="placeholder">Your role has no access to tasks. Ask the owner to change it in Branches and Roles.</div>';
    const open = db.tasks.filter(t => t.status !== 'done'), weekAgo = Date.now() - 7 * 86400000;
    const tags = [...new Set(db.tasks.flatMap(t => t.tags))].sort();
    const n = notice; notice = '';
    return `
    <h1>ToDo</h1>
    <p class="sub">Plan the work of the team: who does what, by when.${can.full() ? '' : ' You can move your own tasks, tick checklists and comment.'}</p>
    <div class="grid g4">
      <div class="card kpi"><div class="l">Open tasks</div><div class="n">${open.length}</div></div>
      <div class="card kpi"><div class="l">Overdue</div><div class="n ${open.some(isOverdue) ? 'down' : ''}">${open.filter(isOverdue).length}</div></div>
      <div class="card kpi"><div class="l">Due today</div><div class="n">${open.filter(t => t.due === todayISO()).length}</div></div>
      <div class="card kpi"><div class="l">Done this week</div><div class="n up">${db.tasks.filter(t => t.status === 'done' && t.doneAt > weekAgo).length}</div></div>
    </div>
    ${n ? `<div class="notice ok">${esc(n)}</div>` : ''}
    ${can.full() ? `<form class="td-quick" id="tdQuick"><input name="title" placeholder="Quick add: type a task and press Enter" maxlength="200" autocomplete="off"><button class="btn primary">+ Add</button><button type="button" class="btn" data-td="new">Advanced…</button></form>` : ''}
    <div class="kb-bar td-filters">
      <input type="search" id="tdSearch" placeholder="Search tasks…" value="${esc(query)}" autocomplete="off">
      <select id="tdWho" aria-label="Assignee"><option value="all">Everyone</option><option value="me" ${who === 'me' ? 'selected' : ''}>Assigned to me</option><option value="none" ${who === 'none' ? 'selected' : ''}>Unassigned</option>${people().map(p => `<option ${who === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select id="tdPrio" aria-label="Priority"><option value="">Any priority</option>${Object.entries(PRIO).map(([k, [l]]) => `<option value="${k}" ${prioF === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="tdTag" aria-label="Tag"><option value="">Any tag</option>${tags.map(g => `<option ${tagF === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <label class="inline-sel"><input type="checkbox" id="tdOver" ${overdueOnly ? 'checked' : ''}> Overdue</label>
      <label class="inline-sel"><input type="checkbox" id="tdHide" ${hideDone ? 'checked' : ''}> Hide done</label>
      <span class="seg"><button class="btn small ${view === 'board' ? 'primary' : ''}" data-td="view" data-v="board">Board</button><button class="btn small ${view === 'list' ? 'primary' : ''}" data-td="view" data-v="list">List</button></span>
    </div>
    <div id="tdBody">${bodyHtml()}</div>`;
  };

  /* ---------- task dialog ---------- */
  let draft = null, isNew = false;
  const modal = () => {
    let m = document.getElementById('tdModal');
    if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'tdModal'; document.body.appendChild(m); }
    return m;
  };
  const stored = () => db.tasks.find(x => x.id === draft.id);
  // checklist / comments are saved immediately on existing tasks; the other fields on "Save"
  const touch = fn => { fn(draft); if (!isNew) { const t = stored(); if (t) { fn(t); persist(); } } };

  function taskDialog(t) {
    isNew = !t;
    draft = t ? JSON.parse(JSON.stringify(t)) : mk({ assignee: who === 'me' ? me() : (['all', 'none'].includes(who) ? '' : who) });
    if (isNew) db.counter--; // the number is only reserved when the task is saved
    renderDialog();
    modal().hidden = false;
    const ti = modal().querySelector('[data-tf=title]'); if (ti && !ti.disabled) ti.focus();
  }

  function renderDialog() {
    const full = can.full() || isNew, act = full || can.own(draft), dis = f => (f ? '' : 'disabled');
    const m = modal();
    m.innerHTML = `<div class="modal-card wide td-dialog" role="dialog" aria-modal="true" aria-label="Task">
      <button type="button" class="close" data-close>×</button>
      <h3>${isNew ? 'New task' : esc(draft.no)}</h3>
      <label>Title<input data-tf="title" value="${esc(draft.title)}" maxlength="200" ${dis(full)}></label>
      <label>Description<textarea data-tf="desc" rows="3" ${dis(full)}>${esc(draft.desc)}</textarea></label>
      <div class="two">
        <label>Status<select data-tf="status" ${dis(act)}>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${draft.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Priority<select data-tf="priority" ${dis(full)}>${Object.entries(PRIO).map(([k, [l]]) => `<option value="${k}" ${draft.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Assignee<select data-tf="assignee" ${dis(full)}><option value="">Unassigned</option>${people().map(p => `<option ${draft.assignee === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        <label>Due date<input type="date" data-tf="due" value="${esc(draft.due)}" ${dis(full)}></label>
        <label>Repeat<select data-tf="repeat" ${dis(full)}>${Object.entries(REPEAT).map(([k, l]) => `<option value="${k}" ${draft.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Tags <small class="sub">comma separated</small><input data-tf="tags" value="${esc(draft.tags.join(', '))}" ${dis(full)}></label>
      </div>
      <label>Linked request <small class="sub">(optional)</small><select data-tf="requestId" ${dis(full)}><option value="">— none —</option>${window.KitchensRequest.all().map(r => `<option value="${r.sub.id}" ${draft.requestId === r.sub.id ? 'selected' : ''}>${esc(r.sub.from.name)} (to ${esc(r.to)})</option>`).join('')}</select></label>
      ${draft.requestId && reqLabel(draft.requestId) ? `<a class="link" href="#case/${esc(draft.requestId)}" data-close>Open the request</a>` : ''}

      <div class="td-sec"><h4>Checklist ${draft.checklist.length ? `<small class="sub">${draft.checklist.filter(c => c.done).length}/${draft.checklist.length}</small>` : ''}</h4>
        ${draft.checklist.map(c => `<div class="td-ck"><label class="inline"><input type="checkbox" data-td="ck" data-cid="${c.id}" ${c.done ? 'checked' : ''} ${dis(act)}> <span class="${c.done ? 'ck-done' : ''}">${esc(c.text)}</span></label>${full ? `<button class="x" data-td="ck-del" data-cid="${c.id}" title="Remove">×</button>` : ''}</div>`).join('')}
        ${full ? `<div class="inline-add"><input id="tdCkNew" placeholder="Add checklist item" maxlength="120"><button type="button" class="btn small" data-td="ck-add">+ Add</button></div>` : ''}
      </div>

      ${isNew ? '' : `<div class="td-sec"><h4>Comments <small class="sub">${draft.comments.length}</small></h4>
        ${draft.comments.map(c => `<div class="cm"><div class="cm-h"><b>${esc(c.user)}</b><small>${fmtDT(c.at)}</small></div><div class="cm-t">${esc(c.text)}</div></div>`).join('') || '<p class="sub">No comments yet.</p>'}
        ${act ? `<div class="cm-add"><input id="tdCmNew" placeholder="Write a comment…" maxlength="500"><button type="button" class="btn dark" data-td="cm-add">Send</button></div>` : ''}</div>`}

      ${isNew ? '' : `<p class="hint">Created by ${esc(draft.createdBy)} · ${fmtDT(draft.at)}${draft.doneAt ? ' · done ' + fmtDT(draft.doneAt) : ''}</p>`}
      <div class="actions end">
        ${act ? '<button type="button" class="btn primary" data-td="save">Save</button>' : ''}
        <button type="button" class="btn" data-close>${act ? 'Cancel' : 'Close'}</button>
        ${!isNew && full ? '<button type="button" class="btn danger push" data-td="del">Delete</button>' : ''}
      </div>
    </div>`;
  }

  /* ---------- events ---------- */
  const refreshBody = () => { document.getElementById('tdBody').innerHTML = bodyHtml(); };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-td]');
    if (!el || !db) return;
    const d = el.dataset, t = db.tasks.find(x => x.id === d.id);
    switch (d.td) {
      case 'view': view = d.v; redraw(); break;
      case 'new': if (can.full()) taskDialog(null); break;
      case 'open': if (!(e.target.closest('input'))) taskDialog(t); break;
      case 'check': if (can.activity(t)) { setStatus(t, el.checked ? 'done' : 'todo'); persist(); redraw(); } else el.checked = !el.checked; break;
      case 'ck': if (can.activity(draft)) { const done = el.checked; touch(x => { x.checklist.find(c => c.id === d.cid).done = done; }); renderDialog(); redraw(); } break;
      case 'ck-del': touch(x => { x.checklist = x.checklist.filter(c => c.id !== d.cid); }); renderDialog(); if (!isNew) redraw(); break;
      case 'ck-add': {
        const inp = document.getElementById('tdCkNew'), text = inp.value.trim();
        if (!text) { inp.focus(); break; }
        const item = { id: uid(), text, done: false };
        touch(x => { x.checklist.push({ ...item }); }); renderDialog(); if (!isNew) redraw();
        document.getElementById('tdCkNew').focus();
        break;
      }
      case 'cm-add': {
        const inp = document.getElementById('tdCmNew'), text = inp.value.trim();
        if (!text) { inp.focus(); break; }
        const c = { id: uid(), user: me() || 'Guest', text, at: Date.now() };
        touch(x => { x.comments.push({ ...c }); }); renderDialog(); redraw();
        document.getElementById('tdCmNew').focus();
        break;
      }
      case 'save': {
        if (!draft.title.trim()) { alert('Please enter a title.'); return; }
        draft.title = draft.title.trim();
        const prevAssignee = isNew ? '' : (stored() || {}).assignee || '';
        if (draft.assignee && draft.assignee !== prevAssignee) // tell the employee a task was assigned to them
          window.KitchensNotify.push(draft.assignee, { type: 'task', title: 'Task assigned to you', text: draft.title + (draft.due ? ' · due ' + fmtD(draft.due) : ''), link: '#tab/todo' });
        if (isNew) { draft.no = noOf(++db.counter); db.tasks.push(draft); }
        else {
          const t0 = stored(), keep = { checklist: t0.checklist, comments: t0.comments }, was = t0.status;
          Object.assign(t0, draft, keep, { status: was }); // checklist and comments are already saved
          if (draft.status !== was) setStatus(t0, draft.status);
        }
        if (isNew && draft.status === 'done') { draft.doneAt = Date.now(); }
        persist(); modal().hidden = true; redraw();
        break;
      }
      case 'del': if (confirm(`Delete task "${draft.title}"?`)) { db.tasks = db.tasks.filter(x => x.id !== draft.id); persist(); modal().hidden = true; redraw(); } break;
    }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.td-card')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Enter' && e.target.id === 'tdCkNew') { e.preventDefault(); document.querySelector('[data-td=ck-add]').click(); }
    if (e.key === 'Enter' && e.target.id === 'tdCmNew') { e.preventDefault(); document.querySelector('[data-td=cm-add]').click(); }
  });

  // filters: only the task area is redrawn, so the search box keeps focus
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'tdSearch') { query = t.value; refreshBody(); return; }
    if (t.dataset && t.dataset.tf && draft) {
      const k = t.dataset.tf;
      draft[k] = k === 'tags' ? [...new Set(t.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean))] : t.value;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'tdWho') { who = t.value; refreshBody(); }
    if (t.id === 'tdPrio') { prioF = t.value; refreshBody(); }
    if (t.id === 'tdTag') { tagF = t.value; refreshBody(); }
    if (t.id === 'tdOver') { overdueOnly = t.checked; refreshBody(); }
    if (t.id === 'tdHide') { hideDone = t.checked; refreshBody(); }
    if (t.dataset && t.dataset.tf && draft && t.tagName === 'SELECT') draft[t.dataset.tf] = t.value;
    if (t.dataset && t.dataset.tf === 'due' && draft) draft.due = t.value;
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'tdQuick') return;
    e.preventDefault();
    const inp = e.target.elements.title, title = inp.value.trim();
    if (!title || !can.full()) return;
    const assignee = who === 'me' ? me() : (['all', 'none'].includes(who) ? '' : who);
    db.tasks.push(mk({ title, assignee }));
    if (assignee) window.KitchensNotify.push(assignee, { type: 'task', title: 'Task assigned to you', text: title, link: '#tab/todo' });
    persist(); redraw();
    const n = document.querySelector('#tdQuick input'); if (n) n.focus();
  });

  /* drag & drop between board columns */
  let dragId = '';
  document.addEventListener('dragstart', e => {
    const c = e.target.closest && e.target.closest('.td-card');
    if (!c) return;
    dragId = c.dataset.id; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => c.classList.add('dragging'), 0);
  });
  document.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('.td-card'); if (c) c.classList.remove('dragging'); document.querySelectorAll('.td-drop.over').forEach(x => x.classList.remove('over')); });
  document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('.td-drop'); if (z && dragId) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('.td-drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const z = e.target.closest && e.target.closest('.td-drop');
    if (!z || !dragId) return;
    e.preventDefault();
    const t = db.tasks.find(x => x.id === dragId); dragId = '';
    if (t && can.activity(t)) { setStatus(t, z.dataset.drop); persist(); redraw(); }
  });
})();
