/* Keeps the data of the pages in the database instead of only in this browser.
   The pages keep using localStorage exactly as before (a fast local copy). This file sits underneath:
   - at start it loads from the server every document the person may read and puts it into localStorage (hydrate)
   - every change a page makes to such a document is sent to the server a moment later; the server MERGES it with what others changed
   - while the page is open it asks the server for changes made by other people; when it is calm (nothing being typed) the page reloads to show them
   Documents (keys): profiles blog catalogue forms formSubs stages offers costs tasks knowledge warehouse messages notifs:<name> request:<name>:form|subs */
(function () {
  'use strict';

  const MANAGED = k => /^(profiles|blog|catalogue|forms|formSubs|stages|offers|costs|tasks|knowledge|warehouse|messages)$/.test(k) || /^notifs:/.test(k) || /^request:.+:(form|subs)$/.test(k);
  const proto = Storage.prototype, rawSet = proto.setItem, rawRemove = proto.removeItem, rawGet = proto.getItem, rawKey = proto.key;
  const ls = window.localStorage;

  const base = {};          // what the server had when this browser last synced a document (the starting point of our changes)
  const dirty = new Set();  // documents changed here and not yet sent
  let maxRev = 0, timer = null, flushing = false, again = false, stale = false, lastInput = Date.now(), failures = 0;
  let enabled = false;      // switched on after the first hydrate

  /* ---------- little status badge ---------- */
  let badge;
  function say(text, bad) {
    if (!badge) {
      badge = document.createElement('div'); badge.id = 'syncState';
      badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;font:12px system-ui,sans-serif;padding:5px 10px;border-radius:14px;background:#2a2a2a;color:#fff;opacity:.9;display:none;max-width:70vw';
      document.body.appendChild(badge);
    }
    badge.textContent = text; badge.style.background = bad ? '#b3261e' : '#2a2a2a'; badge.style.display = text ? 'block' : 'none';
  }
  let hideTimer;
  const flash = text => { say(text, false); clearTimeout(hideTimer); hideTimer = setTimeout(() => say(''), 1800); };

  /* ---------- intercept writes of the pages ---------- */
  proto.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === ls && enabled && MANAGED(String(k))) { dirty.add(String(k)); schedule(); }
  };
  proto.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === ls && enabled && MANAGED(String(k))) { dirty.add(String(k)); schedule(); }
  };
  const silentSet = (k, v) => { rawSet.call(ls, k, v); };
  const silentRemove = k => { rawRemove.call(ls, k); };
  const managedKeys = () => { const out = []; for (let i = 0; i < ls.length; i++) { const k = rawKey.call(ls, i); if (k && MANAGED(k)) out.push(k); } return out; };

  const call = (action, data, query) => window.KitchensApi.call(action, data, query);

  /* ---------- load from the server ---------- */
  function apply(items, replace) {
    Object.entries(items).forEach(([k, it]) => {
      if (dirty.has(k)) return; // we have unsent changes of our own: they will be merged on the next send
      if (it.v === null) { silentRemove(k); base[k] = null; }
      else { silentSet(k, it.v); base[k] = it.v; }
    });
  }
  async function hydrate(user) {
    const local = {};
    managedKeys().forEach(k => { local[k] = rawGet.call(ls, k); });
    let res;
    try { res = await call('kv_load'); } catch (e) { enabled = true; say('⚠ No connection to the server: changes are not saved', true); return; }
    maxRev = res.rev || 0;
    const served = res.items || {};
    managedKeys().forEach(k => silentRemove(k)); // the local copy is replaced by the server's
    apply(served);
    // the owner's browser may hold data from before the site had a database: it is uploaded once
    if (user && user.isOwner) {
      Object.entries(local).forEach(([k, v]) => {
        if (!(k in served) || served[k].v === null) { silentSet(k, v); base[k] = null; dirty.add(k); }
      });
    }
    enabled = true;
    if (dirty.size) schedule();
  }
  // a client who opens the link of their request: that one request (and its offers) is made readable here
  async function shadowShare(id) {
    try {
      const r = await call('share_get', undefined, { id });
      const k = r.key;
      silentSet(k, JSON.stringify([r.sub])); base[k] = rawGet.call(ls, k);
      if (r.offers && r.offers.length && rawGet.call(ls, 'offers') === null) { silentSet('offers', JSON.stringify({ offers: r.offers, counter: 0 })); base.offers = null; }
    } catch (e) { /* the page shows "not found" */ }
  }

  /* ---------- send changes ---------- */
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 600); say('Saving…'); }
  async function flush(keepalive) {
    clearTimeout(timer);
    if (!dirty.size) return;
    if (flushing) { again = true; return; }
    flushing = true;
    const keys = [...dirty]; dirty.clear();
    const sent = Object.fromEntries(keys.map(k => [k, rawGet.call(ls, k)]));
    try {
      const api = window.KitchensApi;
      const res = await fetch('api/index.php?a=kv_save', {
        method: 'POST', credentials: 'same-origin', keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': api.state.csrf },
        body: JSON.stringify({ changes: keys.map(k => ({ k, base: base[k] === undefined ? null : base[k], v: sent[k] })) })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Server error (' + res.status + ')');
      let problem = '';
      (json.results || []).forEach(r => {
        if (!r.ok) { problem = r.error || 'not saved'; stale = true; return; }
        base[r.k] = sent[r.k];                     // the next change is measured from what we just sent
        maxRev = Math.max(maxRev, r.rev || 0);
        if (r.v === null && sent[r.k] !== null) return;   // a document this person may only add to, not read back (e.g. a visitor's request)
        if (r.v !== sent[r.k] && !same(r.v, sent[r.k]) && !dirty.has(r.k)) { // others changed it too: keep the merged copy
          if (r.v === null) silentRemove(r.k); else silentSet(r.k, r.v);
          stale = true;
        }
      });
      failures = 0;
      if (problem) say('⚠ Not saved: ' + problem, true); else flash('Saved ✓');
    } catch (e) {
      keys.forEach(k => dirty.add(k)); failures++;
      say('⚠ Not saved (' + e.message + '). Will retry…', true);
      clearTimeout(timer); timer = setTimeout(flush, Math.min(30000, 2000 * failures));
    }
    flushing = false;
    if (again) { again = false; schedule(); }
  }
  const same = (a, b) => { try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch (e) { return false; } };

  /* ---------- changes made by other people ---------- */
  async function poll() {
    if (!enabled || document.hidden || flushing || dirty.size) return;
    try {
      const res = await call('kv_poll', undefined, { since: maxRev });
      maxRev = Math.max(maxRev, res.rev || 0);
      const items = res.items || {};
      Object.entries(items).forEach(([k, it]) => {
        if (dirty.has(k)) return;
        const cur = rawGet.call(ls, k);
        if (it.v === null ? cur === null : same(cur, it.v)) { base[k] = it.v; return; }
        if (it.v === null) silentRemove(k); else silentSet(k, it.v);
        base[k] = it.v; stale = true;
      });
    } catch (e) { /* try again later */ }
    maybeReload();
  }
  const busy = () => {
    const a = document.activeElement;
    return dirty.size || flushing || document.querySelector('.modal:not([hidden])') ||
      (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || Date.now() - lastInput < 8000;
  };
  function maybeReload() { if (stale && !busy()) { stale = false; location.reload(); } }
  setInterval(poll, 12000);
  setInterval(maybeReload, 4000);
  ['input', 'keydown', 'pointerdown', 'change'].forEach(ev => document.addEventListener(ev, () => { lastInput = Date.now(); }, true));

  // do not lose a change when the tab is closed
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty.size) flush(true); });
  window.addEventListener('pagehide', () => { if (dirty.size) flush(true); });

  // forget everything cached here (logout): a shared computer must not keep somebody's data
  function purge() { managedKeys().forEach(silentRemove); Object.keys(base).forEach(k => delete base[k]); dirty.clear(); enabled = false; }
  async function finish() { // send what is waiting, then continue
    for (let i = 0; i < 20 && (dirty.size || flushing); i++) { if (!flushing) await flush(); else await new Promise(r => setTimeout(r, 150)); }
  }

  window.KitchensSync = { hydrate, shadowShare, flush: finish, purge };
})();
