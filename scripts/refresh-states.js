#!/usr/bin/env node
/* Pulls state-wise National Accounts indicators from MoSPI's eSankhyiki API into src/data/states.json,
   the data behind the three-map comparator.

   Usage:  npm run refresh:states

   Each indicator gives one row per state per fiscal year with a current-price and a constant-price
   (2011-12) value. The file is keyed by the state names used in public/data/india.topojson so the map can
   join on them directly; any MoSPI name that does not map to a topojson state aborts the run.
   Guards mirror refresh-mospi.js: an empty pull, a duplicate state-year, or a file that would shrink all
   abort before anything is written. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { constants } from 'node:crypto';
import { loadTopo, stateNames, nearest } from './lib/topo-names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src', 'data', 'states.json');
const BASE = 'https://api.mospi.gov.in/api/nas/getNASData';

// MoSPI spells a few states differently from the Census 2011 boundary file.
const NAME_MAP = { 'Andaman & Nicobar Islands': 'Andaman and Nicobar Islands', 'Jammu & Kashmir': 'Jammu and Kashmir' };

/* indicator_code → metric. `kind` "level" values must be positive; "rate" values may be negative.
   For levels, current = current prices and constant = 2011-12 prices. For rates, current = nominal
   growth and constant = real growth. */
export const METRICS = [
  // Per-capita NSDP is published twice. Indicator 25 agrees with RBI's Handbook to the rupee but lacks four
  // states; indicator 32 covers all 34 but, for Karnataka, repeats the per-capita GSDP column (indicator 31)
  // in every year — about 10% too high. So 25 is primary, 32 fills the gaps, and where both exist they must
  // agree within ₹2 or the run aborts; a state whose 32 value is silently wrong therefore never gets in.
  { id: 'pcnsdp',      indicator: 25, fallback: 32, kind: 'level', unit: '₹', name: 'Income per person (per capita NSDP)' },
  { id: 'pcgsdp',      indicator: 31, kind: 'level', unit: '₹',       name: 'Output per person (per capita GSDP)' },
  { id: 'gsdp',        indicator: 23, kind: 'level', unit: '₹ crore', name: 'Size of the economy (GSDP)' },
  { id: 'gsdp-growth', indicator: 26, kind: 'rate',  unit: '%',       name: 'Growth of the economy (GSDP growth, year on year)' },
  { id: 'pcnsdp-growth', indicator: 28, kind: 'rate', unit: '%',      name: 'Growth in income per person (per capita NSDP growth)' }
];

const agent = new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT }); // legacy TLS renegotiation
const getJSON = url => new Promise((resolve, reject) => {
  const req = https.get(url, { agent, headers: { 'user-agent': 'india-growth-tracker refresh script', accept: 'application/json' } }, res => {
    let body = '';
    res.setEncoding('utf8').on('data', c => body += c).on('end', () => {
      if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`${url}: not JSON: ${body.slice(0, 200)}`)); }
    });
  });
  req.setTimeout(30_000, () => req.destroy(new Error(`${url}: no data for 30s — timed out`)));
  req.on('error', reject);
});

async function pull(indicator) {
  const rows = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = `${BASE}?series=Current&frequency_code=Annually&indicator_code=${indicator}&Format=JSON&page=${page}`;
    const body = await getJSON(url);
    if (!body.statusCode || !Array.isArray(body.data)) throw new Error(`${url}: ${JSON.stringify(body).slice(0, 200)}`);
    rows.push(...body.data);
    pages = body.meta_data?.totalPages ?? 1;
  }
  if (!rows.length) throw new Error(`indicator ${indicator}: HTTP 200 but zero rows`);
  return rows;
}

const num = (v, kind) => {
  if (v == null || v === '' || v === 'nan') return null;
  const n = +String(v).replace(/,/g, '');
  if (!Number.isFinite(n)) return null;
  return kind === 'level' ? (n > 0 ? n : null) : n;
};

const fetchedAt = new Date().toISOString().slice(0, 10);
const topo = loadTopo(root), valid = stateNames(root, topo);
const results = await Promise.all(METRICS.map(m => pull(m.indicator)));
const fallbacks = await Promise.all(METRICS.map(m => m.fallback ? pull(m.fallback) : null));
const provenance = {}; // metric → state → indicator the value came from, where it is not the primary

