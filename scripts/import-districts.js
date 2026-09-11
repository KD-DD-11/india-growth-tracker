#!/usr/bin/env node
/* CSV → JSON importer for district-level map figures.

   Usage:  npm run import:districts -- path/to/file.csv [--metric pci] [--replace]

   CSV columns (header row required):  state,district,value_a,value_b
     state     must match the topojson `st_nm` property exactly
     district  must match the topojson `district` property exactly (within that state)
     value_a   figure for the metric's first column (e.g. 2014-15); blank = null
     value_b   figure for the metric's second column (e.g. 2023-24); blank = null

   Writes src/data/districts-<metric>.json as { State: { District: [a, b] } }, merging into what is
   already there (pass --replace to start from empty). If any state/district name does not match the
   boundary file, every mismatch is reported with the nearest names and nothing is written. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, loadTopo, stateNames, districtNames, nearest } from './lib/topo-names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--metric'));
const metricId = opt('--metric', 'pci');
const replace = args.includes('--replace');
if (!file) { console.error('usage: npm run import:districts -- <file.csv> [--metric pci] [--replace]'); process.exit(2); }

const metricPath = join(root, 'src', 'data', `map-${metricId}.json`);
if (!existsSync(metricPath)) { console.error(`No metric file ${metricPath}. Create it first (copy map-pci.json).`); process.exit(2); }
const outPath = join(root, 'src', 'data', `districts-${metricId}.json`);

const csv = readFileSync(file, 'utf8');
if (!csv.trim()) { console.error(`${file} is empty; nothing written.`); process.exit(2); }
const rows = parseCSV(csv);
const required = ['state', 'district', 'value_a', 'value_b'];
// This bail MUST precede the header check: without it, `'state' in rows[0]` throws on an empty body,
// and the old `rows.length &&` guard silently passed a header-only file straight through to --replace,
// which then emptied districts-<metric>.json and reported success.
if (!rows.length) { console.error(`${file} has a header but no data rows; nothing written.`); process.exit(2); }
const missing = required.filter(c => !(c in rows[0]));
if (missing.length) { console.error(`CSV header must be: ${required.join(',')} (missing: ${missing.join(', ')})`); process.exit(2); }

const topo = loadTopo(root);
const states = stateNames(root, topo), districts = districtNames(root, topo);
const num = x => { const s = (x ?? '').toString().replace(/[₹,\s%]/g, ''); if (s === '') return null; const v = Number(s); return Number.isFinite(v) ? v : NaN; };

const bad = [];
rows.forEach((r, i) => {
  const line = i + 2;
  if (!states.has(r.state)) { bad.push(`line ${line}: state "${r.state}" → did you mean: ${nearest(r.state, states).join(' | ')}`); return; }
  const ds = districts.get(r.state);
  if (!ds.has(r.district)) bad.push(`line ${line}: district "${r.district}" in ${r.state} → did you mean: ${nearest(r.district, ds).join(' | ')}`);
  for (const c of ['value_a', 'value_b']) if (Number.isNaN(num(r[c]))) bad.push(`line ${line}: ${c} "${r[c]}" is not a number`);
});
if (bad.length) {
  console.error(`\n${bad.length} problem(s) in ${file}; nothing written:\n`);
  bad.forEach(b => console.error('  ' + b));
  console.error('\nNames must match public/data/india.topojson exactly (Census 2011 spellings, e.g. "Odisha", "Bengaluru Urban" vs "Bangalore").\n');
  process.exit(1);
}

const out = replace || !existsSync(outPath) ? {} : JSON.parse(readFileSync(outPath, 'utf8'));
let n = 0;
for (const r of rows) {
  (out[r.state] = out[r.state] || {})[r.district] = [num(r.value_a), num(r.value_b)];
  n++;
}
writeFileSync(outPath, JSON.stringify(out, null, 2).replace(/\[\n\s+([^\]]+?)\n\s+\]/g, (m, inner) => '[' + inner.split(/,\s*\n\s*/).join(', ') + ']') + '\n');
const total = Object.values(out).reduce((a, s) => a + Object.keys(s).length, 0);
console.log(`Wrote ${n} row(s) into ${outPath} — now ${total} district(s) across ${Object.keys(out).length} state(s) for metric "${metricId}".`);
