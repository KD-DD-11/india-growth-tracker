#!/usr/bin/env node
/* Checks every state name in src/data/map-*.json and every state/district name in
   src/data/districts-*.json against public/data/india.topojson. Reports unmatched names
   with the nearest candidates; exit code 1 if any are found. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopo, stateNames, districtNames, nearest } from './lib/topo-names.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');
const topo = loadTopo(root);
const states = stateNames(root, topo), districts = districtNames(root, topo);
const bad = [];

for (const f of readdirSync(dataDir)) {
  const d = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  if (/^map-.*\.json$/.test(f)) {
    for (const s of Object.keys(d.states)) if (!states.has(s)) bad.push(`${f}: state "${s}" → ${nearest(s, states).join(' | ')}`);
    const missing = [...states].filter(s => !(s in d.states));
    if (missing.length) console.log(`${f}: ${missing.length} topojson state(s) have no entry (will render grey): ${missing.join(', ')}`);
  }
  if (/^districts-.*\.json$/.test(f)) {
    for (const [s, ds] of Object.entries(d)) {
      if (!states.has(s)) { bad.push(`${f}: state "${s}" → ${nearest(s, states).join(' | ')}`); continue; }
      for (const dn of Object.keys(ds)) if (!districts.get(s).has(dn)) bad.push(`${f}: district "${dn}" in ${s} → ${nearest(dn, districts.get(s)).join(' | ')}`);
    }
  }
}

if (bad.length) { console.error(`\n${bad.length} name(s) do not match the topojson:\n`); bad.forEach(b => console.error('  ' + b)); process.exit(1); }
console.log(`All state and district names in src/data match public/data/india.topojson (${states.size} states, ${topo.objects.districts.geometries.length} district polygons).`);
