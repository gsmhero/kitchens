/* "Dashboard" — financial overview built from the real data of the other tabs.
   Revenue  = value of price offers marked Accepted, in the month they were accepted
   Costs    = constant costs (monthly equivalent of every active cost) + situation costs of that month
   Profit   = Revenue − Costs
   Forecast = next 4 months: revenue follows the trend of the last 3 full months, costs = constant costs + the
              average situation costs of the last 3 months.
   "Safety cushion": is the forecast profit of 4 months at least 4 × the monthly costs (= all costs for 4 months)?
   Financial figures need access to "Costs" (roles table); everyone else sees the operational part only. */
(function () {
  'use strict';

  window.KitchensPages = window.KitchensPages || {};

  const K = () => window.Kitchens;
  const esc = s => window.KitchensForms.esc(s);
  const R = n => Math.round(n);
  const money = n => K().fmt(R(n)) + ' ₽';
  const signed = n => (n > 0 ? '+' : n < 0 ? '− ' : '') + K().fmt(Math.abs(R(n))) + ' ₽';
  const short = n => { const a = Math.abs(n), s = n < 0 ? '−' : ''; return a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + Math.round(a / 1e3) + 'k' : s + Math.round(a); };
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const monthDate = off => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + off, 1); };
  const label = d => d.toLocaleDateString('en-GB', { month: 'short' }) + (d.getMonth() === 0 ? " '" + String(d.getFullYear()).slice(2) : '');
  const HIST = 6, FUT = 4;

  /* ---------- the numbers ---------- */
  function compute() {
    const offers = window.KitchensOffers.list(), cost = window.KitchensCosts.data();
    const accepted = offers.filter(o => o.status === 'accepted');
    const constMonthly = cost.constants.filter(c => c.active).reduce((a, c) => a + c.perMonth, 0);

    const months = [];
    for (let off = -(HIST - 1); off <= FUT; off++) { const d = monthDate(off); months.push({ off, d, k: key(d), label: label(d), fc: off > 0 }); }
    const hist = months.filter(m => !m.fc);

    hist.forEach(m => {
      m.rev = accepted.filter(o => key(new Date(o.date)) === m.k).reduce((a, o) => a + o.total, 0);
      m.sit = cost.situational.filter(e => e.date.slice(0, 7) === m.k).reduce((a, e) => a + e.amount, 0);
      m.cost = constMonthly + m.sit;
      m.profit = m.rev - m.cost;
    });

    // forecast: base = the last 3 full months (the current month is still running)
    const base = hist.filter(m => m.off < 0).slice(-3);
    const avg = f => base.length ? base.reduce((a, m) => a + f(m), 0) / base.length : 0;
    let runRate = avg(m => m.rev);
    if (!runRate && hist[hist.length - 1].rev) runRate = hist[hist.length - 1].rev; // no history yet: use this month
    const avgSit = avg(m => m.sit);
    // trend: average month-to-month change over the base, limited to ±15% per month
    let g = 0;
    if (base.length >= 2 && runRate) { const first = base[0].rev, last = base[base.length - 1].rev; g = Math.max(-0.15, Math.min(0.15, first ? Math.pow(Math.max(last, 1) / first, 1 / (base.length - 1)) - 1 : 0)); }
    months.filter(m => m.fc).forEach(m => {
      m.rev = Math.max(0, runRate * Math.pow(1 + g, m.off));
      m.sit = avgSit;
      m.cost = constMonthly + avgSit;
      m.profit = m.rev - m.cost;
    });

    const decided = offers.filter(o => ['accepted', 'rejected', 'expired'].includes(o.status));
    const winRate = decided.length ? decided.filter(o => o.status === 'accepted').length / decided.length : null;
    const open = offers.filter(o => o.status === 'sent');
    const fut = months.filter(m => m.fc), cur = hist[hist.length - 1], prev = hist[hist.length - 2];
    // profit this year, counted from the first month that has any record (constant costs are not charged for months before the data starts)
    const year = new Date().getFullYear(), thisYear = d => new Date(d).getFullYear() === year;
    const recordMonths = [...accepted.filter(o => thisYear(o.date)).map(o => new Date(o.date).getMonth()), ...cost.situational.filter(e => thisYear(e.date)).map(e => new Date(e.date).getMonth())];
    const startMonth = recordMonths.length ? Math.min(...recordMonths) : new Date().getMonth(), nMonths = new Date().getMonth() - startMonth + 1;
    const ytd = accepted.filter(o => thisYear(o.date)).reduce((a, o) => a + o.total, 0) - constMonthly * nMonths - cost.situational.filter(e => thisYear(e.date)).reduce((a, e) => a + e.amount, 0);
    const ytdFrom = new Date(year, startMonth, 1).toLocaleDateString('en-GB', { month: 'long' });
    return { offers, cost, accepted, constMonthly, months, hist, fut, cur, prev, runRate, g, avgSit, winRate, open, ytd, ytdFrom,
      fcProfit: fut.reduce((a, m) => a + m.profit, 0), fcRev: fut.reduce((a, m) => a + m.rev, 0), fcCost: fut.reduce((a, m) => a + m.cost, 0) };
  }

  /* ---------- chart (inline SVG: bars for revenue and costs, line for profit, forecast shaded) ---------- */
  function chart(months) {
    const W = 780, H = 310, pl = 54, pr = 14, pt = 22, pb = 36, iw = W - pl - pr, ih = H - pt - pb;
    const vals = months.flatMap(m => [m.rev, m.cost, m.profit, 0]);
    let max = Math.max(...vals), min = Math.min(...vals);
    const rawStep = (max - min || 1) / 5, pow = Math.pow(10, Math.floor(Math.log10(rawStep))), step = [1, 2, 2.5, 5, 10].map(x => x * pow).find(x => x >= rawStep);
    max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
    const y = v => pt + (max - v) / (max - min || 1) * ih, slot = iw / months.length, cx = i => pl + slot * i + slot / 2, bw = slot * 0.27;
    const ticks = []; for (let v = min; v <= max + 1e-6; v += step) ticks.push(v);
    const f0 = months.findIndex(m => m.fc);
    return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, costs and profit by month">
      ${f0 >= 0 ? `<rect x="${pl + slot * f0}" y="${pt}" width="${slot * (months.length - f0)}" height="${ih}" class="fc-bg"/><text x="${pl + slot * f0 + 8}" y="${pt + 13}" class="fc-label">Forecast</text>` : ''}
      ${ticks.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : 'grid-l'}"/><text x="${pl - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${short(v)}</text>`).join('')}
      ${months.map((m, i) => `<g class="${m.fc ? 'fc' : ''}">
        <rect x="${cx(i) - bw - 1}" y="${Math.min(y(m.rev), y(0))}" width="${bw}" height="${Math.abs(y(m.rev) - y(0))}" class="b-rev"><title>${m.label}: revenue ${money(m.rev)}</title></rect>
        <rect x="${cx(i) + 1}" y="${Math.min(y(m.cost), y(0))}" width="${bw}" height="${Math.abs(y(m.cost) - y(0))}" class="b-cost"><title>${m.label}: costs ${money(m.cost)}</title></rect>
        <text x="${cx(i)}" y="${H - 14}" class="ax" text-anchor="middle">${esc(m.label)}</text></g>`).join('')}
      <polyline class="l-profit" points="${months.map((m, i) => `${cx(i)},${y(m.profit)}`).join(' ')}"/>
      ${months.map((m, i) => `<circle cx="${cx(i)}" cy="${y(m.profit)}" r="4.5" class="d-profit ${m.profit < 0 ? 'neg' : ''}"><title>${m.label}: profit ${signed(m.profit)}</title></circle>`).join('')}
    </svg>`;
  }

  /* ---------- sections ---------- */
  const delta = (a, b) => b ? ((a - b) / Math.abs(b) * 100) : null;
  const pct = d => d === null ? '' : `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}% vs last month</span>`;

  function financial() {
    const c = compute(), m = c.cur, p = c.prev;
    const margin = m.rev ? m.profit / m.rev * 100 : null;
    const ratio = c.fcCost ? c.fcProfit / c.fcCost : 0;     // forecast profit ÷ costs of the same 4 months
    const verdict = !c.fcCost && !c.fcRev ? ['', 'Not enough data yet: add accepted price offers and costs to see the forecast.']
      : c.fcProfit <= 0 ? ['bad', 'Forecast profit is negative: the next 4 months do not cover their own costs.']
      : ratio >= 1 ? ['ok', 'Profit exceeds the costs of 4 months: the business builds a full 4-month cost reserve.']
        : ['warn', `Profit covers ${Math.round(ratio * 100)}% of the costs of 4 months. A full reserve needs ${money(c.fcCost - c.fcProfit)} more.`];
    const noRev = !c.accepted.length;

    const byCat = {}; // costs of the current month by category
    c.cost.constants.filter(x => x.active).forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.perMonth; });
    c.cost.situational.filter(e => e.date.slice(0, 7) === m.k).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), catMax = cats.length ? cats[0][1] : 1;

    const by = s => c.offers.filter(o => o.status === s), sum = a => a.reduce((x, o) => x + o.total, 0);
    return `
    <div class="grid g4">
      <div class="card kpi"><div class="l">Revenue — ${esc(m.label)} (so far)</div><div class="n">${money(m.rev)}</div><div class="d">${pct(delta(m.rev, p.rev))}</div></div>
      <div class="card kpi"><div class="l">Costs — ${esc(m.label)} (so far)</div><div class="n">${money(m.cost)}</div><div class="d sub">constant ${money(c.constMonthly)} + situation ${money(m.sit)}</div></div>
      <div class="card kpi"><div class="l">Profit — ${esc(m.label)} (so far)</div><div class="n ${m.profit < 0 ? 'down' : 'up'}">${signed(m.profit)}</div><div class="d sub">${margin === null ? 'no revenue yet' : 'margin ' + Math.round(margin) + '%'}</div></div>
      <div class="card kpi"><div class="l">Profit this year</div><div class="n ${c.ytd < 0 ? 'down' : 'up'}">${signed(c.ytd)}</div><div class="d sub">from ${esc(c.ytdFrom)} · ${c.accepted.length} accepted offers</div></div>
    </div>
    ${noRev ? '<div class="notice">No revenue yet: revenue is counted when a <a class="link" href="#tab/price-offers">price offer</a> is marked <b>Accepted</b>.</div>' : ''}

    <div class="card">
      <div class="section-head" style="margin-top:0"><h3 style="margin:0">Revenue, costs and profit <span class="count">last ${HIST} months + ${FUT}-month forecast</span></h3>
        <span class="legend"><i class="lg rev"></i>Revenue <i class="lg cost"></i>Costs <i class="lg prof"></i>Profit</span></div>
      ${chart(c.months)}
      <p class="hint">The current month (${esc(m.label)}) is still running. Constant costs are shown at today's amounts for every month.</p>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>Forecast for the next ${FUT} months</h3>
        <table><thead><tr><th>Month</th><th class="num">Revenue</th><th class="num">Costs</th><th class="num">Profit</th></tr></thead><tbody>
          ${c.fut.map(f => `<tr><td>${esc(f.label)}</td><td class="num">${money(f.rev)}</td><td class="num">${money(f.cost)}</td><td class="num ${f.profit < 0 ? 'down' : 'up'}"><b>${signed(f.profit)}</b></td></tr>`).join('')}
        </tbody><tfoot><tr><th>Total ${FUT} months</th><th class="num">${money(c.fcRev)}</th><th class="num">${money(c.fcCost)}</th><th class="num ${c.fcProfit < 0 ? 'down' : 'up'}">${signed(c.fcProfit)}</th></tr></tfoot></table>
        <p class="hint"><b>How it is calculated.</b> Revenue: average of the last 3 full months (${money(c.runRate)}), moved by their trend (${c.g >= 0 ? '+' : ''}${(c.g * 100).toFixed(1)}% a month, limited to ±15%). Costs: constant ${money(c.constMonthly)} + average situation costs ${money(c.avgSit)}.</p>
      </div>

      <div class="card safety ${verdict[0]}">
        <h3>Safety cushion</h3>
        <p class="sub" style="margin:0 0 10px">Is the profit of the next ${FUT} months more than ${FUT} × the monthly costs?</p>
        <div class="sf-row"><span>Forecast profit, ${FUT} months</span><b class="${c.fcProfit < 0 ? 'down' : ''}">${signed(c.fcProfit)}</b></div>
        <div class="sf-row"><span>Costs: ${money(c.fcCost / FUT)} × ${FUT} months</span><b>${money(c.fcCost)}</b></div>
        <div class="sf-row big"><span>Profit ÷ costs</span><b>${c.fcCost ? ratio.toFixed(2) : '—'} ×</b></div>
        <div class="sf-bar"><i style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></i></div>
        <p class="sf-verdict"><span class="pill ${verdict[0]}">${verdict[0] === 'ok' ? '✔ More than 4 × costs' : verdict[0] === 'warn' ? 'Below 4 × costs' : verdict[0] === 'bad' ? 'Negative' : 'No data'}</span> ${esc(verdict[1])}</p>
      </div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>Where the money goes — ${esc(m.label)}</h3>
        ${cats.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div><i style="width:${v / catMax * 100}%"></i></div><b>${money(v)}</b></div>`).join('') || '<p class="sub">No costs recorded.</p>'}
        <p class="hint">Manage them in <a class="link" href="#tab/costs">Costs</a>.</p>
      </div>
      <div class="card">
        <h3>Price offers</h3>
        <table><tbody>
          ${[['Draft', 'draft'], ['Sent — awaiting answer', 'sent'], ['Accepted', 'accepted'], ['Rejected', 'rejected'], ['Expired', 'expired']].map(([l, s]) => `<tr><td>${l}</td><td class="num">${by(s).length}</td><td class="num">${money(sum(by(s)))}</td></tr>`).join('')}
        </tbody></table>
        <p class="hint">Win rate: <b>${c.winRate === null ? 'no decided offers yet' : Math.round(c.winRate * 100) + '%'}</b>.
          Open offers are worth ${money(sum(c.open))}${c.winRate !== null ? `, about <b>${money(sum(c.open) * c.winRate)}</b> expected at the win rate` : ''} — not included in the forecast.</p>
      </div>
    </div>`;
  }

  function pipeline() {
    const stages = K().getStages(), reqs = window.KitchensRequest.all();
    const counts = stages.map((s, i) => ({ name: s.name, n: reqs.filter(r => K().stageIndex(r.sub.stage) === i).length + K().ORDERS.filter(o => K().stageIndex(o.stage) === i).length }));
    const max = Math.max(1, ...counts.map(x => x.n));
    return `<div class="card"><h3>Work in progress by stage</h3>
      ${counts.map(x => `<div class="hbar"><span>${esc(x.name)}</span><div><i style="width:${x.n / max * 100}%"></i></div><b>${x.n}</b></div>`).join('')}
      <p class="hint">Requests from the Request page plus demo orders. See <a class="link" href="#tab/flow">Flow</a>.</p></div>`;
  }

  window.KitchensPages.Dashboard = () => {
    const fin = window.KitchensRoles.level(K().getUser(), 'Costs') >= 1;
    return `
    <h1>Dashboard</h1>
    <p class="sub">${fin ? 'Revenue, costs, profit and the forecast, calculated from your price offers and costs.' : 'Overview of the work in progress.'}</p>
    ${fin ? financial() : '<div class="notice">Financial statistics are available to roles with access to Costs. Ask the owner in Branches and Roles.</div>'}
    ${pipeline()}`;
  };
})();
