#!/usr/bin/env node
/* Paste-in importer for the 2014-15 per-capita NSDP column of src/data/map-pci.json.

   Usage:  npm run import:pci -- path/to/file.csv [--metric pci] [--column a] [--status verified]

   CSV columns: state,value   (header row required; extra columns ignored; blank values skipped)
   State names must match public/data/india.topojson `st_nm` exactly — unmatched names are reported
   and nothing is written. Each imported state gets aStatus "verified" (override with --status). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, stateNames, reportUnmatched } from './lib/topo-names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
// The CSV path is the first bare token that is not the value of a value-taking flag. Without the
// flag set, `--metric pci` alone made "pci" look like the filename and produced a raw ENOENT stack
// instead of the usage message.
const VALUE_FLAGS = new Set(['--metric', '--column', '--status']);
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(args[i - 1])));
const metricId = opt('--metric', 'pci'), column = opt('--column', 'a'), status = opt('--status', 'verified');
if (!file) { console.error('usage: npm run import:pci -- <file.csv> [--metric pci] [--column a|b] [--status verified]'); process.exit(2); }

const path = join(root, 'src', 'data', `map-${metricId}.json`);
const metric = JSON.parse(readFileSync(path, 'utf8'));
const rows = parseCSV(readFileSync(file, 'utf8'));
const valid = stateNames(root);

const unmatched = rows.filter(r => !valid.has(r.state));
if (unmatched.length) { reportUnmatched(unmatched.map(r => r.state), valid, 'state'); process.exit(1); }

let n = 0;
for (const r of rows) {
  const raw = (r.value ?? r[Object.keys(r)[1]] ?? '').toString().replace(/[₹,\s]/g, '');
  if (raw === '') continue;
  const v = Number(raw);
  if (!Number.isFinite(v)) { console.error(`skip ${r.state}: "${raw}" is not a number`); continue; }
  metric.states[r.state] = metric.states[r.state] || { a: null, b: null, aStatus: 'none' };
  metric.states[r.state][column] = v;
  if (column === 'a') metric.states[r.state].aStatus = status;
  n++;
}
writeFileSync(path, JSON.stringify(metric, null, 2).replace(/\{\n\s+"a": ([^,]+),\n\s+"b": ([^,]+),\n\s+"aStatus": ("[a-z]+")\n\s+\}/g, '{ "a": $1, "b": $2, "aStatus": $3 }') + '\n');
console.log(`Wrote ${n} value(s) into column ${column} of ${path}`);
console.log('Now run `npm run check:data` to see what is still unverified.');
