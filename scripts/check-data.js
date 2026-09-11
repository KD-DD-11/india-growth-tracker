#!/usr/bin/env node
/* Data hygiene check for src/data/*.json.
   - every figure must carry `source` and `asOf`
   - lists map states whose 2014-15 column is still "approximate" (verify against RBI Handbook of
     Statistics on Indian States, Table 19 — per capita NSDP, current prices)
   Exit code 1 if anything is missing, so it can gate CI. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');
const read = f => JSON.parse(readFileSync(join(dataDir, f), 'utf8'));

const problems = [];
const need = (obj, where, fields = ['source', 'asOf']) => {
  for (const f of fields) if (obj[f] == null || obj[f] === '') problems.push(`${where}: missing ${f}`);
};

// pulse
need(read('pulse.json'), 'pulse.json');

// section files: ledgers, series, then/now
for (const file of ['economy.json', 'infra.json', 'society.json']) {
  const d = read(file);
  (d.ledger || []).forEach((r, i) => need(r, `${file} ledger[${i}] "${r.l}"`));
  for (const k of ['quarters', 'upi', 'highways']) if (d[k]) need(d[k], `${file} ${k}`);
  (d.thenNow || []).forEach((r, i) => need(r, `${file} thenNow[${i}] "${r.k}"`));
}

// derived MoSPI long-run GDP series
const lr = read('gdp-long-run.json');
need(lr, 'gdp-long-run.json');
if (lr.years.length !== lr.real.length || lr.years.length !== lr.labels.length) problems.push('gdp-long-run.json: years/labels/real arrays differ in length');

// world bank fallbacks
const wb = read('worldbank.json');
need(wb, 'worldbank.json', ['source']);
for (const [id, ind] of Object.entries(wb.indicators)) need(ind, `worldbank.json ${id}`);
if (!wb.fetchedAt) problems.push('worldbank.json: fetchedAt is null — run `npm run refresh` to replace the hand-typed fallbacks');

// map metrics
const approximate = [];
for (const file of readdirSync(dataDir).filter(f => /^map-.*\.json$/.test(f))) {
  const m = read(file);
  for (const c of ['a', 'b']) need(m.columns[c], `${file} columns.${c}`, ['label', 'source', 'asOf']);
  need(m.india, `${file} india`);
  for (const [name, s] of Object.entries(m.states)) {
    if (!['verified', 'approximate', 'none'].includes(s.aStatus)) problems.push(`${file} ${name}: aStatus must be verified | approximate | none`);
    if (s.aStatus === 'approximate') approximate.push({ file, name, a: s.a });
    if (s.aStatus === 'approximate' && s.a == null) problems.push(`${file} ${name}: aStatus "approximate" but a is null — use "none" instead`);
    if (s.aStatus === 'none' && s.a != null) problems.push(`${file} ${name}: aStatus "none" but a = ${s.a}`);
  }
}

// sourceType audit: the site aims to use official Indian government figures only.
const nonGov = [];
const walk = (o, where) => {
  if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${where}[${i}]`));
  if (o && typeof o === 'object') {
    if ('source' in o && o.sourceType !== 'government') nonGov.push(`${where} — ${o.sourceType ?? 'no sourceType'}: ${o.source ?? '(no source)'}`);
    for (const [k, v] of Object.entries(o)) if (k !== 'indicators') walk(v, `${where}.${k}`);
  }
};
for (const f of ['pulse.json', 'economy.json', 'infra.json', 'society.json', 'map-pci.json', 'gdp-long-run.json']) walk(read(f), f);
walk(read('worldbank.json').indicators, 'worldbank.json.indicators');
if (nonGov.length) {
  console.log(`\n${nonGov.length} figure(s) are not from an Indian government source (see docs/sources.md for the official alternative):\n`);
  for (const n of nonGov) console.log('  ' + n);
  console.log('');
}

/* Report. `problems` prints first and sets a failing exit code without returning, so the advisory
   sections below still run — an early process.exit() here used to swallow them, and vice versa. */
if (problems.length) {
  console.error('Data problems:');
  for (const p of problems) console.error('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('All figures carry source and asOf.');
}

if (approximate.length) {
  console.log(`\n${approximate.length} state(s) are NOT published on the map because the ${read('map-pci.json').columns.a.label} column is still unverified. Check them against RBI Handbook of Statistics on Indian States, Table 19 (per capita NSDP, current prices):\n`);
  for (const { name, a } of approximate) console.log(`  ${name.padEnd(42)} currently ${a == null ? '(no value)' : a.toLocaleString('en-IN')}`);
  console.log('\nPaste the corrected column into a CSV (state,value) and run: npm run import:pci -- <file.csv>');
  console.log('A template with every state name is in scripts/templates/pci-2014-15.csv\n');
}
