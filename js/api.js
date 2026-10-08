/* Client of the server API (api/index.php) and a cache of what the screens need synchronously:
   the logged-in person, their access levels, roles, branches, the team directory (and the staff list for those who may see it).
   Every screen keeps reading from the cache; changes go to the server first and then the cache is refreshed. */
(function () {
  'use strict';

  const state = { user: null, levels: {}, csrf: '', permKeys: [], roles: [], branches: [], people: [], staff: [], invitations: [] };

  async function call(action, data, query) {
    const qs = '?a=' + encodeURIComponent(action) + (query ? '&' + new URLSearchParams(query) : '');
    const post = data !== undefined;
    let res;
    try {
      res = await fetch('api/index.php' + qs, {
        method: post ? 'POST' : 'GET', credentials: 'same-origin',
        headers: post ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf } : {},
        body: post ? JSON.stringify(data) : undefined
      });
    } catch (e) { throw new Error('No connection to the server'); }
    let json = {};
    try { json = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      if (res.status === 403 && /reload/i.test(json.error || '')) { await refreshSession(); }
      const err = new Error(json.error || 'Server error (' + res.status + ')'); err.status = res.status; throw err;
    }
    return json;
  }

  function applySession(s) {
    state.user = s.user; state.levels = s.levels || {}; state.csrf = s.csrf || state.csrf; state.permKeys = s.permKeys || state.permKeys;
    if (!s.user) { state.roles = []; state.branches = []; state.people = []; state.staff = []; state.invitations = []; }
  }
  async function refreshSession() { applySession(await call('me')); }

  const loaders = {
    roles: async () => { state.roles = (await call('roles')).roles; },
    branches: async () => { state.branches = (await call('branches')).branches; },
    people: async () => { state.people = (await call('directory')).people; },
    staff: async () => {
      if ((state.levels.Staff || 0) < 1) { state.staff = []; state.invitations = []; return; }
      const r = await call('staff'); state.staff = r.staff; state.invitations = r.invitations;
    }
  };
  // reload some or all cached lists; unknown names are ignored
  async function load(...names) {
    if (!state.user) return;
    if (!names.length) names = Object.keys(loaders);
    await Promise.all(names.map(n => loaders[n] && loaders[n]()));
  }

  // first page load: who is logged in (session cookie), then the lists
  async function boot() {
    try { await refreshSession(); await load(); } catch (e) { console.error(e); applySession({ user: null, levels: {} }); state.offline = true; }
    return state.user;
  }
  // after login / registration / accepting an invitation
  async function setSession(s) { applySession(s); await load(); return state.user; }
  async function logout() { try { await call('logout', {}); } catch (e) { /* the session cookie is dropped anyway */ } await refreshSession().catch(() => applySession({ user: null, levels: {} })); }

  window.KitchensApi = { state, call, load, boot, setSession, logout, refreshSession };
})();