const years = new Set(), states = new Set(), unmatched = new Set();
const metrics = {};
METRICS.forEach((m, i) => {
  const rows = results[i];
  const first = rows[0];
  const values = { current: {}, constant: {} };
  const seen = new Set();
  for (const r of rows) {
    const name = NAME_MAP[r.state] ?? r.state;
    if (!valid.has(name)) { unmatched.add(r.state); continue; }
    const key = name + '|' + r.year;
    if (seen.has(key)) throw new Error(`indicator ${m.indicator}: duplicate row for ${name} ${r.year} — the API now returns several vintages; the script needs a revision rule before it can be trusted`);
    seen.add(key);
    if (r.base_year !== '2011-12') throw new Error(`indicator ${m.indicator}: unexpected base year ${r.base_year} for ${name} ${r.year}`);
    const cur = num(r.current_price, m.kind), con = num(r.constant_price, m.kind);
    if (cur == null && con == null) continue;
    years.add(r.year); states.add(name);
    if (cur != null) (values.current[name] ??= {})[r.year] = cur;
    if (con != null) (values.constant[name] ??= {})[r.year] = con;
  }
  if (fallbacks[i]) {
    const primaryStates = new Set(Object.keys(values.current));
    let filled = 0, conflicts = [];
    for (const r of fallbacks[i]) {
      const name = NAME_MAP[r.state] ?? r.state;
      if (!valid.has(name)) continue;
      const cur = num(r.current_price, m.kind), con = num(r.constant_price, m.kind);
      if (primaryStates.has(name)) {
        const p = values.current[name]?.[r.year];
        if (p != null && cur != null && Math.abs(p - cur) > 2) conflicts.push(`${name} ${r.year}: ${m.indicator}=${p} vs ${m.fallback}=${cur}`);
        continue;
      }
      if (cur == null && con == null) continue;
      years.add(r.year); states.add(name);
      if (cur != null) (values.current[name] ??= {})[r.year] = cur;
      if (con != null) (values.constant[name] ??= {})[r.year] = con;
      (provenance[m.id] ??= {})[name] = m.fallback; filled++;
    }
    console.log(`  ${m.id}: indicator ${m.indicator} primary, ${filled} state-year(s) filled from indicator ${m.fallback}; ${conflicts.length} conflict(s) where both exist`);
    // Karnataka is the one known conflict (32 repeats the GSDP column); anything else is new and must be looked at.
    const unexpected = conflicts.filter(c => !c.startsWith('Karnataka '));
    if (unexpected.length) throw new Error(`indicators ${m.indicator}/${m.fallback} disagree beyond rounding for:\n  ${unexpected.join('\n  ')}\nnothing written`);
  }
  metrics[m.id] = { name: m.name, indicator: m.indicator, fallbackIndicator: m.fallback ?? null, indicatorName: first.indicator, kind: m.kind, unit: m.unit,
    source: 'MoSPI National Accounts Statistics, state-wise series (eSankhyiki API)', sourceType: 'government',
    asOf: `fetched ${fetchedAt}`, url: `https://api.mospi.gov.in/nas (indicator ${m.indicator})`,
    prices: m.kind === 'level' ? { current: 'current prices', constant: 'constant 2011-12 prices' } : { current: 'nominal', constant: 'real (2011-12 prices)' },
    values, filledFrom: provenance[m.id] ?? {} };
});
if (unmatched.size) {
  for (const n of unmatched) console.error(`  MoSPI state "${n}" does not match the topojson → nearest: ${nearest(n, valid).join(' | ')}`);
  throw new Error(`${unmatched.size} MoSPI state name(s) unmatched; add them to NAME_MAP in scripts/refresh-states.js. Nothing written.`);
}

const out = {
  note: 'State-wise MoSPI National Accounts series behind the map comparator. Generated by `npm run refresh:states` — do not edit by hand. Values keyed by the state names in public/data/india.topojson.',
  source: 'Ministry of Statistics and Programme Implementation, eSankhyiki API — https://api.mospi.gov.in/nas, state-wise indicators',
  sourceType: 'government', fetchedAt, base_year: '2011-12',
  years: [...years].sort(), states: [...states].sort(),
  metrics
};

if (existsSync(outPath)) {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  const count = o => Object.values(o.metrics).reduce((a, m) => a + Object.values(m.values.current).reduce((b, s) => b + Object.keys(s).length, 0), 0);
  if (count(out) < count(prev)) throw new Error(`states.json would shrink from ${count(prev)} to ${count(out)} values — refusing to write`);
  if (out.years[0] > prev.years[0]) throw new Error(`states.json would start at ${out.years[0]} instead of ${prev.years[0]} — refusing to write`);
}

writeFileSync(outPath, JSON.stringify(out, null, 1).replace(/\{\n\s+("\d{4}-\d{2}": [^{}]*?)\n\s+\}/g, (m, inner) => '{ ' + inner.replace(/,\n\s+/g, ', ') + ' }') + '\n');
console.log(`${out.states.length} states, ${out.years[0]}–${out.years.at(-1)}, ${Object.keys(metrics).length} metrics → ${outPath}`);
for (const [id, m] of Object.entries(metrics)) {
  const perYear = out.years.map(y => Object.values(m.values.current).filter(s => s[y] != null).length);
  console.log(`  ${id.padEnd(14)} ${m.indicatorName.padEnd(36)} states/year: ${perYear.join(' ')}`);
}
