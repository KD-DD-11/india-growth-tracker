/* Chart.js setup, shared helpers, and the embedded (hand-entered) charts and ledgers. */
import Chart from 'chart.js/auto';

/* ---------- theme colours, read from CSS custom properties ---------- */
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const INK = css('--ink'), SOFT = css('--ink-soft'), RULE = css('--rule'),
             MARI = css('--marigold'), PEAC = css('--peacock'), MADD = css('--madder');

Chart.defaults.font.family = '"DM Sans", system-ui, sans-serif';
Chart.defaults.color = SOFT;
Chart.defaults.borderColor = RULE;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = INK;
Chart.defaults.plugins.tooltip.titleFont = { family: '"DM Sans"', weight: '600' };
Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 };

export const fmtUSD = v => v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + ' tn' : '$' + Math.round(v / 1e9) + ' bn';
export const scaleX = { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } };
export const scaleY = (fmt) => ({ grid: { color: RULE, drawBorder: false }, ticks: { callback: fmt, maxTicksLimit: 5 }, border: { display: false } });

export function lineChart(id, labels, values, { color = INK, fmt = v => v, fill = false } = {}) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: color, borderWidth: 2, pointRadius: 0, pointHitRadius: 12, tension: .25, fill, backgroundColor: color + '14', spanGaps: false }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { x: scaleX, y: scaleY(fmt) },
      plugins: { tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } } }
  });
}

/* ---------- ledgers ---------- */
// Source line under each tile: "MoSPI · 31 Aug 2026" or "World Bank · 2022–23, from 16.2% in 2011–12".
export const sourceLine = r => `${r.source} · ${r.asOf}${r.note ? ', ' + r.note : ''}`;

export function ledger(id, rows) {
  document.getElementById(id).innerHTML = rows.map(r =>
    `<div><p class="n">${r.n}<small> ${r.unit}</small></p><p class="l">${r.l}</p><p class="s">${sourceLine(r)}</p></div>`).join('');
}

/* ---------- pulse ---------- */
export function pulse(p) {
  document.getElementById('pulse-n').innerHTML = p.value + '<small>' + p.unit + '</small>';
  document.getElementById('pulse-t').innerHTML = p.text + ` <span style="color:var(--ink-soft)">${p.source}, ${p.asOf}.</span>`;
}

/* ---------- then / now ----------
   The row's provenance line matches the ledger tiles: "source · asOf", linked when the row records the
   document it was read from. It used to print the date alone, so a reader could not tell where the
   figures came from even for the rows that had a source. */
export function thenNow(rows) {
  const provenance = r => {
    const text = r.source ? `${r.source} · ${r.asOf}` : r.asOf;
    return r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${text}</a>` : text;
  };
  document.querySelector('#thennow tbody').innerHTML = rows.map(r =>
    `<tr><td>${r.k}<br><span class="src" style="white-space:normal">${provenance(r)}</span></td><td class="num">${r.a}</td><td class="num">${r.b}</td><td class="delta">${r.d}</td></tr>`).join('');
}

/* ---------- embedded charts ---------- */
export function quartersChart(q) {
  return new Chart(document.getElementById('c-q'), {
    type: 'bar',
    data: { labels: q.labels, datasets: [{ data: q.values,
      backgroundColor: q.values.map((v, i) => v == null ? RULE : (i === q.values.length - 1 ? MARI : INK)), borderRadius: 2, maxBarThickness: 34 }] },
    options: { maintainAspectRatio: false, scales: { x: scaleX, y: { ...scaleY(v => v + '%'), beginAtZero: true } },
      plugins: { tooltip: { callbacks: { label: c => c.parsed.y == null ? 'not yet entered' : c.parsed.y + '% y/y' } } } }
  });
}

export function upiChart(upi) {
  return lineChart('c-upi', upi.labels, upi.values, { color: PEAC, fmt: v => v + ' bn', fill: true });
}

export function highwaysChart(h) {
  return new Chart(document.getElementById('c-nh'), {
    type: 'bar',
    data: { labels: h.labels, datasets: [
      { label: 'National highways', data: h.network, backgroundColor: INK, maxBarThickness: 64, borderRadius: 2 },
      { label: 'Expressways', data: h.expressways, backgroundColor: MARI, maxBarThickness: 64, borderRadius: 2 } ] },
    options: { maintainAspectRatio: false, scales: { x: scaleX, y: { ...scaleY(v => (v / 1000) + 'k'), beginAtZero: true } },
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toLocaleString('en-IN') + ' km' } } } }
  });
}
