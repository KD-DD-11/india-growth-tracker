/* Three-map comparator. Each panel picks a measure and a fiscal year; panels showing the same measure share
   one fixed colour scale (computed across every state and every year in src/states.js), so a darker state in
   one map is genuinely higher than a lighter one in another. Hovering or clicking a state highlights it in
   all three maps and prints its value in each. Data: MoSPI state-wise National Accounts via states.json.
   Boundaries: public/data/india.topojson (Census 2011, udit-001/india-maps-data). */
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { INK, PEAC, RULE, MADD } from './charts.js';
import { METRICS, YEARS, metric, slice, yearsFor, coverage, domain, value, change, fmt, fmtShort, basisLabel, fy } from './states.js';

const PANELS = [
  { metric: 'pcnsdp', year: '2014-15' },
  { metric: 'pcnsdp', year: '2019-20' },
  { metric: 'pcnsdp', year: '2023-24' },
];
const W = 400, H = 390;          // viewBox; the SVG scales to its column
const PAPER = '#E6E9F2';         // lightest sequential step, as on the old map

/* ---------- colour scales: one per metric+basis, fixed across years ---------- */
const scaleCache = new Map();
function scaleFor(id, basis) {
  const key = id + '|' + basis;
  if (scaleCache.has(key)) return scaleCache.get(key);
  const m = metric(id);
  let s;
  if (m.kind === 'rate') {
    // Symmetric, clamped at the 95th percentile of |growth| so Goa's mining-ban years (−15%, +27%) do not
    // wash out the range everyone else lives in. The legend says when a value is clamped.
    const all = Object.values(m.values[basis]).flatMap(b => Object.values(b)).map(Math.abs).sort((a, b) => a - b);
    const cap = all[Math.floor(0.95 * (all.length - 1))];
    s = d3.scaleDiverging(d3.interpolateRgbBasis([MADD, '#F4F1EA', PEAC])).domain([-cap, 0, cap]).clamp(true);
    s.clampedAt = cap;
  } else {
    // Levels span ~30× between the poorest and richest state-year; a log scale keeps the middle readable
    // while staying fixed across years.
    const [lo, hi] = domain(id, basis);
    s = d3.scaleSequentialLog(d3.interpolateRgb(PAPER, INK)).domain([lo, hi]);
  }
  scaleCache.set(key, s);
  return s;
}

