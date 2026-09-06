/* State and district choropleth (D3 + topojson-client).
   Boundaries: public/data/india.topojson — Census 2011 districts from udit-001/india-maps-data
   (https://github.com/udit-001/india-maps-data), downloaded once at build time rather than fetched from GitHub at runtime.
   Metric values live in src/data/map-*.json; district figures in src/data/districts-*.json. */
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { INK, PEAC, RULE } from './charts.js';
import pci from './data/map-pci.json';
import pciDistricts from './data/districts-pci.json';

/* A metric file (src/data/map-<id>.json) is self-describing: `columns.a/.b` carry label, source and
   asOf; each state carries `a`, `b` and `aStatus` ("verified" | "approximate" | "none").
   toMetric() flattens that into the shape the renderer uses: { id, name, unit, a, b, india: [a, b],
   values: { State: [a, b] }, src }. The `src` footnote is generated so it stays truthful as states
   get verified — with the three verified states of the original it reproduces the original copy. */
export function toMetric(m) {
  const values = Object.fromEntries(Object.entries(m.states).map(([n, s]) => [n, [s.a, s.b]]));
  const approx = Object.entries(m.states).filter(([, s]) => s.aStatus === 'approximate');
  const verified = Object.entries(m.states).filter(([, s]) => s.aStatus === 'verified').map(([n]) => n);
  const caveat = approx.length
    ? ` — typed from memory except ${verified.join(', ')}; verify before publishing.`
    : '.';
  return {
    id: m.id, name: m.name, unit: m.unit,
    a: m.columns.a.label, b: m.columns.b.label,
    india: [m.india.a, m.india.b],
    values,
    src: `${m.columns.b.label}: ${m.columns.b.source}. ${m.columns.a.label}: ${m.columns.a.source}${caveat}`
  };
}

const MAP = {
  topo: import.meta.env.BASE_URL + 'data/india.topojson',
  metrics: [toMetric(pci)],
  districts: pciDistricts
};

