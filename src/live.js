/* Live World Bank series, with the saved copy in src/data/worldbank.json as the offline fallback.
   Each indicator is fetched once (full history) and shared by the section charts and the compare panels. */
import { lineChart, INK, PEAC, fmtUSD } from './charts.js';
import worldbank from './data/worldbank.json';
import gdpLongRun from './data/gdp-long-run.json';

const fmtCr = v => v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L cr' : '₹' + Math.round(v).toLocaleString('en-IN') + ' cr';

/* The series the page knows about. World Bank ones have a section chart (`canvas`, starting at `since`);
   MoSPI ones are embedded from src/data/gdp-long-run.json (refreshed by `npm run refresh:mospi`) and
   appear in the compare panels only. `kind` says how a window is summarised: 'ratio' (×, % a year) or
   'delta' (+ units, per year). */
export const METRICS = [
  { id: 'mospi-gdp-real',    name: 'GDP at 2011-12 prices, ₹ crore (MoSPI, from 1950-51)', provider: 'mospi', field: 'real',    color: INK, fmt: fmtCr, kind: 'ratio' },
  { id: 'mospi-gdp-nominal', name: 'GDP at current prices, ₹ crore (MoSPI, from 1950-51)', provider: 'mospi', field: 'nominal', color: INK, fmt: fmtCr, kind: 'ratio' },
  { id: 'NY.GDP.MKTP.CD', name: 'GDP, current US$',              canvas: 'c-gdp',  src: 'src-gdp',  color: INK,  fmt: fmtUSD, fill: true, since: 1991, kind: 'ratio' },
  { id: 'NY.GDP.PCAP.CD', name: 'GDP per person, current US$',   canvas: 'c-pcap', src: 'src-pcap', color: INK,  fmt: v => '$' + Math.round(v).toLocaleString(), since: 1991, kind: 'ratio' },
  { id: 'SP.DYN.LE00.IN', name: 'Life expectancy at birth',      canvas: 'c-le',   src: 'src-le',   color: PEAC, fmt: v => v.toFixed(1) + ' yrs', since: 1991, kind: 'delta', unit: 'yrs' },
  { id: 'IT.NET.USER.ZS', name: 'People using the internet, %',  canvas: 'c-net',  src: 'src-net',  color: PEAC, fmt: v => v.toFixed(0) + '%', fill: true, since: 2000, kind: 'delta', unit: 'pts' }
];

const FIRST_YEAR = 1960; // earliest year the World Bank has for India

const slice = (s, since) => { const from = s.years.findIndex(y => y >= since); return { years: s.years.slice(from), values: s.values.slice(from) }; };

async function wb(indicator) {
  const url = `https://api.worldbank.org/v2/country/IND/indicator/${indicator}?format=json&per_page=200&date=${FIRST_YEAR}:2030`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  const [, rows] = await res.json();
  const pts = rows.filter(r => r.value != null).map(r => ({ y: +r.date, v: r.value })).sort((a, b) => a.y - b.y);
  if (!pts.length) throw new Error('empty');
  return { years: pts.map(p => p.y), values: pts.map(p => p.v) };
}

const cache = new Map();
/** Full history for a metric: { years, values, labels?, status, caption }.
    status: 'live' (World Bank answered), 'offline' (saved World Bank copy), 'embedded' (official series from src/data). */
export function getSeries(m) {
  if (typeof m === 'string') m = METRICS.find(x => x.id === m);
  if (!cache.has(m.id)) cache.set(m.id, load(m));
  return cache.get(m.id);
}
async function load(m) {
  if (m.provider === 'mospi') {
    const g = gdpLongRun;
    return { years: g.years, labels: g.labels, values: g[m.field], status: 'embedded',
      caption: `embedded, MoSPI, ${g.labels[0]} to ${g.labels.at(-1)}` };
  }
  try { const s = await wb(m.id); return { ...s, status: 'live', caption: `live, World Bank, ${s.years[0]}–${s.years.at(-1)}` }; }
  catch { const s = worldbank.indicators[m.id]; return { years: s.years, values: s.values, status: 'offline', caption: `offline, using saved data ${s.years[0]}–${s.years.at(-1)}` }; }
}

async function liveChart(m) {
  const src = document.getElementById(m.src);
  const full = await getSeries(m);
  const series = slice(full, m.since);
  lineChart(m.canvas, series.years, series.values, { color: m.color, fmt: m.fmt, fill: m.fill });
  const last = series.years[series.years.length - 1];
  const live = full.status === 'live';
  src.textContent = live ? `live, World Bank, latest ${last}` : `offline, using saved data to ${last}`;
  src.className = 'src ' + (live ? 'live' : 'err');
}

export function liveCharts() {
  METRICS.filter(m => m.canvas).forEach(liveChart);
}
