/* Access layer for src/data/states.json — MoSPI's state-wise National Accounts series behind the map
   comparator. Everything the comparator needs to know about a metric lives here, so the UI module can stay
   about layout and interaction.

   A "basis" is 'current' (current prices / nominal growth) or 'constant' (2011-12 prices / real growth). */
import data from './data/states.json';

export const STATES = data;
export const YEARS = data.years;                 // fiscal years, "2011-12" … ascending
export const METRICS = Object.entries(data.metrics).map(([id, m]) => ({ id, ...m }));
export const metric = id => METRICS.find(m => m.id === id);

/** One state's value, or null when the source has none for that year. */
export const value = (id, basis, state, year) => data.metrics[id]?.values[basis]?.[state]?.[year] ?? null;

/** { State: value } for every state that has a value in that year. */
export function slice(id, basis, year) {
  const out = {};
  for (const [state, byYear] of Object.entries(data.metrics[id].values[basis])) if (byYear[year] != null) out[state] = byYear[year];
  return out;
}

/** Years in which a metric has at least one value, ascending. */
export function yearsFor(id, basis = 'current') {
  const ys = new Set();
  for (const byYear of Object.values(data.metrics[id].values[basis])) for (const y of Object.keys(byYear)) ys.add(y);
  return [...ys].sort();
}

/** How many states carry a value for that metric and year — shown to the reader when it is thin. */
export const coverage = (id, basis, year) => Object.keys(slice(id, basis, year)).length;

/** Fixed colour domain for a metric+basis across EVERY state and EVERY year, so two panels showing the same
    metric in different years share one scale and the shift is visible. Rates get a symmetric domain around
    zero so a diverging scale reads correctly. */
export function domain(id, basis) {
  const m = data.metrics[id];
  const all = Object.values(m.values[basis]).flatMap(byYear => Object.values(byYear));
  let lo = Math.min(...all), hi = Math.max(...all);
  if (m.kind === 'rate') { const a = Math.max(Math.abs(lo), Math.abs(hi)); lo = -a; hi = a; }
  return [lo, hi];
}

/** Multiple and compound annual rate between two years of a level metric; null if either end is missing. */
export function change(id, basis, state, fromYear, toYear) {
  const a = value(id, basis, state, fromYear), b = value(id, basis, state, toYear);
  if (!(a > 0) || !(b > 0)) return null;
  const n = fy(toYear) - fy(fromYear);
  return { ratio: b / a, cagr: n > 0 ? Math.pow(b / a, 1 / n) - 1 : null, from: a, to: b, years: n };
}

export const fy = y => +String(y).slice(0, 4);   // "2014-15" → 2014

/* ---------- formatting, matching the rest of the site ---------- */
const inr = v => Math.round(v).toLocaleString('en-IN');
export function fmt(id, v, { basis = 'current' } = {}) {
  if (v == null) return '—';
  const m = data.metrics[id];
  if (m.kind === 'rate') return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  if (m.unit === '₹ crore') return v >= 1e5 ? '₹' + (v / 1e5).toFixed(2) + ' L cr' : '₹' + inr(v) + ' cr';
  return v >= 1e5 ? '₹' + (v / 1e5).toFixed(2) + ' L' : '₹' + inr(v);    // per-person rupees
}
/** Shorter form for legend ends and axis ticks. */
export function fmtShort(id, v) {
  if (v == null) return '—';
  const m = data.metrics[id];
  if (m.kind === 'rate') return (v > 0 ? '+' : '') + v.toFixed(0) + '%';
  if (m.unit === '₹ crore') return v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L cr' : '₹' + Math.round(v / 1000) + 'k cr';
  return v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L' : '₹' + Math.round(v / 1000) + 'k';
}
export const basisLabel = (id, basis) => data.metrics[id].prices[basis];
