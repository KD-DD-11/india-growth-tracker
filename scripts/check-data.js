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
  for (const col of ['a', 'b']) {
    const st = m.india[col + 'Status'];
    if (!['verified', 'approximate', 'none'].includes(st)) problems.push(`${file} india: ${col}Status must be verified | approximate | none`);
    if (st === 'approximate') approximate.push({ file, name: 'India (all-India baseline)', col, label: m.columns[col].label, v: m.india[col] });
  }
  for (const [name, s] of Object.entries(m.states)) {
    for (const col of ['a', 'b']) {
      const st = s[col + 'Status'], v = s[col], label = m.columns[col].label;
      if (!['verified', 'approximate', 'none'].includes(st)) problems.push(`${file} ${name}: ${col}Status must be verified | approximate | none`);
      if (st === 'approximate') approximate.push({ file, name, col, label, v });
      if (st === 'approximate' && v == null) problems.push(`${file} ${name}: ${col}Status "approximate" but ${col} is null — use "none" instead`);
      if (st === 'none' && v != null) problems.push(`${file} ${name}: ${col}Status "none" but ${col} = ${v}`);
      if (st === 'verified' && v == null) problems.push(`${file} ${name}: ${col}Status "verified" but ${col} is null`);
    }
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
  console.log(`\n${approximate.length} figure(s) are NOT published on the map because they have not been checked against the cited source:\n`);
  for (const { name, col, label, v } of approximate) console.log(`  ${(name + ' (' + label + ')').padEnd(46)} currently ${v == null ? '(no value)' : v.toLocaleString('en-IN')}  [${col}Status]`);
  console.log('\nPaste the checked column into a CSV (state,value) and run: npm run import:pci -- <file.csv> [--column a|b]');
  console.log('A template with every state name is in scripts/templates/pci-2014-15.csv\n');
}
