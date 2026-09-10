#!/usr/bin/env node
/* Pulls official MoSPI National Accounts series from the eSankhyiki API into src/data/mospi.json.

   Usage:  npm run refresh:mospi

   Endpoint: https://api.mospi.gov.in/api/nas/getNASData (documented at https://api.mospi.gov.in/nas).
   It answers server-side requests without a key but rejects cross-origin browser calls ("CORS blocked"),
   so this runs here / in GitHub Actions rather than in the page. Every row is stored as returned,
   because the API lists several vintages of the same quarter without a revision label — pick the one you
   want by hand when you update economy.json. Nothing on the page reads this file automatically. */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { constants } from 'node:crypto';

// api.mospi.gov.in still uses legacy TLS renegotiation, which OpenSSL 3 (Node 18+) refuses by default.
// fetch() offers no way to relax that, so use node:https with SSL_OP_LEGACY_SERVER_CONNECT.
const agent = new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT });
const getJSON = url => new Promise((resolve, reject) => {
  https.get(url, { agent, headers: { 'user-agent': 'india-growth-tracker refresh script', accept: 'application/json' } }, res => {
    let body = '';
    res.setEncoding('utf8').on('data', c => body += c).on('end', () => {
      if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`${url}: not JSON: ${body.slice(0, 200)}`)); }
    });
  }).on('error', reject);
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
    pages = body.meta_data?.totalPages ?? 1;
  }
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
writeFileSync(outPath, JSON.stringify(out, null, 2).replace(/\{\n\s+"year": ([\s\S]*?)\n\s+\}/g, m => m.replace(/\n\s+/g, ' ')) + '\n');
/* Derived long-run GDP series, 1950-51 to the latest year, all at 2011-12 prices:
   - 1950-51 … 2011-12 from the Back series (one row per year);
   - later years from the Current series rows with base_year 2011-12, taking the latest revision per year.
   Every point records the revision label it came from. Read by src/live.js for the compare panels. */
const REVISION_ORDER = ['First Advance Estimates', 'Second Advance Estimates', 'Provisional Estimates', 'First Revised Estimates',
  'Second Revised Estimates', 'Third Revised Estimates', 'Final Estimates', 'Additional Revision'];
const rank = r => { const i = REVISION_ORDER.indexOf(r); if (i < 0) console.warn(`unknown revision label "${r}" — ranked lowest`); return i; };
const fy = y => +y.slice(0, 4);
const points = new Map();
for (const r of results[SERIES.findIndex(s => s.id === 'gdp-level-annual-back')]) points.set(r.year, { year: r.year, nominal: +r.current_price, real: +r.constant_price, from: 'Back series' });
for (const r of results[SERIES.findIndex(s => s.id === 'gdp-level-annual')]) {
  if (r.base_year !== '2011-12' || fy(r.year) <= 2011) continue;
  const prev = points.get(r.year);
  if (!prev || rank(r.revision) > rank(prev.from)) points.set(r.year, { year: r.year, nominal: +r.current_price, real: +r.constant_price, from: r.revision });
}
const pts = [...points.values()].sort((a, b) => fy(a.year) - fy(b.year));
const longRun = {
  note: 'Derived by `npm run refresh:mospi` from src/data/mospi.json. Do not edit by hand.',
  name: 'GDP, ₹ crore, 1950-51 onward at 2011-12 prices',
  source: 'MoSPI National Accounts Statistics — Back series (2011-12 base) to 2011-12, then Current series rows with base year 2011-12, latest revision per year',
  sourceType: 'government',
  asOf: `${pts.at(-1).year} (${pts.at(-1).from}), fetched ${fetchedAt}`,
  base_year: '2011-12', unit: '₹ crore',
  years: pts.map(p => fy(p.year)),            // fiscal year start, for charting
  labels: pts.map(p => p.year),               // "1950-51"
  real: pts.map(p => p.real),                 // constant 2011-12 prices
  nominal: pts.map(p => p.nominal),           // current prices
  revision: pts.map(p => p.from)
};
writeFileSync(longRunPath, JSON.stringify(longRun, null, 2).replace(/\[\n\s+([\s\S]*?)\n\s+\]/g, (m, inner) => '[' + inner.split(/,\s*\n\s*/).join(', ') + ']') + '\n');
console.log(`gdp-long-run           ${pts.length} years, ${pts[0].year}–${pts.at(-1).year} (${pts.at(-1).from}) → ${longRunPath}`);

for (const [id, s] of Object.entries(series)) console.log(`${id.padEnd(22)} ${s.rows} rows, latest ${s.data[0]?.year} ${s.data[0]?.quarter ?? ''}`);
console.log(`Wrote ${outPath}`);
