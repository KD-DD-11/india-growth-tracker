/* Live World Bank series, with the saved copy in src/data/worldbank.json as the offline fallback.
   Each indicator is fetched once (full history) and shared by the section charts and the compare panels. */
import { lineChart, INK, PEAC, fmtUSD } from './charts.js';
import worldbank from './data/worldbank.json';

/* The series the page knows about. `since` is where the section chart starts; `kind` says how the
   compare panels summarise a window: 'ratio' (×, % a year) or 'delta' (+ units, per year). */
export const METRICS = [
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
/** Full history for an indicator: { years, values, live }. Live if the API answered, else the saved file. */
export function getSeries(indicator) {
  if (!cache.has(indicator)) cache.set(indicator, wb(indicator).then(s => ({ ...s, live: true }))
    .catch(() => ({ ...worldbank.indicators[indicator], live: false })));
  return cache.get(indicator);
}

async function liveChart(m) {
  const src = document.getElementById(m.src);
  const full = await getSeries(m.id);
  const series = slice(full, m.since);
  lineChart(m.canvas, series.years, series.values, { color: m.color, fmt: m.fmt, fill: m.fill });
  const last = series.years[series.years.length - 1];
  src.textContent = full.live ? `live, World Bank, latest ${last}` : `offline, using saved data to ${last}`;
  src.className = 'src ' + (full.live ? 'live' : 'err');
}

export function liveCharts() {
  METRICS.forEach(liveChart);
}
