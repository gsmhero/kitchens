/* Messages — one-to-one conversations between registered people (customers and employees).
   Text, images (shown inline, click to enlarge) and file attachments; unread counts (the ✉ badge in the header),
   "Seen" marks, deleting your own messages. Open it at #messages, or #messages/<person> for a conversation.
   Images are downscaled and files limited to 400 KB because the browser storage is small (~5 MB for the whole site).
   Prototype: stored in localStorage as { convs: { "<a>|<b>": { msgs[], readAt{} } } }; another browser tab (or another login in
   this browser) sees new messages at once through the storage event. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const uid = () => window.KitchensForms.uid();
  const me = () => (K() && K().getUser() || {}).name || '';
  const MAX_FILE = 400 * 1024, MAX_ATT = 6;

  /* ---------- data ---------- */
  const read = () => { try { return JSON.parse(localStorage.getItem('messages')) || { convs: {} }; } catch (e) { return { convs: {} }; } };
  const write = db => { try { localStorage.setItem('messages', JSON.stringify(db)); return true; } catch (e) { return false; } };
  const idOf = (a, b) => [a, b].sort((x, y) => x.localeCompare(y)).join('|');
  const otherOf = (id, name) => id.split('|').find(n => n !== name) || name;
  const mine = db => Object.entries(db.convs).filter(([id]) => id.split('|').includes(me()));

  const unreadIn = (conv, name) => conv.msgs.filter(m => m.from !== name && m.at > ((conv.readAt || {})[name] || 0)).length;
  const unread = () => mine(read()).reduce((a, [, c]) => a + unreadIn(c, me()), 0);

  // everybody a message can be sent to: registered users, employees and profile owners
  const people = () => {
    const names = new Set([...window.KitchensStaff.names(), ...window.KitchensProfiles.owners(), window.KitchensRoles.ownerName()]);
    names.delete(me());
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  };
  const info = name => { // "Employee · Designer" for staff, "User" for everyone else
    if (window.KitchensRoles.isOwner({ name })) return 'Owner';
    const rid = window.KitchensStaff.roleIdOf(name);
    if (!rid) return 'User';
    const r = window.KitchensRoles.list().find(x => x.id === rid);
    return 'Employee' + (r ? ' · ' + r.name : '');
  };
  const display = name => { const p = window.KitchensProfiles.get(name); return p && p.name ? p.name : name; };
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarOf = name => { const p = window.KitchensProfiles.get(name); return p && p.avatar ? `<img class="pf-avatar" src="${p.avatar}" alt="">` : `<span class="pf-avatar ph-av">${esc(initials(display(name)))}</span>`; };

  /* ---------- helpers ---------- */
  const fmtT = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === new Date(n - 864e5).toDateString() ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); };
  const sizeOf = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
  const linkify = escaped => escaped.replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const snippet = m => m.text ? m.text.slice(0, 50) : (m.atts.length ? '📎 ' + (m.atts[0].kind === 'image' ? 'Photo' : m.atts[0].name) : '');

  const readImage = (file, max, q) => new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
  const readFile = file => new Promise(res => { const fr = new FileReader(); fr.onerror = () => res(null); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });

  /* ---------- state ---------- */
  let active = '', draftText = '', pending = [], q = '';
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#messages')) { active = ''; pending = []; draftText = ''; q = ''; } });

  async function addFiles(files) {
    const bad = [];
    for (const f of files) {
      if (pending.length >= MAX_ATT) { bad.push(f.name + ' (max ' + MAX_ATT + ' attachments per message)'); continue; }
      if (f.type.startsWith('image/')) {
        const data = await readImage(f, 1000, 0.75);
        if (data) pending.push({ id: uid(), kind: 'image', name: f.name || 'photo.jpg', size: Math.round(data.length * 0.75), type: 'image/jpeg', data });
        else bad.push(f.name + ' (cannot read the image)');
      } else if (f.size > MAX_FILE) bad.push(`${f.name} (over ${sizeOf(MAX_FILE)})`);
      else { const data = await readFile(f); if (data) pending.push({ id: uid(), kind: 'file', name: f.name, size: f.size, type: f.type, data }); }
    }
    if (bad.length) alert('Not attached: ' + bad.join(', '));
    K().render();
  }

  /* ---------- rendering ---------- */
  function attHtml(m) {
    const imgs = m.atts.filter(a => a.kind === 'image'), files = m.atts.filter(a => a.kind !== 'image');
    return `${imgs.length ? `<div class="ms-imgs n${Math.min(imgs.length, 3)}">${imgs.map(a => `<button class="ms-img" data-ms="zoom" data-m="${m.id}" data-a="${a.id}" aria-label="Open photo"><img src="${a.data}" alt="${esc(a.name)}"></button>`).join('')}</div>` : ''}
      ${files.map(a => `<a class="ms-file" href="${a.data}" download="${esc(a.name)}">📄 <span>${esc(a.name)}</span> <small>${sizeOf(a.size)}</small></a>`).join('')}`;
  }

  function thread(db) {
    const conv = db.convs[idOf(me(), active)] || { msgs: [], readAt: {} };
    const other = conv.readAt[active] || 0;
    const lastMine = [...conv.msgs].reverse().find(m => m.from === me());
    let day = '';
    return conv.msgs.map(m => {
      const d = fmtDay(m.at), sep = d !== day ? `<div class="ms-day"><span>${d}</span></div>` : ''; day = d;
      const mineM = m.from === me();
      return `${sep}<div class="ms-row ${mineM ? 'mine' : ''}"><div class="ms-bubble">
        ${m.text ? `<div class="ms-text">${linkify(esc(m.text)).replace(/\n/g, '<br>')}</div>` : ''}${attHtml(m)}
        <div class="ms-meta">${fmtT(m.at)}${mineM && lastMine && lastMine.id === m.id ? (other >= m.at ? ' · ✓✓ Seen' : ' · ✓ Sent') : ''}
          ${mineM ? `<button class="x" data-ms="del" data-m="${m.id}" title="Delete this message">×</button>` : ''}</div></div></div>`;
    }).join('') || `<div class="placeholder">No messages yet. Say hello to ${esc(display(active))}.</div>`;
  }

  function sidebar(db) {
    const convs = mine(db).filter(([, c]) => c.msgs.length).map(([id, c]) => ({ name: otherOf(id, me()), last: c.msgs[c.msgs.length - 1], n: unreadIn(c, me()) })).sort((a, b) => b.last.at - a.last.at);
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    const open = new Set(convs.map(c => c.name));
    const matches = nm => t.every(w => (nm + ' ' + display(nm) + ' ' + info(nm)).toLowerCase().includes(w));
    const others = people().filter(nm => !open.has(nm) && matches(nm));
    const row = (name, last, n) => `<a class="ms-conv ${name === active ? 'on' : ''}" href="#messages/${encodeURIComponent(name)}">
      ${avatarOf(name)}<span class="ms-cinfo"><b>${esc(display(name))}</b><small>${last ? esc((last.from === me() ? 'You: ' : '') + snippet(last)) : esc(info(name))}</small></span>
      <span class="ms-ctail">${last ? `<small>${fmtT(last.at)}</small>` : ''}${n ? `<span class="badge">${n}</span>` : ''}</span></a>`;
    return `<input type="search" id="msSearch" placeholder="Search people…" value="${esc(q)}" autocomplete="off">
      ${convs.filter(c => matches(c.name)).map(c => row(c.name, c.last, c.n)).join('')}
      ${others.length ? `<div class="ms-h">${convs.length ? 'Start a new conversation' : 'People'}</div>${others.map(nm => row(nm, null, 0)).join('')}` : ''}
      ${!convs.length && !others.length ? '<p class="sub" style="padding:8px">Nobody found.</p>' : ''}`;
  }

  window.KitchensPages.Messages = arg => {
    const name = decodeURIComponent(String(arg || '').replace(/^\//, ''));
    if (name !== active) { active = name === me() ? '' : name; pending = []; draftText = ''; }
    const db = read();
    // opening a conversation marks its messages as read
    if (active) {
      const id = idOf(me(), active), c = db.convs[id];
      if (c && unreadIn(c, me())) { c.readAt = c.readAt || {}; c.readAt[me()] = Date.now(); write(db); setTimeout(() => window.KitchensNotify.renderBell(), 0); }
    }
    setTimeout(() => { const t = document.getElementById('msThread'); if (t) t.scrollTop = t.scrollHeight; }, 0);
    const exists = active && (people().includes(active) || (db.convs[idOf(me(), active)] || { msgs: [] }).msgs.length);
    return `
    <h1>Messages</h1>
    <div class="ms-layout">
      <aside class="card ms-side" id="msSide">${sidebar(db)}</aside>
      <section class="card ms-main">
        ${exists ? `
        <header class="ms-head">${avatarOf(active)}<div><b>${esc(display(active))}</b><br><small class="sub">${esc(info(active))}</small></div>
          ${window.KitchensProfiles.get(active) ? `<a class="btn small" href="${esc(window.KitchensProfiles.url(active))}">Profile</a>` : ''}</header>
        <div class="ms-thread" id="msThread">${thread(db)}</div>
        <form class="ms-composer" id="msForm">
          ${pending.length ? `<div class="ms-pending">${pending.map(a => a.kind === 'image' ? `<span class="ms-pimg"><img src="${a.data}" alt=""><button type="button" class="x" data-ms="unpend" data-a="${a.id}" title="Remove">×</button></span>` : `<span class="ms-pfile">📄 ${esc(a.name)} <small>${sizeOf(a.size)}</small><button type="button" class="x" data-ms="unpend" data-a="${a.id}" title="Remove">×</button></span>`).join('')}</div>` : ''}
          <div class="ms-input">
            <label class="btn" title="Attach photos or files (images are shrunk, files up to ${sizeOf(MAX_FILE)})">📎<input type="file" multiple hidden id="msFiles"></label>
            <textarea id="msInput" rows="1" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)">${esc(draftText)}</textarea>
            <button class="btn primary" id="msSend">Send</button>
          </div>
        </form>` : `<div class="placeholder" style="margin:auto">${active ? 'This person is not found.' : 'Choose a person on the left to start a conversation.'}</div>`}
      </section>
    </div>`;
  };

  /* ---------- sending ---------- */
  function send() {
    const text = draftText.trim();
    if (!active || (!text && !pending.length)) return;
    const db = read(), id = idOf(me(), active), conv = db.convs[id] || (db.convs[id] = { msgs: [], readAt: {} });
    const m = { id: uid(), from: me(), text, at: Date.now(), atts: pending };
    conv.msgs.push(m);
    conv.readAt[me()] = Date.now();
    if (!write(db)) { alert('Could not send: the browser storage is full. Remove some attachments or delete old messages.'); return; }
    draftText = ''; pending = [];
    K().render();
    const i = document.getElementById('msInput'); if (i) i.focus();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ms]');
    if (!el) return;
    const d = el.dataset;
    if (d.ms === 'unpend') { pending = pending.filter(a => a.id !== d.a); K().render(); }
    if (d.ms === 'del' && confirm('Delete this message?')) {
      const db = read(), c = db.convs[idOf(me(), active)];
      if (c) { c.msgs = c.msgs.filter(m => m.id !== d.m); write(db); K().render(); }
    }
    if (d.ms === 'zoom') {
      const m = (read().convs[idOf(me(), active)] || { msgs: [] }).msgs.find(x => x.id === d.m), a = m && m.atts.find(x => x.id === d.a);
      if (!a) return;
      let box = document.getElementById('prModal');
      if (!box) { box = document.createElement('div'); box.className = 'modal'; box.id = 'prModal'; document.body.appendChild(box); }
      box.innerHTML = `<div class="modal-card lightbox"><button type="button" class="close" data-close>×</button><img src="${a.data}" alt=""></div>`;
      box.hidden = false;
    }
  });

  document.addEventListener('submit', e => { if (e.target.id === 'msForm') { e.preventDefault(); send(); } });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'msInput') { draftText = t.value; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }
    if (t.id === 'msSearch') { q = t.value; document.getElementById('msSide').innerHTML = sidebar(read()); const s = document.getElementById('msSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'msInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'msFiles') { const files = [...e.target.files]; e.target.value = ''; addFiles(files); }
  });
  // paste an image from the clipboard / drop files onto the composer
  document.addEventListener('paste', e => {
    if (e.target.id !== 'msInput') return;
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('#msForm')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!(e.target.closest && e.target.closest('#msForm'))) return;
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  });

  // another browser tab wrote messages: update the badge, refresh an open conversation, toast for a new incoming message
  window.addEventListener('storage', e => {
    if (e.key !== 'messages' || !me()) return;
    let before = { convs: {} }, after = { convs: {} };
    try { before = JSON.parse(e.oldValue) || before; after = JSON.parse(e.newValue) || after; } catch (x) { /* ignore */ }
    const known = new Set(Object.values(before.convs).flatMap(c => c.msgs.map(m => m.id)));
    Object.entries(after.convs).filter(([id]) => id.split('|').includes(me())).forEach(([id, c]) => {
      c.msgs.filter(m => m.from !== me() && !known.has(m.id)).slice(-2).forEach(m => {
        if (!(location.hash.startsWith('#messages') && active === m.from)) window.KitchensNotify.toast('✉ ' + display(m.from) + ': ' + snippet(m), '#messages/' + encodeURIComponent(m.from));
      });
    });
    window.KitchensNotify.renderBell();
    if (location.hash.startsWith('#messages')) { const i = document.getElementById('msInput'), keep = i && document.activeElement === i; K().render(); if (keep) document.getElementById('msInput').focus(); }
  });

  window.KitchensMessages = { unread, people, info };
})();
