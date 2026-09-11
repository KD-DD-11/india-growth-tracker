#!/usr/bin/env node
/* Pulls official MoSPI National Accounts series from the eSankhyiki API into src/data/mospi.json.

   Usage:  npm run refresh:mospi

   Endpoint: https://api.mospi.gov.in/api/nas/getNASData (documented at https://api.mospi.gov.in/nas).
   It answers server-side requests without a key but rejects cross-origin browser calls ("CORS blocked"),
   so this runs here / in GitHub Actions rather than in the page. Every row is stored as returned,
   because the API lists several vintages of the same quarter without a revision label — pick the one you
   want by hand when you update economy.json. Nothing on the page reads mospi.json automatically, but
   src/live.js DOES import the derived gdp-long-run.json for the compare panels.

   Both files are written only after every guard below passes, so a bad pull leaves the committed data
   untouched and exits non-zero rather than opening a pull request full of corrupt numbers. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { constants } from 'node:crypto';

// api.mospi.gov.in still uses legacy TLS renegotiation, which OpenSSL 3 (Node 18+) refuses by default.
// fetch() offers no way to relax that, so use node:https with SSL_OP_LEGACY_SERVER_CONNECT.
const agent = new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT });
// A socket-idle timer, so it covers both "handshake completes but headers never arrive" and
// "headers arrive but the body stalls". Without it a hung endpoint runs to the 6-hour job limit.
const REQUEST_TIMEOUT_MS = 30_000;
const getJSON = url => new Promise((resolve, reject) => {
  const req = https.get(url, { agent, headers: { 'user-agent': 'india-growth-tracker refresh script', accept: 'application/json' } }, res => {
    let body = '';
    res.setEncoding('utf8').on('data', c => body += c).on('end', () => {
      if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`${url}: not JSON: ${body.slice(0, 200)}`)); }
    });
  });
  req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`${url}: no data for ${REQUEST_TIMEOUT_MS / 1000}s — timed out`)));
  req.on('error', reject);
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src', 'data', 'mospi.json');
const longRunPath = join(root, 'src', 'data', 'gdp-long-run.json');
const BASE = 'https://api.mospi.gov.in/api/nas/getNASData';

// indicator_code → what it is. 22 = GDP growth rate (%), 5 = GDP level (₹ crore). Add more from the docs.
const SERIES = [
  // Back series: one row per year from 1950-51 to 2011-12, all at 2011-12 prices — the official long-run GDP series.
  { id: 'gdp-level-annual-back', indicator: 5, frequency: 'Annually', series: 'Back', label: 'GDP, ₹ crore, 1950-51 to 2011-12, back series at 2011-12 prices (current_price = nominal, constant_price = real)' },
  { id: 'gdp-growth-quarterly', indicator: 22, frequency: 'Quarterly', label: 'GDP growth rate, % y/y (constant_price = real, current_price = nominal)' },
  { id: 'gdp-growth-annual',    indicator: 22, frequency: 'Annually',  label: 'GDP growth rate, % (constant_price = real, current_price = nominal)' },
  { id: 'gdp-level-annual',     indicator: 5,  frequency: 'Annually',  label: 'GDP, ₹ crore (current and constant 2022-23 prices)' },
  { id: 'gdp-level-quarterly',  indicator: 5,  frequency: 'Quarterly', label: 'GDP, ₹ crore (current and constant 2022-23 prices)' }
];

async function pull({ indicator, frequency, series = 'Current' }) {
  const rows = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = `${BASE}?series=${series}&frequency_code=${frequency}&indicator_code=${indicator}&Format=JSON&page=${page}`;
    const body = await getJSON(url);
    if (!body.statusCode || !Array.isArray(body.data)) throw new Error(`${url}: ${JSON.stringify(body).slice(0, 200)}`);
    rows.push(...body.data);
    const total = body.meta_data?.totalPages;
    if (page === 1 && total == null) console.warn(`${url}: no meta_data.totalPages — assuming a single page (${body.data.length} rows)`);
    pages = total ?? 1;
  }
  // "HTTP 200 with an empty body" is the one failure the API can hand us that looks like success.
  // Treat it as an error so a bad pull can never overwrite good committed data.
  if (!rows.length) throw new Error(`${BASE} series=${series} indicator=${indicator} frequency=${frequency}: HTTP 200 but zero rows`);
  return rows;
}

const fetchedAt = new Date().toISOString().slice(0, 10);
const results = await Promise.all(SERIES.map(pull)); // any failure aborts, nothing is written
const series = {};
SERIES.forEach((s, i) => {
  const rows = results[i];
  series[s.id] = { label: s.label, indicator_code: s.indicator, frequency: s.frequency, series: s.series ?? 'Current', source: 'MoSPI National Accounts Statistics (eSankhyiki API)',
    asOf: `fetched ${fetchedAt}`, unit: rows[0]?.unit ?? null, base_year: rows[0]?.base_year ?? null, rows: rows.length,
    data: rows.map(r => ({ year: r.year, quarter: r.quarter ?? null, base_year: r.base_year, current_price: r.current_price, constant_price: r.constant_price, revision: r.revision ?? null })) };
});
const out = {
  note: 'Official MoSPI series pulled by `npm run refresh:mospi` for reference when updating economy.json. Rows are stored exactly as the API returns them; the same quarter can appear more than once (different estimate vintages, unlabeled). Do not edit by hand.',
  source: 'Ministry of Statistics and Programme Implementation, eSankhyiki API — https://api.mospi.gov.in/ (National Accounts Statistics)',
  fetchedAt, series
};
// Rendered now but written at the very end, together with gdp-long-run.json: a throw in the
// derivation below must not leave a refreshed mospi.json next to a stale derived series.
const mospiText = JSON.stringify(out, null, 2).replace(/\{\n\s+"year": ([\s\S]*?)\n\s+\}/g, m => m.replace(/\n\s+/g, ' ')) + '\n';

/* Derived long-run GDP series, 1950-51 to the latest year, all at 2011-12 prices:
   - 1950-51 … 2011-12 from the Back series (one row per year);
   - later years from the Current series rows with base_year 2011-12, taking the latest revision per year.
   Every point records the revision label it came from. Read by src/live.js for the compare panels. */
