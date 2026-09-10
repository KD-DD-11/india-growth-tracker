/* Compare periods: three panels showing the same series over windows the reader chooses.
   Data comes from getSeries() in live.js (live World Bank, else the saved copy), so any year-keyed
   series added there is automatically available here. */
import Chart from 'chart.js/auto';
import { METRICS, getSeries } from './live.js';
import { scaleX, scaleY } from './charts.js';

// Default windows: the decade after liberalisation, and the two decades since 2004.
const DEFAULT_PERIODS = [[1991, 2001], [2004, 2014], [2014, 2024]];

const pct = x => (x * 100).toFixed(1) + '%';

function summarise(m, years, values) {
  const y0 = years[0], y1 = years[years.length - 1], v0 = values[0], v1 = values[values.length - 1], n = y1 - y0;
  if (!(v0 > 0) || !(v1 > 0)) return { big: '—', small: '', detail: 'no data for one end of this window' };
  if (m.kind === 'ratio') {
    const ratio = v1 / v0, cagr = Math.pow(ratio, 1 / n) - 1;
    return { big: ratio.toFixed(1), small: '×', detail: `${pct(cagr)} a year · ${m.fmt(v0)} → ${m.fmt(v1)}` };
  }
  const d = v1 - v0;
  return { big: (d >= 0 ? '+' : '') + d.toFixed(1), small: m.unit, detail: `${(d / n).toFixed(2)} ${m.unit} a year · ${m.fmt(v0)} → ${m.fmt(v1)}` };
}

export async function initCompare() {
  const sel = document.getElementById('cmp-metric');
  const src = document.getElementById('src-cmp');
  const host = document.getElementById('compare-panels');
  METRICS.forEach(m => sel.add(new Option(m.name, m.id)));
  let metric = METRICS[0], series = null;

  const panels = DEFAULT_PERIODS.map(([from, to]) => {
    const fig = document.createElement('figure');
    fig.innerHTML = `<div class="cmp-years"><select class="from" aria-label="From year"></select><span>to</span><select class="to" aria-label="To year"></select></div>
      <p class="n"></p><p class="s"></p><div class="ch"><canvas></canvas></div>`;
    host.appendChild(fig);
    const p = { from, to, fig, selFrom: fig.querySelector('.from'), selTo: fig.querySelector('.to'), n: fig.querySelector('.n'), s: fig.querySelector('.s'), chart: null };
    p.selFrom.addEventListener('change', () => { p.from = +p.selFrom.value; if (p.to <= p.from) p.to = Math.min(p.from + 1, series.years.at(-1)); paint(p); });
    p.selTo.addEventListener('change', () => { p.to = +p.selTo.value; if (p.from >= p.to) p.from = Math.max(p.to - 1, series.years[0]); paint(p); });
    return p;
  });

  const label = i => series.labels ? series.labels[i] : String(series.years[i]);
  function fillYears(p) {
    const ys = series.years;
    p.from = Math.max(ys[0], Math.min(p.from, ys.at(-1) - 1));
    p.to = Math.max(p.from + 1, Math.min(p.to, ys.at(-1)));
    for (const [s, chosen] of [[p.selFrom, p.from], [p.selTo, p.to]]) {
      s.innerHTML = '';
      ys.forEach((y, i) => s.add(new Option(label(i), y, false, y === chosen)));
    }
  }

  function paint(p) {
    fillYears(p);
    const i0 = series.years.indexOf(p.from), i1 = series.years.indexOf(p.to);
    const years = series.years.slice(i0, i1 + 1), values = series.values.slice(i0, i1 + 1);
    const labels = series.labels ? series.labels.slice(i0, i1 + 1) : years;
    const sum = summarise(metric, years, values);
    p.n.innerHTML = `${sum.big}<small> ${sum.small}</small>`;
    p.s.textContent = sum.detail;
    if (p.chart) p.chart.destroy();
    p.chart = new Chart(p.fig.querySelector('canvas'), {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: metric.color, borderWidth: 2, pointRadius: 0, pointHitRadius: 12, tension: .25, fill: true, backgroundColor: metric.color + '14' }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { x: { ...scaleX, ticks: { ...scaleX.ticks, maxTicksLimit: 4 } }, y: { ...scaleY(metric.fmt), ticks: { callback: metric.fmt, maxTicksLimit: 4 } } },
        plugins: { tooltip: { callbacks: { label: c => metric.fmt(c.parsed.y) } } } }
    });
  }

  async function load() {
    src.textContent = 'connecting to World Bank'; src.className = 'src';
    series = await getSeries(metric);
    src.textContent = series.caption;
    src.className = 'src ' + ({ live: 'live', offline: 'err', embedded: '' })[series.status];
    panels.forEach(paint);
  }

  sel.addEventListener('change', () => { metric = METRICS.find(m => m.id === sel.value); load(); });
  await load();
}
