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
const BASE = 'https://api.mospi.gov.in/api/nas/getNASData';

// indicator_code → what it is. 22 = GDP growth rate (%), 5 = GDP level (₹ crore). Add more from the docs.
const SERIES = [
  { id: 'gdp-growth-quarterly', indicator: 22, frequency: 'Quarterly', label: 'GDP growth rate, % y/y (constant_price = real, current_price = nominal)' },
  { id: 'gdp-growth-annual',    indicator: 22, frequency: 'Annually',  label: 'GDP growth rate, % (constant_price = real, current_price = nominal)' },
  { id: 'gdp-level-annual',     indicator: 5,  frequency: 'Annually',  label: 'GDP, ₹ crore (current and constant 2022-23 prices)' },
  { id: 'gdp-level-quarterly',  indicator: 5,  frequency: 'Quarterly', label: 'GDP, ₹ crore (current and constant 2022-23 prices)' }
];

async function pull({ indicator, frequency }) {
  const rows = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = `${BASE}?series=Current&frequency_code=${frequency}&indicator_code=${indicator}&Format=JSON&page=${page}`;
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
  series[s.id] = { label: s.label, indicator_code: s.indicator, frequency: s.frequency, source: 'MoSPI National Accounts Statistics (eSankhyiki API)',
    asOf: `fetched ${fetchedAt}`, unit: rows[0]?.unit ?? null, base_year: rows[0]?.base_year ?? null, rows: rows.length,
    data: rows.map(r => ({ year: r.year, quarter: r.quarter ?? null, current_price: r.current_price, constant_price: r.constant_price, revision: r.revision ?? null })) };
});
const out = {
  note: 'Official MoSPI series pulled by `npm run refresh:mospi` for reference when updating economy.json. Rows are stored exactly as the API returns them; the same quarter can appear more than once (different estimate vintages, unlabeled). Do not edit by hand.',
  source: 'Ministry of Statistics and Programme Implementation, eSankhyiki API — https://api.mospi.gov.in/ (National Accounts Statistics)',
  fetchedAt, series
};
writeFileSync(outPath, JSON.stringify(out, null, 2).replace(/\{\n\s+"year": ([\s\S]*?)\n\s+\}/g, m => m.replace(/\n\s+/g, ' ')) + '\n');
for (const [id, s] of Object.entries(series)) console.log(`${id.padEnd(22)} ${s.rows} rows, latest ${s.data[0]?.year} ${s.data[0]?.quarter ?? ''}`);
console.log(`Wrote ${outPath}`);