const REVISION_ORDER = ['First Advance Estimates', 'Second Advance Estimates', 'Provisional Estimates', 'First Revised Estimates',
  'Second Revised Estimates', 'Third Revised Estimates', 'Final Estimates', 'Additional Revision'];
const unknownRevisions = new Set();
// An unrecognised label is almost always a NEW vintage, so rank it above every known one rather than
// below the oldest (indexOf returns -1). The throw before the write is the real guard; this keeps the
// selection sane in the meantime.
const rank = r => { const i = REVISION_ORDER.indexOf(r); if (i < 0) { unknownRevisions.add(String(r)); return REVISION_ORDER.length; } return i; };
// `+null` and `+''` are both 0, which would publish a ₹0 crore GDP as if it were real. Anything that is
// not a positive finite number becomes null so the row can be excluded rather than silently zeroed.
const price = v => { const n = (v == null || v === '') ? NaN : +v; return Number.isFinite(n) && n > 0 ? n : null; };
const usable = r => price(r.current_price) !== null && price(r.constant_price) !== null;
const fy = y => +y.slice(0, 4);
const points = new Map();
for (const r of results[SERIES.findIndex(s => s.id === 'gdp-level-annual-back')]) {
  if (!usable(r)) { console.warn(`back series ${r.year}: unusable prices, skipped`); continue; }
  points.set(r.year, { year: r.year, nominal: price(r.current_price), real: price(r.constant_price), from: 'Back series' });
}
for (const r of results[SERIES.findIndex(s => s.id === 'gdp-level-annual')]) {
  if (r.base_year !== '2011-12' || fy(r.year) <= 2011) continue;
  // Skipping rather than nulling matters: a null-priced newer vintage must not displace a good older one.
  if (!usable(r)) { console.warn(`${r.year} ${r.revision}: unusable prices, vintage ignored`); continue; }
  const prev = points.get(r.year);
  // >= so that when every vintage of a year shares one label, the later row (the API returns a year
  // oldest-vintage-first) wins rather than the first one seen.
  if (!prev || rank(r.revision) >= rank(prev.from)) points.set(r.year, { year: r.year, nominal: price(r.current_price), real: price(r.constant_price), from: r.revision });
}
const pts = [...points.values()].sort((a, b) => fy(a.year) - fy(b.year));