export async function initComparator() {
  const host = document.getElementById('cmp-maps');
  if (!host) return;
  const focusEl = document.getElementById('cmp-focus');
  const basisSel = document.getElementById('cmp-basis');
  const topo = await fetch(import.meta.env.BASE_URL + 'data/india.topojson').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!topo) { host.insertAdjacentHTML('beforeend', '<p class="note">Map boundaries could not load. Check the connection and reload.</p>'); return; }

  const states = topojson.feature(topo, topo.objects.states);
  const proj = d3.geoMercator().fitSize([W, H], states);
  const path = d3.geoPath(proj);

  let basis = 'current', focus = null, pinned = false;

  /* ---------- build the three panels ---------- */
  const panels = PANELS.map((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'cmp-panel';
    fig.innerHTML = `
      <div class="cmp-controls">
        <select class="metric" aria-label="Measure for map ${i + 1}"></select>
        <select class="year" aria-label="Year for map ${i + 1}"></select>
      </div>
      <div class="map-wrap"><div class="tip"></div></div>
      <div class="legend"><div class="bar"></div><div class="lab"><span class="l0"></span><span class="lmid"></span><span class="l1"></span></div></div>
      <p class="s cover"></p>
      <ul class="rank"></ul>`;
    host.appendChild(fig);
    const q = sel => fig.querySelector(sel);
    const panel = { ...p, i, fig, metricSel: q('.metric'), yearSel: q('.year'), wrap: q('.map-wrap'), tip: q('.tip'),
      legend: q('.legend'), l0: q('.l0'), lmid: q('.lmid'), l1: q('.l1'), cover: q('.cover'), rank: q('.rank') };
    METRICS.forEach(m => panel.metricSel.add(new Option(m.name, m.id, false, m.id === p.metric)));
    const svg = d3.select(panel.wrap).insert('svg', '.tip').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
    panel.svg = svg;
    panel.paths = svg.append('g').selectAll('path').data(states.features).join('path').attr('d', path).attr('class', 'st')
      .on('pointermove', (e, d) => { setFocus(d.properties.st_nm, false); showTip(panel, e, d.properties.st_nm); })
      .on('pointerleave', () => { hideTips(); if (!pinned) setFocus(null, false); })
      .on('click', (e, d) => { const n = d.properties.st_nm; if (pinned && focus === n) { pinned = false; setFocus(null, false); } else { pinned = true; setFocus(n, true); } });
    panel.metricSel.addEventListener('change', () => { panel.metric = panel.metricSel.value; fillYears(panel); paint(panel); renderFocus(); });
    panel.yearSel.addEventListener('change', () => { panel.year = panel.yearSel.value; paint(panel); renderFocus(); });
    fillYears(panel);
    return panel;
  });

  function fillYears(panel) {
    const ys = yearsFor(panel.metric, basis);
    if (!ys.includes(panel.year)) panel.year = ys.includes(PANELS[panel.i].year) ? PANELS[panel.i].year : ys.at(-1);
    panel.yearSel.innerHTML = '';
    ys.forEach(y => panel.yearSel.add(new Option(y, y, false, y === panel.year)));
  }

  /* ---------- painting ---------- */
  function paint(panel) {
    const { metric: id, year } = panel;
    const m = metric(id), s = scaleFor(id, basis), vals = slice(id, basis, year);
    panel.svg.attr('aria-label', `${m.name}, ${year}, by state`);
    panel.paths.transition().duration(400).attr('fill', d => { const v = vals[d.properties.st_nm]; return v == null ? RULE : s(v); });

    // legend: sample the scale into a gradient so log and diverging scales render truthfully
    const [lo, hi] = m.kind === 'rate' ? [-s.clampedAt, s.clampedAt] : s.domain();
    const stops = d3.range(0, 1.0001, 1 / 8).map(t => s(m.kind === 'rate' ? lo + t * (hi - lo) : Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo)))));
    panel.legend.querySelector('.bar').style.background = `linear-gradient(90deg, ${stops.join(',')})`;
    panel.l0.textContent = (m.kind === 'rate' ? '≤ ' : '') + fmtShort(id, lo);
    panel.lmid.textContent = m.kind === 'rate' ? '0' : '';
    panel.l1.textContent = (m.kind === 'rate' ? '≥ ' : '') + fmtShort(id, hi);

    // coverage and ranking
    const n = coverage(id, basis, year), total = states.features.length;
    const missing = total - n;
    // Two UTs never have state accounts (explained in the section note); anything beyond that is worth saying.
    // The latest fiscal year is the only one that is still filling in, so only there is "yet" true.
    const latest = year === YEARS.at(-1);
    panel.cover.textContent = `${n} of ${total} states and UTs · ${basisLabel(id, basis)}` +
      (missing > 2 ? ` · ${missing} without a figure${latest ? ' yet' : ''} for ${year}` : '');
    const rows = Object.entries(vals).sort((a, b) => b[1] - a[1]);
    const li = ([st, v], r) => `<li data-state="${st}"><span>${r}. ${st}</span><span>${fmt(id, v)}</span></li>`;
    const top = rows.slice(0, 3).map((r, k) => li(r, k + 1)), bottom = rows.slice(-3).map((r, k) => li(r, rows.length - 2 + k));
    panel.rank.innerHTML = rows.length > 6 ? top.join('') + '<li class="gap"><span>…</span><span></span></li>' + bottom.join('') : rows.map((r, k) => li(r, k + 1)).join('');
    panel.rows = rows;
  }

  /* ---------- tooltip, shared focus ---------- */
  function showTip(panel, e, name) {
    const { metric: id, year } = panel;
    const v = value(id, basis, name, year);
    const r = panel.rows.findIndex(([st]) => st === name);
    const rect = panel.wrap.getBoundingClientRect();
    panel.tip.innerHTML = `<b>${name}</b>${year}: ${fmt(id, v)}${r >= 0 ? `<br><span class="muted">rank ${r + 1} of ${panel.rows.length}</span>` : '<br><span class="muted">not published for this year</span>'}`;
    panel.tip.style.left = (e.clientX - rect.left) + 'px'; panel.tip.style.top = (e.clientY - rect.top) + 'px'; panel.tip.style.opacity = 1;
  }
  function hideTips() { panels.forEach(p => p.tip.style.opacity = 0); }

  function setFocus(name, pin) {
    focus = name;
    panels.forEach(p => {
      p.paths.classed('sel', d => d.properties.st_nm === name);
      p.rank.querySelectorAll('li').forEach(li => li.classList.toggle('me', li.dataset.state === name));
    });
    renderFocus();
  }

  /** Readout under the maps: the focused state in each panel, plus the change where two panels share a metric. */
  function renderFocus() {
    if (!focus) { focusEl.innerHTML = `<p class="s">Hover a state to read it across all three maps; click to pin it.</p>`; return; }
    const cells = panels.map(p => {
      const v = value(p.metric, basis, focus, p.year), r = p.rows.findIndex(([st]) => st === focus);
      return `<div><p class="k">Map ${p.i + 1} · ${p.year}</p><p class="n">${fmt(p.metric, v)}</p><p class="s">${metric(p.metric).name}${r >= 0 ? ` · rank ${r + 1} of ${p.rows.length}` : ' · not published'}</p></div>`;
    });
    // pairwise change between panels that show the same level metric
    const notes = [];
    for (let a = 0; a < panels.length; a++) for (let b = a + 1; b < panels.length; b++) {
      const A = panels[a], B = panels[b];
      if (A.metric !== B.metric || metric(A.metric).kind !== 'level' || A.year === B.year) continue;
      const [from, to] = fy(A.year) <= fy(B.year) ? [A, B] : [B, A];
      const c = change(A.metric, basis, focus, from.year, to.year);
      if (c) notes.push(`${from.year} → ${to.year}: ${c.ratio.toFixed(2)}×, ${(c.cagr * 100).toFixed(1)}% a year (${basisLabel(A.metric, basis)})`);
    }
    focusEl.innerHTML = `<h3>${focus}${pinned ? ' <button class="btn-back" id="cmp-unpin">Clear</button>' : ''}</h3><div class="cmp-cells">${cells.join('')}</div>${notes.length ? `<p class="s">${notes.join(' · ')}</p>` : ''}`;
    focusEl.querySelector('#cmp-unpin')?.addEventListener('click', () => { pinned = false; setFocus(null, false); });
  }

  basisSel.addEventListener('change', () => { basis = basisSel.value; panels.forEach(p => { fillYears(p); paint(p); }); renderFocus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pinned) { pinned = false; setFocus(null, false); } });

  panels.forEach(paint);
  renderFocus();
}
