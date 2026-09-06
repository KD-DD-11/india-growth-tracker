/* Shared helpers: read state/district names from public/data/india.topojson, tiny CSV parser,
   and a report of unmatched names with nearest suggestions. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadTopo(root) {
  return JSON.parse(readFileSync(join(root, 'public', 'data', 'india.topojson'), 'utf8'));
}
export function stateNames(root, topo = loadTopo(root)) {
  return new Set(topo.objects.states.geometries.map(g => g.properties.st_nm));
}
/** Map of state → Set of district names, from the `district` property. */
export function districtNames(root, topo = loadTopo(root)) {
  const m = new Map();
  for (const g of topo.objects.districts.geometries) {
    const { st_nm, district } = g.properties;
    if (!m.has(st_nm)) m.set(st_nm, new Set());
    m.get(st_nm).add(district);
  }
  return m;
}

/** Minimal RFC-4180-ish CSV parser: quoted fields, commas inside quotes, CRLF. Returns objects keyed by header. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(x => x.trim() !== ''));
  const keys = header.map(h => h.trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function nearest(name, candidates, k = 3) {
  const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
  return [...candidates].map(c => ({ c, d: levenshtein(norm(name), norm(c)) })).sort((x, y) => x.d - y.d).slice(0, k).map(x => x.c);
}
export function reportUnmatched(names, candidates, kind) {
  console.error(`\n${names.length} ${kind} name(s) do not match public/data/india.topojson:\n`);
  for (const n of names) console.error(`  "${n}"  → did you mean: ${nearest(n, candidates).join(' | ')}`);
  console.error(`\nFix the names (they must match the topojson exactly) and re-run. Nothing was written.\n`);
}
