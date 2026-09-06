/* Live World Bank series, with the saved copy in src/data/worldbank.json as the offline fallback. */
import { lineChart, INK, PEAC, fmtUSD } from './charts.js';
import worldbank from './data/worldbank.json';

const FALLBACK = worldbank.indicators;

async function wb(indicator, since = 1991) {
  const url = `https://api.worldbank.org/v2/country/IND/indicator/${indicator}?format=json&per_page=100&date=${since}:2030`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  const [, rows] = await res.json();
  const pts = rows.filter(r => r.value != null).map(r => ({ y: +r.date, v: r.value })).sort((a, b) => a.y - b.y);
  if (!pts.length) throw new Error('empty');
  return { years: pts.map(p => p.y), values: pts.map(p => p.v) };
}

async function liveChart(canvasId, srcId, indicator, opts, since) {
  const src = document.getElementById(srcId);
  let series, live = true;
  try { series = await wb(indicator, since); }
  catch (e) { series = FALLBACK[indicator]; live = false; }
  lineChart(canvasId, series.years, series.values, opts);
  const last = series.years[series.years.length - 1];
  src.textContent = live ? `live, World Bank, latest ${last}` : `offline, using saved data to ${last}`;
  src.className = 'src ' + (live ? 'live' : 'err');
}

export function liveCharts() {
  liveChart('c-gdp',  'src-gdp',  'NY.GDP.MKTP.CD', { color: INK,  fmt: fmtUSD, fill: true }, 1991);
  liveChart('c-pcap', 'src-pcap', 'NY.GDP.PCAP.CD', { color: INK,  fmt: v => '$' + Math.round(v).toLocaleString() }, 1991);
  liveChart('c-le',   'src-le',   'SP.DYN.LE00.IN', { color: PEAC, fmt: v => v.toFixed(1) + ' yrs' }, 1991);
  liveChart('c-net',  'src-net',  'IT.NET.USER.ZS', { color: PEAC, fmt: v => v.toFixed(0) + '%', fill: true }, 2000);
}
