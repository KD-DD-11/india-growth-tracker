import './styles.css';
import pulseData from './data/pulse.json';
import economy from './data/economy.json';
import infra from './data/infra.json';
import society from './data/society.json';
import { ledger, pulse, thenNow, quartersChart, upiChart, highwaysChart } from './charts.js';
import { liveCharts } from './live.js';
import { initMap } from './map.js';

/* ---------- ledgers, pulse, then/now ---------- */
ledger('ledger-econ', economy.ledger);
ledger('ledger-infra', infra.ledger);
ledger('ledger-soc', society.ledger);
pulse(pulseData);
thenNow(infra.thenNow);

/* ---------- embedded charts ---------- */
quartersChart(economy.quarters);
upiChart(infra.upi);
highwaysChart(infra.highways);

/* ---------- live World Bank series ---------- */
liveCharts();

/* ---------- state / district map ---------- */
initMap();

/* ---------- nav highlight ---------- */
const links = [...document.querySelectorAll('nav a')];
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) links.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('main section').forEach(s => io.observe(s));