/* Every guard below leaves BOTH committed files untouched and exits non-zero, so the workflow's
   create-pull-request step never runs on bad data. These series only ever grow, so anything that
   shortens or blanks them means the API answered badly, not that history changed. */
const last = pts.at(-1);
if (!last) throw new Error('derived long-run series is empty — refusing to write');

if (unknownRevisions.size) throw new Error(
  `MoSPI returned revision label(s) not in REVISION_ORDER: ${[...unknownRevisions].join(', ')}. ` +
  `Add them in vintage order in scripts/refresh-mospi.js and re-run; nothing was written.`);

const bad = pts.filter(p => !(p.real > 0) || !(p.nominal > 0));
if (bad.length) throw new Error(`refusing to write: non-positive GDP for ${bad.map(p => p.year).join(', ')}`);

if (existsSync(longRunPath)) {
  const prev = JSON.parse(readFileSync(longRunPath, 'utf8'));
  if (pts.length < prev.years.length) throw new Error(
    `long-run series would shrink from ${prev.years.length} to ${pts.length} points — refusing to write. ` +
    `Back-series rows returned: ${results[SERIES.findIndex(s => s.id === 'gdp-level-annual-back')].length}`);
  if (fy(pts[0].year) > prev.years[0]) throw new Error(
    `long-run series would start at ${pts[0].year} instead of ${prev.labels[0]} — refusing to write`);
}

// MoSPI is already dual-publishing a 2022-23 base. If a year exists only on that base, the 2011-12
// filter above would silently end the series early, so stop and let a human decide to rebase.
const newestRaw = results[SERIES.findIndex(s => s.id === 'gdp-level-annual')]
  .reduce((mx, r) => Math.max(mx, fy(r.year)), 0);
if (newestRaw > fy(last.year)) throw new Error(
  `MoSPI publishes ${newestRaw}-${String(newestRaw + 1).slice(2)} only on a base other than 2011-12, so the ` +
  `derived series would stop at ${last.year}. Decide whether to rebase before refreshing; nothing was written.`);

const longRun = {
  note: 'Derived by `npm run refresh:mospi` from src/data/mospi.json. Do not edit by hand.',
  name: 'GDP, ₹ crore, 1950-51 onward at 2011-12 prices',
  source: 'MoSPI National Accounts Statistics — Back series (2011-12 base) to 2011-12, then Current series rows with base year 2011-12, latest revision per year',
  sourceType: 'government',
  asOf: `${last.year} (${last.from}), fetched ${fetchedAt}`,
  base_year: '2011-12', unit: '₹ crore',
  years: pts.map(p => fy(p.year)),            // fiscal year start, for charting
  labels: pts.map(p => p.year),               // "1950-51"
  real: pts.map(p => p.real),                 // constant 2011-12 prices
  nominal: pts.map(p => p.nominal),           // current prices
  revision: pts.map(p => p.from)
};
writeFileSync(outPath, mospiText);
writeFileSync(longRunPath, JSON.stringify(longRun, null, 2).replace(/\[\n\s+([\s\S]*?)\n\s+\]/g, (m, inner) => '[' + inner.split(/,\s*\n\s*/).join(', ') + ']') + '\n');
console.log(`gdp-long-run           ${pts.length} years, ${pts[0].year}–${last.year} (${last.from}) → ${longRunPath}`);

for (const [id, s] of Object.entries(series)) console.log(`${id.padEnd(22)} ${s.rows} rows, latest ${s.data[0]?.year} ${s.data[0]?.quarter ?? ''}`);
console.log(`Wrote ${outPath}`);