export async function initMap() {
  const wrap = document.getElementById('map');
  let topo = null;
  try { const r = await fetch(MAP.topo); if (r.ok) topo = await r.json(); } catch (e) {}
  if (!topo) { wrap.insertAdjacentHTML('beforeend', '<p class="note">Map boundaries could not load. Check the connection and reload.</p>'); return; }

  const states = topojson.feature(topo, topo.objects.states);
  const districts = topojson.feature(topo, topo.objects.districts);
  const W = 800, H = 780;
  const svg = d3.select(wrap).insert('svg', '.tip').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Choropleth map of India by state');
  const g = svg.append('g');
  const proj = d3.geoMercator().fitSize([W, H], states);
  const path = d3.geoPath(proj);
  const gS = g.append('g'), gD = g.append('g').style('display', 'none');
  const tip = document.getElementById('tip');
  const side = document.getElementById('side');
  const sel = document.getElementById('metric');
  const legend = document.getElementById('legend');

  MAP.metrics.forEach(m => sel.add(new Option(m.name, m.id)));
  let metric = MAP.metrics[0], mode = 'b', open = null;

  const fmt = v => v == null ? '—' : metric.unit === '₹'
    ? (v >= 1e5 ? '₹' + (v / 1e5).toFixed(2) + ' L' : '₹' + Math.round(v).toLocaleString('en-IN'))
    : v.toLocaleString('en-IN');
  const fmtX = x => x == null ? '—' : x.toFixed(1) + '×';
  const valOf = (pair) => !pair ? null : mode === 'a' ? pair[0] : mode === 'b' ? pair[1] : (pair[0] && pair[1] ? pair[1] / pair[0] : null);
  const stateVal = n => valOf(metric.values[n]);
  const distVal = (s, d) => valOf((MAP.districts[s] || {})[d]);

  let scale;
  function buildScale() {
    const all = Object.values(metric.values);
    const [c0, c1] = mode === 'x' ? [PEAC + '26', PEAC] : ['#E6E9F2', INK];
    let lo, hi;
    if (mode === 'x') { const xs = all.map(valOf).filter(v => v != null); lo = d3.min(xs); hi = d3.max(xs); }
    else { const vs = all.flat().filter(v => v != null); lo = d3.min(vs); hi = d3.max(vs); } // same domain for both years so the shift is visible
    scale = d3.scaleSequential(d3.interpolateRgb(c0, c1)).domain([lo, hi]);
    legend.style.setProperty('--l0', c0); legend.style.setProperty('--l1', c1);
    document.getElementById('l0').textContent = mode === 'x' ? fmtX(lo) : fmt(lo);
    document.getElementById('l1').textContent = mode === 'x' ? fmtX(hi) : fmt(hi);
  }
  const fillFor = v => v == null ? RULE : scale(v);

  const sp = gS.selectAll('path').data(states.features).join('path').attr('d', path).attr('class', 'st')
    .on('pointermove', (e, d) => showTip(e, d.properties.st_nm, metric.values[d.properties.st_nm]))
    .on('pointerleave', hideTip)
    .on('click', (e, d) => zoomTo(d));
  const dp = gD.selectAll('path').data(districts.features).join('path').attr('d', path).attr('class', 'dt')
    .on('pointermove', (e, d) => { const s = d.properties.st_nm, n = d.properties.district; const pair = (MAP.districts[s] || {})[n]; showTip(e, n, pair || metric.values[s], pair ? '' : 'state figure — no district data yet'); })
    .on('pointerleave', hideTip);

  function paint() {
    buildScale();
    sp.transition().duration(500).attr('fill', d => fillFor(stateVal(d.properties.st_nm)));
    dp.transition().duration(500)
      .attr('fill', d => { const v = distVal(d.properties.st_nm, d.properties.district); return v != null ? fillFor(v) : fillFor(stateVal(d.properties.st_nm)); })
      .attr('fill-opacity', d => distVal(d.properties.st_nm, d.properties.district) != null ? 1 : .45);
    renderSide();
  }

  function showTip(e, name, pair, note) {
    const r = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${name}</b>${metric.a} ${fmt(pair && pair[0])}<br>${metric.b} ${fmt(pair && pair[1])}<br><span class="muted">${pair && pair[0] && pair[1] ? fmtX(pair[1] / pair[0]) + ' in nominal terms' : 'no comparable baseline'}${note ? ' · ' + note : ''}</span>`;
    tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1;
  }
  function hideTip() { tip.style.opacity = 0; }

  function zoomTo(d) {
    open = d.properties.st_nm;
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    const k = Math.min(8, .9 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const tx = W / 2 - k * (x0 + x1) / 2, ty = H / 2 - k * (y0 + y1) / 2;
    sp.classed('dim', s => s.properties.st_nm !== open).classed('sel', s => s.properties.st_nm === open);
    gD.style('display', null);
    dp.style('display', s => s.properties.st_nm === open ? null : 'none');
    g.transition().duration(650).attr('transform', `translate(${tx},${ty}) scale(${k})`);
    document.getElementById('map-back').hidden = false;
    renderSide();
  }
  function reset() {
    open = null;
    sp.classed('dim', false).classed('sel', false);
    g.transition().duration(650).attr('transform', null).on('end', () => gD.style('display', 'none'));
    document.getElementById('map-back').hidden = true;
    renderSide();
  }
  document.getElementById('map-back').addEventListener('click', reset);

  function renderSide() {
    const rows = Object.entries(metric.values).filter(([, p]) => p && p[0] && p[1]).map(([n, p]) => ({ n, a: p[0], b: p[1], x: p[1] / p[0] }));
    const key = mode === 'x' ? 'x' : mode === 'a' ? 'a' : 'b';
    rows.sort((p, q) => q[key] - p[key]);
    const f = mode === 'x' ? v => fmtX(v) : fmt;
    if (open) {
      const p = metric.values[open], r = rows.find(r => r.n === open);
      const dCount = Object.keys(MAP.districts[open] || {}).length;
      side.innerHTML = `<h3>${open}</h3>
        <p class="n">${p && p[0] && p[1] ? fmtX(p[1] / p[0]) : '—'}</p>
        <p>${metric.a} ${fmt(p && p[0])} → ${metric.b} ${fmt(p && p[1])}</p>
        <p class="s">${r ? 'Ranked ' + (rows.findIndex(x => x.n === open) + 1) + ' of ' + rows.length + ' by ' + (mode === 'x' ? 'change' : mode === 'a' ? metric.a : metric.b) : 'No comparable baseline.'} India went ${fmt(metric.india[0])} → ${fmt(metric.india[1])}, ${fmtX(metric.india[1] / metric.india[0])}.</p>
        <p class="s">${dCount ? dCount + ' districts have their own figures.' : 'Districts show the state figure until you add district data.'}</p>
        <div class="csv">Add district figures as CSV: <code>state,district,${metric.a},${metric.b}</code><input type="file" accept=".csv" id="csv"></div>`;
      document.getElementById('csv').addEventListener('change', loadCSV);
    } else {
      const top = rows.slice(0, 5), bottom = rows.slice(-5);
      const li = r => `<li><span>${r.n}</span><span>${f(r[key])}</span></li>`;
      side.innerHTML = `<h3>${mode === 'x' ? 'Fastest and slowest' : 'Highest and lowest'}, ${mode === 'x' ? metric.a + ' to ' + metric.b : mode === 'a' ? metric.a : metric.b}</h3>
        <p class="s">India: ${mode === 'x' ? fmtX(metric.india[1] / metric.india[0]) : fmt(metric.india[mode === 'a' ? 0 : 1])}</p>
        <ul class="rank">${top.map(li).join('')}<li style="border-top-style:dashed;color:var(--ink-soft)"><span>…</span><span></span></li>${bottom.map(li).join('')}</ul>
        <p class="s" style="margin-top:12px">${metric.src}</p>`;
    }
  }

  function loadCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(t => {
      t.trim().split(/\r?\n/).slice(1).forEach(line => {
        const [s, d, a, b] = line.split(',').map(x => x.trim().replace(/^"|"$/g, ''));
        if (!s || !d) return;
        (MAP.districts[s] = MAP.districts[s] || {})[d] = [+a || null, +b || null];
      });
      paint();
    });
  }

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    paint();
  }));
  sel.addEventListener('change', () => { metric = MAP.metrics.find(m => m.id === sel.value); paint(); });

  paint();
}
